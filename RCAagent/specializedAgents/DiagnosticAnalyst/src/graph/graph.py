"""
Build and compile the Diagnostic Analyst supervisor StateGraph with parallel workers.
All tools (query_business_data, calculate_contribution_score) come from the Gateway (Lambda).
"""
import logging
from typing import Any

from langgraph.graph import StateGraph
from langgraph.types import Send

from .nodes import (
    WORKER_DECOMPOSE,
    WORKER_DRILLDOWN,
    WORKER_SYNTHESIZE,
    make_supervisor_node,
    make_worker_decompose,
    make_worker_drilldown,
    make_worker_synthesize,
)
from .state import DiagnosticGraphState

_logger = logging.getLogger(__name__)

# Only these nodes exist; reject others to avoid "unknown node name" and loops from wrong agent prompts
_DIAGNOSTIC_VALID_NODES = {WORKER_DECOMPOSE, WORKER_DRILLDOWN, WORKER_SYNTHESIZE}

# One-shot phases: do not call these workers again once the phase is in reasoning_log
_NODE_TO_PHASE = {
    WORKER_DECOMPOSE: "decompose",
    WORKER_SYNTHESIZE: "synthesize",
}
# worker_drilldown can run multiple times (per segment); cap to avoid runaway (e.g. max 6 drilldown runs)
_MAX_DRILLDOWN_RUNS = 6


def _has_any_gathered_data(state: DiagnosticGraphState) -> bool:
    """True if we have KPI or contribution data to work with."""
    kpi = state.get("kpi_slices") or []
    contrib = state.get("contribution_scores") or []
    return len(kpi) > 0 or len(contrib) > 0


def _supervisor_route(state: DiagnosticGraphState) -> str | list[Send]:
    """Conditional edge with loop protection: one-shot rule, message cap, forced progression."""
    # 1. HARD LIMIT: Prevent runaway loops (e.g. max ~4 rounds of supervisor/worker turns)
    messages = state.get("messages") or []
    if len(messages) > 15:
        _logger.warning("[ROUTE] Loop detected (messages=%s). Forcing synthesis or end.", len(messages))
        reasoning_log = state.get("reasoning_log") or []
        phases_seen = {e.get("phase") for e in reasoning_log if isinstance(e, dict) and e.get("phase")}
        if "synthesize" in phases_seen:
            _logger.info("[ROUTE] Synthesize already ran; ending graph.")
            return "__end__"
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; ending (loop limit).")
            return "__end__"
        return [Send(WORKER_SYNTHESIZE, {"task": "Data gathering timed out; summarize what we have."})]

    decision = state.get("supervisor_decision") or {}

    # 2. EXIT CONDITION: Respect the LLM if it says it's done
    if decision.get("done"):
        return "__end__"

    sends = decision.get("sends") or []
    if not sends:
        return "__end__"

    # 3. FILTERING: One-shot rule — do not re-call decompose or synthesize; cap drilldown runs
    reasoning_log = state.get("reasoning_log") or []
    phases_seen = {e.get("phase") for e in reasoning_log if isinstance(e, dict) and e.get("phase")}
    drilldown_count = sum(1 for e in reasoning_log if isinstance(e, dict) and e.get("phase") == "drilldown")
    filtered_sends = []

    for s in sends:
        node_name = s.get("node", "")
        if node_name not in _DIAGNOSTIC_VALID_NODES:
            continue
        # One-shot: if this node's phase is already in reasoning_log, skip (block duplicate)
        if node_name in _NODE_TO_PHASE and _NODE_TO_PHASE[node_name] in phases_seen:
            _logger.info("[ROUTE] Blocking duplicate call to %s (phase already in reasoning_log)", node_name)
            continue
        # Cap drilldown runs to prevent infinite segment loops
        if node_name == WORKER_DRILLDOWN and drilldown_count >= _MAX_DRILLDOWN_RUNS:
            _logger.info("[ROUTE] Blocking extra worker_drilldown (max %s runs reached)", _MAX_DRILLDOWN_RUNS)
            continue
        # Workers receive only the Send payload as their state; inject sheet_url from graph state so they can use it
        payload = dict(s.get("payload") or {})
        if node_name in (WORKER_DECOMPOSE, WORKER_DRILLDOWN):
            sheet_url = state.get("sheet_url") or ""
            if sheet_url:
                payload["sheet_url"] = sheet_url
        filtered_sends.append(Send(node_name, payload))

    # Skip worker_synthesize when no data was gathered (avoid LLM on empty input)
    if not _has_any_gathered_data(state):
        filtered_sends = [x for x in filtered_sends if getattr(x, "node", None) != WORKER_SYNTHESIZE]

    # 4. FORCED PROGRESSION: If we blocked all sends, either force synthesize once or end
    if not filtered_sends and not decision.get("done"):
        if "synthesize" in phases_seen:
            _logger.info("[ROUTE] All sends filtered and synthesize already ran; ending graph.")
            return "__end__"
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; skipping worker_synthesize.")
            return "__end__"
        _logger.info("[ROUTE] All sends filtered; forcing worker_synthesize.")
        return [Send(WORKER_SYNTHESIZE, {"task": "Summarize what we have from the diagnosis."})]

    return filtered_sends


def _get_tool_by_name(tools: list[Any], name: str) -> Any:
    """Return the first tool whose name matches exactly or ends with the expected name."""
    target = name.lower()
    for t in tools:
        found_name = (getattr(t, "name", None) or "").lower()
        # Match exact, or handle Gateway/MCP prefixes (___, __, or -)
        if found_name == target or found_name.endswith(f"_{target}") or found_name.endswith(f"-{target}"):
            return t
    return None


def create_diagnostic_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Diagnostic Analyst supervisor graph.
    - worker_decompose: query_business_data (with sheet_url from state) + calculate_contribution_score
    - worker_drilldown: query_business_data (per segment, with sheet_url from state)
    - worker_synthesize: no tools
    """
    query_tool = _get_tool_by_name(tools, "query_business_data")
    contribution_tool = _get_tool_by_name(tools, "calculate_contribution_score")

    if not query_tool or not contribution_tool:
        received_names = [getattr(t, "name", str(t)) for t in tools]
        _logger.critical(
            "[GRAPH] tool validation failed: missing required tools. received_names=%s",
            received_names,
        )
        raise ValueError(
            f"DiagnosticAnalyst missing required tools (query_business_data, calculate_contribution_score). Received: {received_names}"
        )

    builder = StateGraph(DiagnosticGraphState)

    builder.add_node("supervisor", make_supervisor_node(llm))
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
