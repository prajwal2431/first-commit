"""
Build and compile the Contextual Scout supervisor StateGraph with parallel workers.
"""
from typing import Any

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    WORKER_CORRELATE,
    WORKER_MARKETPLACE,
    WORKER_SUPPLY_CHAIN,
    WORKER_SYNTHESIZE,
    make_supervisor_node,
    make_worker_correlate,
    make_worker_marketplace,
    make_worker_supply_chain,
    make_worker_synthesize,
)
from .state import ScoutGraphState


def _supervisor_route(state: ScoutGraphState) -> str | list[Send]:
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


def create_scout_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Contextual Scout supervisor graph.
    - worker_correlate: social_signal_analyzer
    - worker_marketplace: marketplace_api_fetcher
    - worker_supply_chain: inventory_mismatch_checker
    - worker_synthesize: no tools
    """
    social_tool = _get_tool_by_name(tools, "social_signal_analyzer")
    marketplace_tool = _get_tool_by_name(tools, "marketplace_api_fetcher")
    inventory_tool = _get_tool_by_name(tools, "inventory_mismatch_checker")
    if not social_tool or not marketplace_tool or not inventory_tool:
        raise ValueError(
            "tools must include social_signal_analyzer, marketplace_api_fetcher, and inventory_mismatch_checker"
        )

    builder = StateGraph(ScoutGraphState)

    builder.add_node("supervisor", make_supervisor_node(llm))
    builder.add_node(WORKER_CORRELATE, make_worker_correlate(llm, social_tool))
    builder.add_node(WORKER_MARKETPLACE, make_worker_marketplace(llm, marketplace_tool))
    builder.add_node(WORKER_SUPPLY_CHAIN, make_worker_supply_chain(llm, inventory_tool))
    builder.add_node(WORKER_SYNTHESIZE, make_worker_synthesize(llm))

    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", _supervisor_route)

    builder.add_edge(WORKER_CORRELATE, "supervisor")
    builder.add_edge(WORKER_MARKETPLACE, "supervisor")
    builder.add_edge(WORKER_SUPPLY_CHAIN, "supervisor")
    builder.add_edge(WORKER_SYNTHESIZE, "supervisor")

    return builder.compile(checkpointer=checkpointer)
