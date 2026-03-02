"""
social_signal_analyzer tool: check external signals (competitor activity,
viral trends, sentiment, weather) via web search. No mock/fake data.
When web search is unavailable, explicitly says so.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

from .web_search import _search_tavily

_SIGNAL_QUERIES: dict[str, str] = {
    "competitor_activity": "D2C ecommerce competitor flash sale discount India {region}",
    "viral_trend": "viral negative trend ecommerce brand India {region}",
    "sentiment": "ecommerce brand sentiment complaints India {region}",
    "weather": "severe weather disruption logistics India {region}",
}


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@tool
def social_signal_analyzer(
    signal_type: str,
    region: str | None = None,
    timeframe: str = "7d",
) -> str:
    """Check external social/market signals via web search: competitor_activity, viral_trend, sentiment, or weather.
    Uses real web search (Tavily). If no results or no API key, clearly states 'no data found'. Never returns fake data.
    Returns JSON with signals list and evidence_trace."""
    signal_type = (signal_type or "competitor_activity").lower().replace(" ", "_")
    if signal_type not in _SIGNAL_QUERIES:
        signal_type = "competitor_activity"

    region_str = region or "all regions"
    query_template = _SIGNAL_QUERIES[signal_type]
    search_query = query_template.format(region=region_str) + f" last {timeframe}"
    query_params = {"signal_type": signal_type, "region": region, "timeframe": timeframe, "search_query": search_query}

    search_result = _search_tavily(search_query, max_results=5)

    signals: list[dict[str, Any]] = []
    if search_result.get("error"):
        data = {
            "signals": [],
            "search_status": "unavailable",
            "reason": search_result["error"],
            "query_params_used": query_params,
        }
        trace = _evidence_trace("social_signal_analyzer", query_params, {"search_error": search_result["error"]})
        data["evidence_trace"] = trace
        return json.dumps(data)

    for r in search_result.get("results", []):
        signals.append({
            "description": r.get("content", r.get("title", ""))[:500],
            "region": region,
            "severity": "unknown",
            "source_url": r.get("url", ""),
            "source_title": r.get("title", ""),
        })

    if not signals:
        data = {
            "signals": [],
            "search_status": "no_results",
            "reason": f"Web search returned no results for: {search_query}",
            "query_params_used": query_params,
        }
        trace = _evidence_trace("social_signal_analyzer", query_params, {"search_results_count": 0})
        data["evidence_trace"] = trace
        return json.dumps(data)

    raw_for_trace = {
        "search_results_count": len(signals),
        "search_query": search_query,
        "results_summary": [{"title": s["source_title"], "url": s["source_url"]} for s in signals],
    }
    trace = _evidence_trace("social_signal_analyzer", query_params, raw_for_trace)
    data = {
        "signals": signals,
        "search_status": "ok",
        "query_params_used": query_params,
        "evidence_trace": trace,
    }
    return json.dumps(data)
