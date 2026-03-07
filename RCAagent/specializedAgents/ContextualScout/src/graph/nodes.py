"""
Supervisor and worker nodes for the Contextual Scout graph.
Supervisor runs: correlate + marketplace + supply_chain (parallel) -> synthesize -> done.
All data comes from real web search or connected data sources. No mock data.
"""
import json
import logging
import re
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import ScoutGraphState

_logger = logging.getLogger(__name__)

WORKER_CORRELATE = "worker_correlate"
WORKER_MARKETPLACE = "worker_marketplace"
WORKER_SUPPLY_CHAIN = "worker_supply_chain"
WORKER_SYNTHESIZE = "worker_synthesize"

SUPERVISOR_SYSTEM = """You are the supervisor for the Contextual Scout (External Root Cause Finder). You gather external signals that internal data cannot see.

STRICT RULES (you must follow exactly):

1. Data Gathering Phase: You may call worker_correlate, worker_marketplace, and worker_supply_chain in parallel (all three in one sends list).

2. One-Shot Rule: You are STRICTLY FORBIDDEN from calling these three workers a second time. If they return 0 results or "no data found", accept that as the final answer for that domain. Never send to worker_correlate, worker_marketplace, or worker_supply_chain again after they have already run.

3. Synthesis Phase: After the three workers have reported back (regardless of results), you MUST call worker_synthesize exactly once.

4. Termination: After worker_synthesize is complete, respond with {"done": true}. Do not call any workers after synthesis.

IMPORTANT: Tools use real web search. Some may return 'no data found' or 'unavailable' — that is expected. Do NOT invent data. If a tool finds nothing, that is a valid result.

You must respond with ONLY a valid JSON object, no other text:

- To finish: {"done": true}
- To call workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples:
- First step only (all three data-gathering workers in parallel, ONCE): {"sends": [{"node": "worker_correlate", "payload": {"task": "Gather social and external signals"}}, {"node": "worker_marketplace", "payload": {"task": "Check marketplace sync and Buybox"}}, {"node": "worker_supply_chain", "payload": {"task": "Audit inventory mismatch"}}]}
- After gatherers have run: {"sends": [{"node": "worker_synthesize", "payload": {"task": "Score confidence and summarize with evidence traces"}}]}
- After synthesis: {"done": true}

Valid node names: worker_correlate, worker_marketplace, worker_supply_chain, worker_synthesize.
"""


def _extract_json(text: str) -> dict[str, Any]:
    """Extract a JSON object from LLM response (allow markdown code block)."""
    text = text.strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        return json.loads(match.group())
    return {"done": True}


def make_supervisor_node(llm: Any) -> Any:
    """Build the supervisor node that decides next worker(s) or end."""

    def supervisor_node(state: ScoutGraphState) -> dict[str, Any]:
        messages = state.get("messages") or []
        external_signals = state.get("external_signals") or []
        marketplace_checks = state.get("marketplace_checks") or []
        supply_chain_audits = state.get("supply_chain_audits") or []
        reasoning_log = state.get("reasoning_log") or []
        current_phase = state.get("current_phase") or ""
        _logger.info(
            "[SUPERVISOR] entered state: messages=%s external_signals=%s marketplace_checks=%s supply_chain_audits=%s reasoning_log=%s current_phase=%s",
            len(messages),
            len(external_signals),
            len(marketplace_checks),
            len(supply_chain_audits),
            len(reasoning_log),
            current_phase,
        )
        prompt_parts = [
            "Current state:",
            f"- Messages: {len(messages)}",
            f"- External signals: {len(external_signals)}",
            f"- Marketplace checks: {len(marketplace_checks)}",
            f"- Supply chain audits: {len(supply_chain_audits)}",
            f"- Reasoning log entries: {len(reasoning_log)}",
        ]
        if messages:
            last_msg = messages[-1]
            last_content = (getattr(last_msg, "content", str(last_msg)) or "")[:500]
            prompt_parts.append(f"\nLast message (user or assistant): {last_content}")
            _logger.info("[SUPERVISOR] last message preview: %s", last_content[:200])
        prompt_parts.append("\nDecide the next step. Reply with JSON only.")

        response = llm.invoke(
            [
                SystemMessage(content=SUPERVISOR_SYSTEM),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )
        content = response.content if hasattr(response, "content") else str(response)
        _logger.info("[SUPERVISOR] LLM raw response (first 400 chars): %s", (content or "")[:400])
        try:
            decision = _extract_json(content)
        except json.JSONDecodeError as e:
            _logger.warning("[SUPERVISOR] JSON decode error, defaulting to done=true: %s", e)
            decision = {"done": True}

        done = decision.get("done")
        sends = decision.get("sends") or []
        _logger.info("[SUPERVISOR] parsed decision: done=%s sends=%s", done, sends)
        if done:
            _logger.info("[SUPERVISOR] returning supervisor_decision done=true")
            return {"supervisor_decision": {"done": True}}
        if not sends:
            _logger.info("[SUPERVISOR] no sends, returning supervisor_decision done=true")
            return {"supervisor_decision": {"done": True}}
        _logger.info("[SUPERVISOR] returning supervisor_decision sends=%s", sends)
        return {"supervisor_decision": {"sends": sends}}

    return supervisor_node


def _run_worker_agent(llm: Any, tools: list[Any], system_prompt: str, task_message: str) -> str:
    """Run a ReAct-style agent with given tools and return last message content."""
    graph = create_agent(llm, tools=tools)
    messages: list[BaseMessage] = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_message),
    ]
    result = graph.invoke({"messages": messages})
    out_messages = result.get("messages") or []
    if out_messages:
        last = out_messages[-1]
        return getattr(last, "content", str(last))
    return ""


