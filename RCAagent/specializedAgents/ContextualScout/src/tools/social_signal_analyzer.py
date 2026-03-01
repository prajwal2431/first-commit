"""
social_signal_analyzer tool: check external signals (competitor activity,
viral trends, sentiment, weather) for Indian D2C context. Returns structured
data with evidence_trace for every claim.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Mock signals for Indian D2C (revenue drop / stockout scenario)
_MOCK_SIGNALS: dict[str, dict[str, Any]] = {
    "competitor_activity": {
        "signals": [
            {
                "description": "Competitor flash sale in North India (50% off) overlapping our peak window",
                "region": "North India",
                "severity": "high",
                "impact": "Traffic and CVR drop in North India likely diverted",
            }
        ],
    },
    "viral_trend": {
        "signals": [
            {
                "description": "Negative viral tweet about delivery delays (12k retweets) in last 48h",
                "region": None,
                "severity": "medium",
                "impact": "Sentiment and consideration may be affected",
            }
        ],
    },
    "sentiment": {
        "signals": [
            {
                "description": "Brand sentiment down 8% WoW on social; complaints about OOS and late delivery",
                "region": "North India",
                "severity": "medium",
                "impact": "Aligns with stockout and delivery issues",
            }
        ],
    },
    "weather": {
        "signals": [
            {
                "description": "Heavy rain and flooding in Delhi NCR (regional weather disruption) last 5 days",
                "region": "Delhi NCR",
                "severity": "high",
                "impact": "Logistics delays and lower footfall; regional revenue drop",
            }
        ],
    },
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
    """Check external social/market signals: competitor_activity, viral_trend, sentiment, or weather.
    Use when Traffic is down to check for competitor activity or negative viral trends.
    Returns JSON with signals list and evidence_trace (source_tool, query_params, raw_data, timestamp)."""
    signal_type = (signal_type or "competitor_activity").lower().replace(" ", "_")
    if signal_type not in _MOCK_SIGNALS:
        signal_type = "competitor_activity"

    data = _MOCK_SIGNALS[signal_type].copy()
    query_params = {"signal_type": signal_type, "region": region, "timeframe": timeframe}
    data["query_params_used"] = query_params
    raw_for_trace = dict(data)
    trace = _evidence_trace("social_signal_analyzer", query_params, raw_for_trace)
    data["evidence_trace"] = trace

    return json.dumps(data)
