import os
from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_diagnostic_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from .tools.query_data import query_business_data
from .tools.contribution import calculate_contribution_score
from .model.load import load_model

if os.getenv("LOCAL_DEV") == "1":
    async def _local_no_tools():
        return []
    mcp_client = _local_no_tools
else:
    mcp_client = deployed_get_tools()

llm = load_model()

# Diagnostic tools (required by create_diagnostic_graph)
DIAGNOSTIC_TOOLS = [query_business_data, calculate_contribution_score]

app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    """Run Diagnostic Analyst: decompose revenue drop, rank drivers, drill down by segment, return DiagnosticResult."""
    prompt = payload.get("prompt", "Revenue dropped WoW. Decompose and rank drivers.")
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"

    if hasattr(mcp_client, "get_tools"):
        mcp_tools = await mcp_client.get_tools()
    else:
        mcp_tools = await mcp_client()
    all_tools = mcp_tools + DIAGNOSTIC_TOOLS

    graph = create_diagnostic_graph(llm, all_tools, checkpointer=None)

    initial_state = {"messages": [HumanMessage(content=prompt)]}
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
    return out


if __name__ == "__main__":
    app.run()
