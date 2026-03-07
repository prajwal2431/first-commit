"""
Build and compile the Remediation Strategist supervisor StateGraph with parallel workers.
All tools (map_remediation_action, simulate_impact_range, assess_risk_level) come from the Gateway (Lambda).
"""
import logging
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

_logger = logging.getLogger(__name__)

# Only these nodes exist; reject others to avoid "unknown node name" and loops from wrong agent prompts
_REMEDIATION_VALID_NODES = {
    WORKER_ACTION_MAPPER,
    WORKER_IMPACT_SIMULATOR,
    WORKER_PRIORITIZER,
    WORKER_MEMO_GENERATOR,
}

# One-shot phases: do not call these workers again once the phase is in reasoning_log
_NODE_TO_PHASE = {
    WORKER_ACTION_MAPPER: "action_mapper",
    WORKER_IMPACT_SIMULATOR: "impact_simulator",
    WORKER_PRIORITIZER: "prioritizer",
    WORKER_MEMO_GENERATOR: "memo_generator",
}


def _has_any_gathered_data(state: RemediationGraphState) -> bool:
    """True if we have remediation data to work with."""
    if state.get("remediation_actions"):
        return True
    if state.get("impact_projections"):
        return True
    if state.get("prioritized_actions"):
        return True
    if state.get("decision_memo"):
        return True
    return False


def _supervisor_route(state: RemediationGraphState) -> str | list[Send]:
    """Conditional edge with loop protection: one-shot rule, message cap, forced progression."""
    # 1. HARD LIMIT: Prevent runaway loops (e.g. max ~4 rounds of supervisor/worker turns)
    messages = state.get("messages") or []
    if len(messages) > 15:
        _logger.warning("[ROUTE] Loop detected (messages=%s). Forcing memo or end.", len(messages))
        reasoning_log = state.get("reasoning_log") or []
        phases_seen = {e.get("phase") for e in reasoning_log if isinstance(e, dict) and e.get("phase")}
        if "memo_generator" in phases_seen:
            _logger.info("[ROUTE] Memo already ran; ending graph.")
            return "__end__"
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; ending (loop limit).")
            return "__end__"
        return [Send(WORKER_MEMO_GENERATOR, {"task": "Data gathering timed out; summarize what we have."})]

    decision = state.get("supervisor_decision") or {}

    # 2. EXIT CONDITION: Respect the LLM if it says it's done
    if decision.get("done"):
        return "__end__"

    sends = decision.get("sends") or []
    if not sends:
        return "__end__"

    # 3. FILTERING: One-shot rule — do not re-call a worker whose phase is already in reasoning_log
    reasoning_log = state.get("reasoning_log") or []
    phases_seen = {e.get("phase") for e in reasoning_log if isinstance(e, dict) and e.get("phase")}
    filtered_sends = []

    for s in sends:
        node_name = s.get("node", "")
        if node_name not in _REMEDIATION_VALID_NODES:
            continue
        if node_name in _NODE_TO_PHASE and _NODE_TO_PHASE[node_name] in phases_seen:
            _logger.info("[ROUTE] Blocking duplicate call to %s (phase already in reasoning_log)", node_name)
            continue
        filtered_sends.append(Send(node_name, s.get("payload") or {}))

    # Skip worker_memo_generator when no data was gathered (avoid LLM on empty input)
    if not _has_any_gathered_data(state):
        filtered_sends = [x for x in filtered_sends if getattr(x, "node", None) != WORKER_MEMO_GENERATOR]

    # 4. FORCED PROGRESSION: If we blocked all sends, either force memo once or end
    if not filtered_sends and not decision.get("done"):
        if "memo_generator" in phases_seen:
            _logger.info("[ROUTE] All sends filtered and memo already ran; ending graph.")
            return "__end__"
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; skipping worker_memo_generator.")
            return "__end__"
        _logger.info("[ROUTE] All sends filtered; forcing worker_memo_generator.")
        return [Send(WORKER_MEMO_GENERATOR, {"task": "Summarize what we have from the remediation pipeline."})]

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


def create_remediation_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Remediation Strategist supervisor graph.
    - worker_action_mapper: map_remediation_action
    - worker_impact_simulator: simulate_impact_range
    - worker_prioritizer: assess_risk_level + rank by Impact vs Effort
    - worker_memo_generator: no tools (LLM synthesis)
    """
    _logger.info("[GRAPH] create_remediation_graph: tools_count=%s", len(tools))
    map_tool = _get_tool_by_name(tools, "map_remediation_action")
    simulate_tool = _get_tool_by_name(tools, "simulate_impact_range")
    assess_tool = _get_tool_by_name(tools, "assess_risk_level")
    if not map_tool or not simulate_tool or not assess_tool:
        received_names = [getattr(t, "name", str(t)) for t in tools]
        _logger.critical(
            "[GRAPH] tool validation failed: missing required tools. received_names=%s",
            received_names,
        )
        raise ValueError(
            f"RemediationStrategist missing required tools (map_remediation_action, simulate_impact_range, assess_risk_level). Received: {received_names}"
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

    compiled = builder.compile(checkpointer=checkpointer)
    _logger.info("[GRAPH] graph compiled checkpointer=%s", checkpointer is not None)
    return compiled
