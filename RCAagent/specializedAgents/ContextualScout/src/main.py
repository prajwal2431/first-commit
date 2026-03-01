import os
from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_scout_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from .tools.social_signal_analyzer import social_signal_analyzer
from .tools.marketplace_api_fetcher import marketplace_api_fetcher
from .tools.inventory_mismatch_checker import inventory_mismatch_checker
from .model.load import load_model

if os.getenv("LOCAL_DEV") == "1":
    async def _local_no_tools():
        return []
    mcp_client = _local_no_tools
else:
    mcp_client = deployed_get_tools()

llm = load_model()

# Contextual Scout tools (required by create_scout_graph)
SCOUT_TOOLS = [social_signal_analyzer, marketplace_api_fetcher, inventory_mismatch_checker]

app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    """Run Contextual Scout: find external root causes (social signals, marketplace, supply chain) with evidence traces."""
    prompt = payload.get(
        "prompt",
        "Traffic is down WoW. Find external root causes: correlate with social/marketplace/supply chain and provide evidence traces.",
    )
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"

    if hasattr(mcp_client, "get_tools"):
        mcp_tools = await mcp_client.get_tools()
    else:
        mcp_tools = await mcp_client()
    all_tools = mcp_tools + SCOUT_TOOLS

    graph = create_scout_graph(llm, all_tools, checkpointer=None)

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
    if result.get("external_signals"):
        out["external_factors"] = result["external_signals"]
    if result.get("marketplace_checks"):
        out["marketplace_checks"] = result["marketplace_checks"]
    if result.get("supply_chain_audits"):
        out["supply_chain_audits"] = result["supply_chain_audits"]
    if result.get("confidence_scores"):
        out["confidence_scores"] = result["confidence_scores"]
    if result.get("evidence_traces"):
        out["evidence_traces"] = result["evidence_traces"]
    if result.get("reasoning_log"):
        out["reasoning_log"] = result["reasoning_log"]
    if last_content:
        out["summary"] = last_content
    return out


if __name__ == "__main__":
    app.run()
