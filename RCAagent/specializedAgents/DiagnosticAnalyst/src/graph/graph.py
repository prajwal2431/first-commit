"""
Build and compile the Diagnostic Analyst supervisor StateGraph with parallel workers.
"""
from typing import Any

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    WORKER_DECOMPOSE,
    WORKER_DRILLDOWN,
    WORKER_INGEST,
    WORKER_SYNTHESIZE,
    make_supervisor_node,
    make_worker_decompose,
    make_worker_drilldown,
    make_worker_ingest,
    make_worker_synthesize,
)
from .state import DiagnosticGraphState


def _supervisor_route(state: DiagnosticGraphState) -> str | list[Send]:
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


def create_diagnostic_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Diagnostic Analyst supervisor graph.
    - worker_ingest: load_google_sheet + extract_kpi_data (optional, when sheet_url is provided)
    - worker_decompose: query_business_data + calculate_contribution_score
    - worker_drilldown: query_business_data (per segment)
    - worker_synthesize: no tools
    """
    query_tool = _get_tool_by_name(tools, "query_business_data")
    contribution_tool = _get_tool_by_name(tools, "calculate_contribution_score")
    if not query_tool or not contribution_tool:
        raise ValueError("tools must include query_business_data and calculate_contribution_score")

    load_sheet_tool = _get_tool_by_name(tools, "load_google_sheet")
    extract_kpi_tool = _get_tool_by_name(tools, "extract_kpi_data")

    builder = StateGraph(DiagnosticGraphState)

    builder.add_node("supervisor", make_supervisor_node(llm))

    if load_sheet_tool and extract_kpi_tool:
        builder.add_node(WORKER_INGEST, make_worker_ingest(llm, load_sheet_tool, extract_kpi_tool))
        builder.add_edge(WORKER_INGEST, "supervisor")

    builder.add_node(
        WORKER_DECOMPOSE,
        make_worker_decompose(llm, query_tool, contribution_tool),
    )
    builder.add_node(WORKER_DRILLDOWN, make_worker_drilldown(llm, query_tool))
    builder.add_node(WORKER_SYNTHESIZE, make_worker_synthesize(llm))

    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", _supervisor_route)

    builder.add_edge(WORKER_DECOMPOSE, "supervisor")
    builder.add_edge(WORKER_DRILLDOWN, "supervisor")
    builder.add_edge(WORKER_SYNTHESIZE, "supervisor")

    return builder.compile(checkpointer=checkpointer)
