import logging
import os

from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_remediation_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_mcp_client
from .model.load import load_model

_logger = logging.getLogger(__name__)

# Short-term memory (checkpoint persistence): use when MEMORY_ID is set (e.g. by Terraform at runtime)
MEMORY_ID = os.getenv("MEMORY_ID")
REGION = os.getenv("AWS_REGION", "eu-west-2")

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

# Always use AgentCore Gateway for MCP tools (requires GATEWAY_URL and COGNITO_* in env)
mcp_client = deployed_get_mcp_client()
llm = load_model()


def _ensure_logging():
    """Ensure root logger has a handler and INFO level so graph/node/main logs are visible."""
    root = logging.getLogger()
    if not root.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        root.addHandler(h)
    if root.level > logging.INFO:
        root.setLevel(logging.INFO)


app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    """Run Remediation Strategist: map root causes to actions, simulate impact, prioritize, produce Decision Memo.
    All tools come from the AgentCore Gateway (Lambda). Sets requires_approval for high-risk actions (HITL)."""
    prompt = payload.get("prompt", "Stockout in North India led to revenue drop. Suggest remediation actions.")
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"
    root_causes = payload.get("root_causes") or []

    _ensure_logging()
    _logger.info(
        "[INVOKE] start prompt_len=%s thread_id=%s actor_id=%s root_causes=%s prompt_preview=%s",
        len(prompt),
        thread_id,
        actor_id,
        len(root_causes),
        (prompt[:150] if prompt else ""),
    )

    all_tools = await mcp_client.get_tools()
    _logger.info("[INVOKE] get_tools count=%s", len(all_tools))
    graph = create_remediation_graph(llm, all_tools, checkpointer=checkpointer)

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "root_causes": root_causes,
    }
    config = {"configurable": {"thread_id": thread_id, "actor_id": actor_id}}
    _logger.info("[INVOKE] calling graph.ainvoke")
    result = await graph.ainvoke(initial_state, config=config)
    _logger.info(
        "[INVOKE] ainvoke done result_keys=%s messages_count=%s remediation_actions=%s prioritized_actions=%s decision_memo=%s",
        list(result.keys()),
        len(result.get("messages") or []),
        len(result.get("remediation_actions") or []),
        len(result.get("prioritized_actions") or []),
        bool(result.get("decision_memo")),
    )

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
    _logger.info(
        "[INVOKE] returning out_keys=%s result_preview=%s",
        list(out.keys()),
        (last_content or "")[:200],
    )
    return out


if __name__ == "__main__":
    _ensure_logging()
    app.run(host="0.0.0.0", port=8080)
