import logging
import os

from langchain_core.messages import HumanMessage
from langchain.tools import tool
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_supervisor_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from model.load import load_model

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

# Instantiate model
llm = load_model()

# Define a simple function tool (can be assigned to a worker or omitted in Option B)
@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b

# Logging: ensure root has a console handler so local runs see INFO (idempotent)
def _ensure_logging():
    root = logging.getLogger()
    if not root.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        root.addHandler(h)
        root.setLevel(logging.INFO)

_logger = logging.getLogger(__name__)

# Integrate with Bedrock AgentCore
app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    # Payload: { "prompt": "<user input>", optional: "thread_id", "actor_id", "session_id", "sheet_url" }
    prompt = payload.get("prompt", "What is Agentic AI?")
    # thread_id and actor_id key short-term memory (max 100 chars for thread_id)
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"
    # session_id: same session for specialist agents (33+ chars) when provided by backend
    session_id = payload.get("session_id") or ""
    # sheet_url: passed to worker_diagnostic when user provides a Google Sheet (e.g. from Test UI)
    sheet_url = (payload.get("sheet_url") or "").strip()

    _ensure_logging()
    _logger.info("invoke start prompt=%s thread_id=%s actor_id=%s sheet_url=%s", repr(prompt)[:80], thread_id, actor_id, "yes" if sheet_url else "no")

    # Load MCP Tools and build supervisor graph (Option B: verifier gets tools)
    if hasattr(mcp_client, "get_tools"):
        tools = await mcp_client.get_tools()
    else:
        tools = await mcp_client()
    all_tools = tools + [add_numbers]
    _logger.info("tools loaded count=%d", len(all_tools))
    graph = create_supervisor_graph(llm, all_tools, checkpointer=checkpointer)

    # Run the supervisor graph (config required for checkpoint persistence when checkpointer is set)
    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "thread_id": thread_id,
        "actor_id": actor_id,
        "session_id": session_id,
        "sheet_url": sheet_url,
    }
    config = {"configurable": {"thread_id": thread_id, "actor_id": actor_id}}
    result = await graph.ainvoke(initial_state, config=config)

    # Extract result from last AI message; optionally include auditability fields
    messages = result.get("messages") or []
    last_content = ""
    for m in reversed(messages):
        if hasattr(m, "content") and getattr(m, "type", "") != "human":
            last_content = m.content or ""
            break
    if not last_content and messages:
        last_content = getattr(messages[-1], "content", str(messages[-1]))
    out = {"result": last_content}
    if result.get("reasoning_log"):
        out["reasoning_log"] = result["reasoning_log"]
    if result.get("evidence"):
        out["evidence"] = result["evidence"]
    if result.get("recommendations"):
        out["recommendations"] = result["recommendations"]
    if result.get("specialist_results"):
        out["specialist_results"] = result["specialist_results"]

    _logger.info("invoke done result_len=%d reasoning_log=%d evidence=%d specialist_results=%d",
                 len(last_content), len(out.get("reasoning_log", [])), len(out.get("evidence", [])),
                 len(out.get("specialist_results", [])))
    return out


if __name__ == "__main__":
    app.run(host="0.0.0.0")