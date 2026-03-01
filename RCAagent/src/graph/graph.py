"""
Build and compile the RCA supervisor StateGraph with parallel workers.
"""
from typing import Any

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    WORKER_HYPOTHESIZE,
    WORKER_SUMMARIZE,
    WORKER_VERIFY,
    make_supervisor_node,
    make_worker_hypothesize,
    make_worker_summarize,
    make_worker_verify,
)
from .state import RCAGraphState


def _supervisor_route(state: RCAGraphState) -> str | list[Send]:
    """Conditional edge: supervisor_decision -> list of Send or __end__."""
    decision = state.get("supervisor_decision") or {}
    if decision.get("done"):
        return "__end__"
    sends = decision.get("sends") or []
    if not sends:
        return "__end__"
    return [Send(s["node"], s.get("payload") or {}) for s in sends]


def create_supervisor_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled supervisor graph. Option B: partition tools by worker.
    - worker_hypothesize: no tools
    - worker_verify: all MCP/query tools
    - worker_summarize: no tools
    - checkpointer: optional AgentCoreMemorySaver for short-term memory (actor_id/thread_id).
    """
    builder = StateGraph(RCAGraphState)

    supervisor_node = make_supervisor_node(llm)
    builder.add_node("supervisor", supervisor_node)

    builder.add_node(WORKER_HYPOTHESIZE, make_worker_hypothesize(llm))
    builder.add_node(WORKER_VERIFY, make_worker_verify(llm, tools))
    builder.add_node(WORKER_SUMMARIZE, make_worker_summarize(llm))

    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", _supervisor_route)

    builder.add_edge(WORKER_HYPOTHESIZE, "supervisor")
    builder.add_edge(WORKER_VERIFY, "supervisor")
    builder.add_edge(WORKER_SUMMARIZE, "supervisor")

    return builder.compile(checkpointer=checkpointer)
