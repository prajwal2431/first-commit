import os
from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_remediation_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_mcp_client
from .tools.simulate_impact import simulate_impact_range
from .tools.map_remediation import map_remediation_action
from .tools.assess_risk import assess_risk_level
from .model.load import load_model

if os.getenv("LOCAL_DEV") == "1":
    async def _local_no_tools():
        return []
    mcp_client = _local_no_tools
else:
    mcp_client = deployed_get_mcp_client()

llm = load_model()

REMEDIATION_TOOLS = [simulate_impact_range, map_remediation_action, assess_risk_level]

app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    """Run Remediation Strategist: map root causes to actions, simulate impact, prioritize, produce Decision Memo. Sets requires_approval for high-risk actions (HITL)."""
    prompt = payload.get("prompt", "Stockout in North India led to revenue drop. Suggest remediation actions.")
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"
    root_causes = payload.get("root_causes") or []

    if hasattr(mcp_client, "get_tools"):
        mcp_tools = await mcp_client.get_tools()
    else:
        mcp_tools = await mcp_client()
    all_tools = mcp_tools + REMEDIATION_TOOLS

    graph = create_remediation_graph(llm, all_tools, checkpointer=None)

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "root_causes": root_causes,
    }
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

    decision_memo = result.get("decision_memo") or {}
    if isinstance(decision_memo, dict) and decision_memo.get("summary"):
        last_content = decision_memo["summary"]

    out = {"result": last_content}
    if result.get("remediation_actions"):
        out["remediation_actions"] = result["remediation_actions"]
    if result.get("impact_projections"):
        out["impact_projections"] = result["impact_projections"]
    if result.get("prioritized_actions"):
        out["prioritized_actions"] = result["prioritized_actions"]
    if result.get("decision_memo"):
        out["decision_memo"] = result["decision_memo"]
    if "requires_approval" in result:
        out["requires_approval"] = result["requires_approval"]
    if result.get("evidence_traces"):
        out["evidence_traces"] = result["evidence_traces"]
    if result.get("reasoning_log"):
        out["reasoning_log"] = result["reasoning_log"]
    return out


if __name__ == "__main__":
    app.run()
