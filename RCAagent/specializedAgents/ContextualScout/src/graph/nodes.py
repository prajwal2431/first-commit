"""
Supervisor and worker nodes for the Contextual Scout graph.
Supervisor runs: correlate + marketplace + supply_chain (parallel) -> synthesize -> done.
All data comes from real web search or connected data sources. No mock data.
"""
import json
import re
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import ScoutGraphState

WORKER_CORRELATE = "worker_correlate"
WORKER_MARKETPLACE = "worker_marketplace"
WORKER_SUPPLY_CHAIN = "worker_supply_chain"
WORKER_SYNTHESIZE = "worker_synthesize"

SUPERVISOR_SYSTEM = """You are the supervisor for the Contextual Scout (External Root Cause Finder). You gather external signals that internal data cannot see.

Flow (follow in order):
1. First pass: Call worker_correlate, worker_marketplace, and worker_supply_chain in parallel (all three in one sends list) to gather external signals, marketplace checks, and supply chain audits.
2. Second pass: When those three workers have run, call worker_synthesize once to produce confidence scores and a summary with evidence citations.
3. Then respond with {"done": true}.

IMPORTANT: Tools use real web search. Some may return 'no data found' or 'unavailable' — that is expected. Do NOT invent data. If a tool finds nothing, that is a valid result.

You must respond with ONLY a valid JSON object, no other text:

1. To finish: {"done": true}
2. To call workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples:
- First step (all three data-gathering workers in parallel): {"sends": [{"node": "worker_correlate", "payload": {"task": "Gather social and external signals"}}, {"node": "worker_marketplace", "payload": {"task": "Check marketplace sync and Buybox"}}, {"node": "worker_supply_chain", "payload": {"task": "Audit inventory mismatch"}}]}
- Second step: {"sends": [{"node": "worker_synthesize", "payload": {"task": "Score confidence and summarize with evidence traces"}}]}
- Done: {"done": true}

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
            prompt_parts.append(
                f"\nLast message (user or assistant): {getattr(last_msg, 'content', str(last_msg))[:500]}"
            )
        prompt_parts.append("\nDecide the next step. Reply with JSON only.")

        response = llm.invoke(
            [
                SystemMessage(content=SUPERVISOR_SYSTEM),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )
        content = response.content if hasattr(response, "content") else str(response)
        try:
            decision = _extract_json(content)
        except json.JSONDecodeError:
            decision = {"done": True}

        if decision.get("done"):
            return {"supervisor_decision": {"done": True}}
        sends = decision.get("sends") or []
        if not sends:
            return {"supervisor_decision": {"done": True}}
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
        return {
            "external_signals": out_signals,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=summary)],
            "current_phase": "correlate",
        }

    return node


def make_worker_marketplace(llm: Any, marketplace_tool: Any) -> Any:
    """Worker: call marketplace_api_fetcher for each platform x check_type.
    Handles 'no data' responses gracefully — never invents data."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
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
        summary = f"Marketplace: {len(out_checks)} checks, {with_data} returned search results."
        log_entries = [{"phase": "marketplace", "output": summary, "checks_count": len(out_checks), "with_data": with_data}]
        return {
            "marketplace_checks": out_checks,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=summary)],
            "current_phase": "marketplace",
        }

    return node


def make_worker_supply_chain(llm: Any, inventory_tool: Any) -> Any:
    """Worker: call inventory_mismatch_checker. Handles 'no data source' gracefully."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
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
                return {
                    "supply_chain_audits": [],
                    "evidence_traces": traces,
                    "reasoning_log": log_entries,
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
        return {
            "supply_chain_audits": out_audits,
            "evidence_traces": traces,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=summary)],
            "current_phase": "supply_chain",
        }

    return node


def make_worker_synthesize(llm: Any) -> Any:
    """Worker: produce confidence scores for each external factor and summary with evidence citations. No tools.
    Must only report what was actually found. If nothing was found, say so."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        task = payload.get(
            "task",
            "Score confidence for each external factor and summarize with evidence traces. "
            "Cite specific URLs and data for every claim. If a tool returned 'no data found' or "
            "'unavailable', report that honestly — do NOT invent data.",
        )
        system = """You are the Contextual Scout (External Root Cause Finder). Using the gathered external_signals, marketplace_checks, and supply_chain_audits in state, produce:
1. A confidence score (0.0-1.0) for each external factor found, with brief rationale.
2. A short narrative summary (2-4 sentences) that cites evidence: URLs, source titles, specific data.
3. If a tool returned 'no data found', 'unavailable', or 'no data source', report that honestly.

CRITICAL: Do NOT invent data. Only use what was actually gathered. If nothing was found, say 'No external data was found for this category'."""
        content = _run_worker_agent(llm, [], system, task)
        confidence_scores = [{"factor_type": "synthesized", "confidence": 0.0, "rationale": content[:200]}]
        log_entries = [{"phase": "synthesize", "output": content[:500]}]
        return {
            "confidence_scores": confidence_scores,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "synthesize",
        }

    return node