def make_worker_correlate(llm: Any, social_tool: Any) -> Any:
    """Worker: call social_signal_analyzer for competitor_activity, viral_trend, sentiment, weather.
    Handles 'no data' responses gracefully — never invents data."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        _logger.info("[WORKER] worker_correlate started payload=%s", payload)
        out_signals: list[dict[str, Any]] = []
        traces: list[dict[str, Any]] = []
        for signal_type in ("competitor_activity", "viral_trend", "sentiment", "weather"):
            try:
                raw = social_tool.invoke({"signal_type": signal_type, "region": None, "timeframe": "7d"})
                if isinstance(raw, str):
                    data = json.loads(raw)
                else:
                    data = raw
                trace = data.get("evidence_trace", {})
                traces.append(trace)

                search_status = data.get("search_status", "ok")
                if search_status in ("unavailable", "no_results"):
                    out_signals.append({
                        "source": "social_signal_analyzer",
                        "signal_type": signal_type,
                        "description": data.get("reason", f"No data found for {signal_type}"),
                        "region": None,
                        "severity": "no_data",
                        "evidence_trace": trace,
                    })
                    continue

                for s in data.get("signals", []):
                    out_signals.append({
                        "source": "social_signal_analyzer",
                        "signal_type": signal_type,
                        "description": s.get("description", ""),
                        "region": s.get("region"),
                        "severity": s.get("severity", "unknown"),
                        "source_url": s.get("source_url", ""),
                        "evidence_trace": trace,
                    })
            except Exception as e:
                traces.append({
                    "source_tool": "social_signal_analyzer",
                    "query_params": {"signal_type": signal_type},
                    "raw_data": {"error": str(e)},
                    "timestamp": None,
                })

        found = sum(1 for s in out_signals if s.get("severity") != "no_data")
        summary = f"Correlate: {found} real signals found, {len(out_signals) - found} categories had no data."
        log_entries = [{"phase": "correlate", "output": summary, "signals_count": len(out_signals), "real_signals": found}]
        conf = 0.0 if found == 0 else min(1.0, 0.5 + 0.15 * found)
        rationale = f"No data for any category." if found == 0 else f"{found} real signals from social_signal_analyzer."
        confidence_scores = [{"factor_type": "external_signal", "factor_id": "correlate", "confidence": conf, "rationale": rationale}]
        _logger.info("[WORKER] worker_correlate finished: %s", summary)
        return {
            "external_signals": out_signals,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "confidence_scores": confidence_scores,
            "messages": [AIMessage(content=summary)],
            "current_phase": "correlate",
        }

    return node


def make_worker_marketplace(llm: Any, marketplace_tool: Any) -> Any:
    """Worker: call marketplace_api_fetcher for each platform x check_type.
    Handles 'no data' responses gracefully — never invents data."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        _logger.info("[WORKER] worker_marketplace started payload=%s", payload)
        out_checks: list[dict[str, Any]] = []
        traces: list[dict[str, Any]] = []
        for platform in ("myntra", "amazon", "shopify"):
            for check_type in ("sync_latency", "buybox_status", "listing_health"):
                try:
                    raw = marketplace_tool.invoke({"platform": platform, "check_type": check_type})
                    if isinstance(raw, str):
                        data = json.loads(raw)
                    else:
                        data = raw
                    trace = data.get("evidence_trace", {})
                    traces.append(trace)
                    out_checks.append({
                        "platform": data.get("platform", platform),
                        "check_type": data.get("check_type", check_type),
                        "status": data.get("status", "no_data"),
                        "latency_ms": data.get("latency_ms"),
                        "details": data.get("details"),
                        "findings": data.get("findings", []),
                        "evidence_trace": trace,
                    })
                except Exception as e:
                    traces.append({
                        "source_tool": "marketplace_api_fetcher",
                        "query_params": {"platform": platform, "check_type": check_type},
                        "raw_data": {"error": str(e)},
                        "timestamp": None,
                    })

        with_data = sum(1 for c in out_checks if c.get("status") == "searched")
        total_checks = len(out_checks)
        summary = f"Marketplace: {total_checks} checks, {with_data} returned search results."
        log_entries = [{"phase": "marketplace", "output": summary, "checks_count": total_checks, "with_data": with_data}]
        conf = 0.0 if with_data == 0 else min(1.0, 0.5 + 0.1 * with_data)
        rationale = f"No search results in {total_checks} checks." if with_data == 0 else f"{with_data} of {total_checks} checks returned search results."
        confidence_scores = [{"factor_type": "marketplace", "factor_id": "marketplace", "confidence": conf, "rationale": rationale}]
        _logger.info("[WORKER] worker_marketplace finished: %s", summary)
        return {
            "marketplace_checks": out_checks,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "confidence_scores": confidence_scores,
            "messages": [AIMessage(content=summary)],
            "current_phase": "marketplace",
        }

    return node


