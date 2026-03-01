import os
from langchain_core.messages import HumanMessage
from langchain.tools import tool
from bedrock_agentcore import BedrockAgentCoreApp

from .graph.graph import create_supervisor_graph
from .mcp_client.client import get_streamable_http_mcp_client as deployed_get_tools
from model.load import load_model

# Short-term memory (checkpoint persistence): use when MEMORY_ID is set (e.g. by Terraform at runtime)
MEMORY_ID = os.getenv("MEMORY_ID")
REGION = os.getenv("AWS_REGION", "us-east-1")
_checkpointer = None  # None = not yet tried, False = tried and skipped/failed, else AgentCoreMemorySaver


def _get_checkpointer():
    """Lazy init of AgentCoreMemorySaver so we don't require the package when MEMORY_ID is unset."""
    global _checkpointer
    if _checkpointer is not None and _checkpointer is not False:
        return _checkpointer
    if _checkpointer is False:
        return None
    if not MEMORY_ID:
        _checkpointer = False
        return None
    try:
        from langgraph_checkpoint_aws import AgentCoreMemorySaver
        _checkpointer = AgentCoreMemorySaver(MEMORY_ID, region_name=REGION)
    except Exception:
        _checkpointer = False
    return _checkpointer if _checkpointer is not False else None

if os.getenv("LOCAL_DEV") == "1":
    # Local dev: no Gateway; mcp_client is an async callable that returns [] so invoke can await mcp_client()
    async def _local_no_tools():
        return []
    mcp_client = _local_no_tools
else:
    # Deployed: use the real MCP client from the aliased factory (get_streamable_http_mcp_client)
    mcp_client = deployed_get_tools()

# Instantiate model
llm = load_model()

# Define a simple function tool (can be assigned to a worker or omitted in Option B)
@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b

# Integrate with Bedrock AgentCore
app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    # Payload: { "prompt": "<user input>", optional: "thread_id", "actor_id" for memory }
    prompt = payload.get("prompt", "What is Agentic AI?")
    # thread_id and actor_id key short-term memory (max 100 chars for thread_id)
    thread_id = (payload.get("thread_id") or "default-session")[:100]
    actor_id = payload.get("actor_id") or "default-actor"

    # Load MCP Tools and build supervisor graph (Option B: verifier gets tools)
    if hasattr(mcp_client, "get_tools"):
        tools = await mcp_client.get_tools()
    else:
        tools = await mcp_client()
    all_tools = tools + [add_numbers]
    checkpointer = _get_checkpointer()
    graph = create_supervisor_graph(llm, all_tools, checkpointer=checkpointer)

    # Run the supervisor graph (config required for checkpoint persistence when checkpointer is set)
    initial_state = {"messages": [HumanMessage(content=prompt)]}
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
    return out


if __name__ == "__main__":
    app.run()