"""
Build and compile the Remediation Strategist supervisor StateGraph with parallel workers.
"""
from typing import Any

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    WORKER_ACTION_MAPPER,
    WORKER_IMPACT_SIMULATOR,
    WORKER_MEMO_GENERATOR,
    WORKER_PRIORITIZER,
    make_supervisor_node,
    make_worker_action_mapper,
    make_worker_impact_simulator,
    make_worker_memo_generator,
    make_worker_prioritizer,
)
from .state import RemediationGraphState


def _supervisor_route(state: RemediationGraphState) -> str | list[Send]:
    """Conditional edge: supervisor_decision -> list of Send or __end__."""
    decision = state.get("supervisor_decision") or {}
    if decision.get("done"):
        return "__end__"
    sends = decision.get("sends") or []
    if not sends:
        return "__end__"
    return [Send(s["node"], s.get("payload") or {}) for s in sends]


def _get_tool_by_name(tools: list[Any], name: str) -> Any:
    """Return the first tool whose name matches."""
    for t in tools:
        if getattr(t, "name", None) == name:
            return t
    return None


def create_remediation_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Remediation Strategist supervisor graph.
    - worker_action_mapper: map_remediation_action
    - worker_impact_simulator: simulate_impact_range
    - worker_prioritizer: assess_risk_level + rank by Impact vs Effort
    - worker_memo_generator: no tools (LLM synthesis)
    """
    map_tool = _get_tool_by_name(tools, "map_remediation_action")
    simulate_tool = _get_tool_by_name(tools, "simulate_impact_range")
    assess_tool = _get_tool_by_name(tools, "assess_risk_level")
    if not map_tool or not simulate_tool or not assess_tool:
        raise ValueError(
            "tools must include map_remediation_action, simulate_impact_range, and assess_risk_level"
        )

    builder = StateGraph(RemediationGraphState)

    builder.add_node("supervisor", make_supervisor_node(llm))
    builder.add_node(WORKER_ACTION_MAPPER, make_worker_action_mapper(llm, map_tool))
    builder.add_node(WORKER_IMPACT_SIMULATOR, make_worker_impact_simulator(llm, simulate_tool))
    builder.add_node(WORKER_PRIORITIZER, make_worker_prioritizer(llm, assess_tool))
    builder.add_node(WORKER_MEMO_GENERATOR, make_worker_memo_generator(llm))

    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", _supervisor_route)

    builder.add_edge(WORKER_ACTION_MAPPER, "supervisor")
    builder.add_edge(WORKER_IMPACT_SIMULATOR, "supervisor")
    builder.add_edge(WORKER_PRIORITIZER, "supervisor")
    builder.add_edge(WORKER_MEMO_GENERATOR, "supervisor")

    return builder.compile(checkpointer=checkpointer)
