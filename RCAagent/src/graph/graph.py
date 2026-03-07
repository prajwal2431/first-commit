"""
Build and compile the RCA supervisor StateGraph with parallel workers.
"""
import logging
from typing import Any

_logger = logging.getLogger(__name__)

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    SPECIALIST_NODES,
    WORKER_CONTEXTUAL,
    WORKER_DIAGNOSTIC,
    WORKER_HYPOTHESIZE,
    WORKER_REMEDIATION,
    WORKER_SUMMARIZE,
    WORKER_VERIFY,
    make_supervisor_node,
    make_worker_contextual,
    make_worker_diagnostic,
    make_worker_remediation,
    make_worker_hypothesize,
    make_worker_summarize,
    make_worker_verify,
)
from .state import RCAGraphState


def _supervisor_route(state: RCAGraphState) -> str | list[Send]:
    """Conditional edge: supervisor_decision -> list of Send or __end__.
    Injects thread_id, actor_id, session_id from state into payloads for specialist nodes.
    Injects sheet_url into worker_diagnostic payload when set.
    """
    decision = state.get("supervisor_decision") or {}
    if decision.get("done"):
        _logger.debug("route: end (done)")
        return "__end__"
    sends = decision.get("sends") or []
    if not sends:
        _logger.debug("route: end (no sends)")
        return "__end__"
    thread_id = state.get("thread_id")
    actor_id = state.get("actor_id")
    session_id = state.get("session_id")
    sheet_url = (state.get("sheet_url") or "").strip()
    out = []
    for s in sends:
        node_name = s.get("node", "")
        payload = dict(s.get("payload") or {})
        if node_name in SPECIALIST_NODES:
            if thread_id is not None:
                payload["thread_id"] = thread_id
            if actor_id is not None:
                payload["actor_id"] = actor_id
            if session_id is not None:
                payload["session_id"] = session_id
            if node_name == WORKER_DIAGNOSTIC and sheet_url:
                payload["sheet_url"] = sheet_url
        out.append(Send(node_name, payload))
    _logger.info("route: sending to %s", [s.node for s in out])
    return out


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
    builder.add_node(WORKER_DIAGNOSTIC, make_worker_diagnostic())
    builder.add_node(WORKER_CONTEXTUAL, make_worker_contextual())
    builder.add_node(WORKER_REMEDIATION, make_worker_remediation())

    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", _supervisor_route)

    builder.add_edge(WORKER_HYPOTHESIZE, "supervisor")
    builder.add_edge(WORKER_VERIFY, "supervisor")
    builder.add_edge(WORKER_SUMMARIZE, "supervisor")
    builder.add_edge(WORKER_DIAGNOSTIC, "supervisor")
    builder.add_edge(WORKER_CONTEXTUAL, "supervisor")
    builder.add_edge(WORKER_REMEDIATION, "supervisor")

    return builder.compile(checkpointer=checkpointer)