def make_worker_supply_chain(llm: Any, inventory_tool: Any) -> Any:
    """Worker: call inventory_mismatch_checker. Handles 'no data source' gracefully."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        _logger.info("[WORKER] worker_supply_chain started payload=%s", payload)
        out_audits: list[dict[str, Any]] = []
        traces: list[dict[str, Any]] = []
        try:
            raw = inventory_tool.invoke({"sku": None, "demand_region": None, "stock_region": None})
            if isinstance(raw, str):
                data = json.loads(raw)
            else:
                data = raw
            trace = data.get("evidence_trace", {})
            traces.append(trace)

            status = data.get("status", "")
            if status == "no_data_source":
                summary = f"Supply chain: No inventory data source connected. {data.get('reason', '')}"
                log_entries = [{"phase": "supply_chain", "output": summary, "status": "no_data_source"}]
                confidence_scores = [{"factor_type": "supply_chain", "factor_id": "supply_chain", "confidence": 0.0, "rationale": "No inventory data source connected."}]
                _logger.info("[WORKER] worker_supply_chain finished (no_data_source): %s", summary[:200])
                return {
                    "supply_chain_audits": [],
                    "evidence_traces": traces,
                    "reasoning_log": log_entries,
                    "confidence_scores": confidence_scores,
                    "messages": [AIMessage(content=summary)],
                    "current_phase": "supply_chain",
                }

            for m in data.get("mismatches", []):
                out_audits.append({
                    "sku": m.get("sku", ""),
                    "demand_region": m.get("demand_region", ""),
                    "stock_region": m.get("stock_region", ""),
                    "demand_units": m.get("demand_units", 0),
                    "available_units": m.get("available_units", 0),
                    "mismatch_severity": m.get("mismatch_severity", "medium"),
                    "evidence_trace": m.get("evidence_trace", trace),
                })
        except Exception as e:
            traces.append({
                "source_tool": "inventory_mismatch_checker",
                "query_params": {},
                "raw_data": {"error": str(e)},
                "timestamp": None,
            })

        summary = f"Supply chain: {len(out_audits)} inventory mismatches found."
        log_entries = [{"phase": "supply_chain", "output": summary, "audits_count": len(out_audits)}]
        conf = 0.8 if out_audits else 0.5
        rationale = summary
        confidence_scores = [{"factor_type": "supply_chain", "factor_id": "supply_chain", "confidence": conf, "rationale": rationale}]
        _logger.info("[WORKER] worker_supply_chain finished: %s", summary)
        return {
            "supply_chain_audits": out_audits,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "confidence_scores": confidence_scores,
            "messages": [AIMessage(content=summary)],
            "current_phase": "supply_chain",
        }

    return node


def make_worker_synthesize(llm: Any) -> Any:
    """Worker: narrative summary only. Confidence scores are provided by data-gathering workers; synthesizer must NOT change them.
    No tools. Must only report what was in reasoning_log or worker messages."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        _logger.info("[WORKER] worker_synthesize started payload=%s", payload)
        task = payload.get(
            "task",
            "Summarize what was gathered. Cite reasoning_log and worker messages. "
            "If a worker reported 0 results or no data, state that no data was found for that category.",
        )
        system = """You are a data synthesizer. You must ONLY use the information provided in the reasoning_log or worker messages. If a worker reports '0 results,' you must state that no data was found for that category. DO NOT use your own internal knowledge to invent statistics, dates, or sources like Statista or the IMF.

Produce a short narrative summary (2-4 sentences) that cites only what was actually gathered: refer to reasoning_log entries and worker output. If a tool returned 'no data found', 'unavailable', or 'no data source', report that honestly. Do NOT produce or change confidence scores — those are set by the workers."""
        content = _run_worker_agent(llm, [], system, task)
        _logger.info("[WORKER] worker_synthesize LLM response length=%s preview=%s", len(content or ""), (content or "")[:300])
        log_entries = [{"phase": "synthesize", "output": content[:500]}]
        _logger.info("[WORKER] worker_synthesize finished")
        return {
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "synthesize",
        }

    return node
