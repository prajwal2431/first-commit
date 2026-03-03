import os

from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_diagnostic_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from .model.load import load_model

# Short-term memory (checkpoint persistence): use when MEMORY_ID is set (e.g. by Terraform at runtime)
MEMORY_ID = os.getenv("MEMORY_ID", "RCAagent_Memory-ExBO3RGgSy")
REGION = os.getenv("AWS_REGION", "eu-west-2")

# Initialize memory components (eager init when MEMORY_ID is set; LangChain/LangGraph AWS integrations)
checkpointer = None
store = None
if MEMORY_ID:
    try:
        from langgraph_checkpoint_aws import AgentCoreMemorySaver, AgentCoreMemoryStore
        checkpointer = AgentCoreMemorySaver(memory_id=MEMORY_ID, region_name=REGION)
        store = AgentCoreMemoryStore(memory_id=MEMORY_ID, region_name=REGION)
    except Exception:
        checkpointer = None
        store = None

# Always use AgentCore Gateway for MCP tools (requires GATEWAY_URL and COGNITO_* in .env)
mcp_client = deployed_get_tools()
llm = load_model()

app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    """Run Diagnostic Analyst: decompose revenue drop, rank drivers, drill down by segment, return DiagnosticResult.
    All tools come from the AgentCore Gateway (Lambda). Pass sheet_url in payload to query data from a Google Sheet."""
    prompt = payload.get("prompt", "Revenue dropped WoW. Decompose and rank drivers.")
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"
    sheet_url = payload.get("sheet_url", "")

    all_tools = await mcp_client.get_tools()
    graph = create_diagnostic_graph(llm, all_tools, checkpointer=checkpointer)

    initial_state = {"messages": [HumanMessage(content=prompt)]}
    if sheet_url:
        initial_state["sheet_url"] = sheet_url

    config = {"configurable": {"thread_id": thread_id, "actor_id": actor_id}}
    result = await graph.ainvoke(initial_state, config=config)

    messages = result.get("messages") or []
    last_content = ""
    for m in reversed(messages):
        if hasattr(m, "content") and getattr(m, "type", "") != "human":
            last_content = m.content or ""
            break
    if not last_content and messages:
        last_content = getattr(messages[-1], "content", str(messages[-1]))

    out = {"result": last_content}
    if result.get("contribution_scores"):
        out["ranked_drivers"] = result["contribution_scores"]
    if result.get("kpi_slices"):
        out["kpi_slices"] = result["kpi_slices"]
    if result.get("segment_breakdowns"):
        out["segment_breakdowns"] = result["segment_breakdowns"]
    if result.get("data_quality_gaps"):
        out["data_quality_gaps"] = result["data_quality_gaps"]
    if result.get("evidence"):
        out["evidence"] = result["evidence"]
    if result.get("reasoning_log"):
        out["reasoning_log"] = result["reasoning_log"]
    if result.get("column_mapping"):
        out["column_mapping"] = result["column_mapping"]
    return out


if __name__ == "__main__":
    app.run()
