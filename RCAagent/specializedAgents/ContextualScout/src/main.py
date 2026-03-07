import logging
import os

from langchain_core.messages import HumanMessage
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_scout_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from .model.load import load_model

# Short-term memory (checkpoint persistence): use when MEMORY_ID is set (e.g. by Terraform at runtime)
MEMORY_ID = os.getenv("MEMORY_ID", "")
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

_logger = logging.getLogger(__name__)


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
    """Run Contextual Scout: find external root causes (social signals, marketplace, supply chain) with evidence traces.
    All tools come from the AgentCore Gateway (Lambda)."""
    prompt = payload.get(
        "prompt",
        "Traffic is down WoW. Find external root causes: correlate with social/marketplace/supply chain and provide evidence traces.",
    )
    thread_id = (payload.get("thread_id") or "default-sessiosdsdsdsdsdsdsdn")[:100]
    actor_id = payload.get("actor_id") or "default-actor"
    _ensure_logging()
    _logger.info(
        "[INVOKE] start prompt_len=%s thread_id=%s actor_id=%s prompt_preview=%s",
        len(prompt),
        thread_id,
        actor_id,
        prompt[:150] if prompt else "",
    )

    all_tools = await mcp_client.get_tools()
    _logger.info("[INVOKE] get_tools count=%s", len(all_tools))
    graph = create_scout_graph(llm, all_tools, checkpointer=checkpointer)

    initial_state = {"messages": [HumanMessage(content=prompt)]}
    config = {"configurable": {"thread_id": thread_id, "actor_id": actor_id}}
    _logger.info("[INVOKE] calling graph.ainvoke")
    result = await graph.ainvoke(initial_state, config=config)
    _logger.info(
        "[INVOKE] ainvoke done result_keys=%s messages_count=%s has_external_signals=%s has_marketplace_checks=%s has_supply_chain_audits=%s has_confidence_scores=%s",
        list(result.keys()),
        len(result.get("messages") or []),
        bool(result.get("external_signals")),
        bool(result.get("marketplace_checks")),
        bool(result.get("supply_chain_audits")),
        bool(result.get("confidence_scores")),
    )

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
    _logger.info("[INVOKE] returning out_keys=%s result_preview=%s", list(out.keys()), (last_content or "")[:200])
    return out


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
