"""
Build and compile the Contextual Scout supervisor StateGraph with parallel workers.
"""
import logging
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

_logger = logging.getLogger(__name__)

# Only these nodes exist; reject others to avoid "unknown node name" and loops from wrong agent prompts
_SCOUT_VALID_NODES = {WORKER_CORRELATE, WORKER_MARKETPLACE, WORKER_SUPPLY_CHAIN, WORKER_SYNTHESIZE}

# reasoning_log entries use "phase": "correlate" | "marketplace" | "supply_chain" | "synthesize"
_NODE_TO_PHASE = {
    WORKER_CORRELATE: "correlate",
    WORKER_MARKETPLACE: "marketplace",
    WORKER_SUPPLY_CHAIN: "supply_chain",
}


def _has_any_gathered_data(state: ScoutGraphState) -> bool:
    """True if any worker produced usable data (not all 0 results / no_data)."""
    signals = state.get("external_signals") or []
    if any(s.get("severity") != "no_data" for s in signals):
        return True
    checks = state.get("marketplace_checks") or []
    if any(c.get("status") == "searched" for c in checks):
        return True
    audits = state.get("supply_chain_audits") or []
    if audits:
        return True
    return False


def _supervisor_route(state: ScoutGraphState) -> str | list[Send]:
    """Conditional edge with SRE-level loop protection."""
    # 1. HARD LIMIT: Prevent runaway loops (e.g., max ~4 rounds of supervisor/worker turns)
    messages = state.get("messages") or []
    if len(messages) > 15:
        _logger.warning("[ROUTE] Loop detected (messages=%s). Forcing synthesis phase.", len(messages))
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; skipping worker_synthesize (loop limit).")
            return "__end__"
        return [Send(WORKER_SYNTHESIZE, {"task": "Data gathering timed out; summarize what we have."})]

    decision = state.get("supervisor_decision") or {}

    # 2. EXIT CONDITION: Respect the LLM if it says it's done
    if decision.get("done"):
        return "__end__"

    sends = decision.get("sends") or []
    if not sends:
        return "__end__"

    # 3. FILTERING: Prevent the LLM from re-calling data-gatherers that already ran (one-shot rule)
    history = state.get("reasoning_log") or []
    phases_seen = {e.get("phase") for e in history if isinstance(e, dict) and e.get("phase")}
    filtered_sends = []

    for s in sends:
        node_name = s.get("node", "")
        if node_name not in _SCOUT_VALID_NODES:
            continue
        # If data-gatherer and its phase is already in reasoning_log, skip (one-shot)
        if node_name in _NODE_TO_PHASE and _NODE_TO_PHASE[node_name] in phases_seen:
            _logger.info("[ROUTE] Blocking duplicate call to %s (phase already in reasoning_log)", node_name)
            continue
        filtered_sends.append(Send(node_name, s.get("payload") or {}))

    # Skip worker_synthesize when no data was gathered (avoid LLM on empty input)
    if not _has_any_gathered_data(state):
        filtered_sends = [x for x in filtered_sends if getattr(x, "node", None) != WORKER_SYNTHESIZE]

    # 4. FORCED PROGRESSION: If we blocked all gatherers, either force synthesize once or end
    if not filtered_sends and not decision.get("done"):
        if "synthesize" in phases_seen:
            _logger.info("[ROUTE] All sends filtered and synthesize already ran; ending graph")
            return "__end__"
        if not _has_any_gathered_data(state):
            _logger.info("[ROUTE] No data gathered; skipping worker_synthesize.")
            return "__end__"
        _logger.info("[ROUTE] All sends filtered; forcing worker_synthesize")
        return [Send(WORKER_SYNTHESIZE, {"task": "Summarize what we have from data gathering."})]

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


def create_scout_graph(llm: Any, tools: list[Any], checkpointer: Any = None) -> Any:
    """
    Build the compiled Contextual Scout supervisor graph.
    - worker_correlate: social_signal_analyzer
    - worker_marketplace: marketplace_api_fetcher
    - worker_supply_chain: inventory_mismatch_checker
    - worker_synthesize: no tools
    """
    _logger.info("[GRAPH] create_scout_graph: tools_count=%s", len(tools))
    social_tool = _get_tool_by_name(tools, "social_signal_analyzer")
    marketplace_tool = _get_tool_by_name(tools, "marketplace_api_fetcher")
    inventory_tool = _get_tool_by_name(tools, "inventory_mismatch_checker")

    if not social_tool or not marketplace_tool or not inventory_tool:
        received_names = [getattr(t, "name", str(t)) for t in tools]
        _logger.critical(
            "[GRAPH] tool validation failed: missing required tools. received_names=%s",
            received_names,
        )
        raise ValueError(f"ContextualScout missing required tools. Received: {received_names}")

    _logger.info("[GRAPH] all required tools resolved, building StateGraph")
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

    compiled = builder.compile(checkpointer=checkpointer)
    _logger.info("[GRAPH] graph compiled checkpointer=%s", checkpointer is not None)
    return compiled
