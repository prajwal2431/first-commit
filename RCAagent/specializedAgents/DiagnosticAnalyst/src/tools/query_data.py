"""
query_business_data tool: pull KPI slices (Traffic, CVR, AOV, Revenue)
with optional segment filters. Returns structured data; flags Data Quality Gaps
when data is missing.
"""
import json
import os
from typing import Any

from langchain_core.tools import tool

# Mock data for Indian D2C brand (revenue drop / stockout scenario)
_MOCK_AGGREGATE = {
    "Revenue": {"current": 42.5, "baseline": 52.0, "period": "WoW"},
    "Traffic": {"current": 125000, "baseline": 130000, "period": "WoW"},
    "CVR": {"current": 2.1, "baseline": 2.5, "period": "WoW"},
    "AOV": {"current": 1620, "baseline": 1600, "period": "WoW"},
}

_MOCK_BY_REGION = {
    "North India": {"Revenue": {"current": 18.0, "baseline": 24.0}, "Traffic": {"current": 52000, "baseline": 55000}, "CVR": {"current": 1.8, "baseline": 2.4}, "AOV": {"current": 1615, "baseline": 1600}},
    "South India": {"Revenue": {"current": 14.2, "baseline": 14.5}, "Traffic": {"current": 38000, "baseline": 38000}, "CVR": {"current": 2.2, "baseline": 2.2}, "AOV": {"current": 1625, "baseline": 1620}},
    "West India": {"Revenue": {"current": 6.8, "baseline": 8.0}, "Traffic": {"current": 22000, "baseline": 23000}, "CVR": {"current": 2.0, "baseline": 2.3}, "AOV": {"current": 1630, "baseline": 1610}},
    "East India": {"Revenue": {"current": 3.5, "baseline": 5.5}, "Traffic": {"current": 13000, "baseline": 14000}, "CVR": {"current": 1.9, "baseline": 2.2}, "AOV": {"current": 1610, "baseline": 1595}},
}

_MOCK_BY_CHANNEL = {
    "Myntra": {"Revenue": {"current": 12.0, "baseline": 18.0}, "Traffic": {"current": 45000, "baseline": 48000}, "CVR": {"current": 1.7, "baseline": 2.2}, "AOV": {"current": 1580, "baseline": 1620}},
    "Shopify": {"Revenue": {"current": 22.0, "baseline": 24.0}, "Traffic": {"current": 55000, "baseline": 56000}, "CVR": {"current": 2.4, "baseline": 2.5}, "AOV": {"current": 1650, "baseline": 1640}},
    "Amazon": {"Revenue": {"current": 8.5, "baseline": 10.0}, "Traffic": {"current": 25000, "baseline": 26000}, "CVR": {"current": 2.1, "baseline": 2.2}, "AOV": {"current": 1620, "baseline": 1610}},
}

_MOCK_BY_PINCODE: dict[str, Any] = {}  # Empty = data quality gap when segment_dimension is Pincode


def _to_slice(metric_name: str, current: float, baseline: float, period: str = "WoW") -> dict[str, Any]:
    if baseline == 0:
        delta_pct = 0.0
    else:
        delta_pct = ((current - baseline) / baseline) * 100
    return {
        "metric_name": metric_name,
        "current_value": current,
        "baseline_value": baseline,
        "delta_absolute": round(current - baseline, 4),
        "delta_percent": round(delta_pct, 2),
        "period": period,
    }


def _get_mock_aggregate(metric: str) -> dict[str, Any] | None:
    m = _MOCK_AGGREGATE.get(metric)
    if not m:
        return None
    return _to_slice(metric, m["current"], m["baseline"], m.get("period", "WoW"))


def _get_mock_segment(
    segment_dimension: str, segment_value: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    slices: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []

    if segment_dimension == "Region":
        data = _MOCK_BY_REGION.get(segment_value)
        if not data:
            gaps.append({"field_name": f"Region:{segment_value}", "reason": "missing", "severity": "medium"})
            return slices, gaps
        for metric, v in data.items():
            slices.append(_to_slice(metric, v["current"], v["baseline"]))
    elif segment_dimension == "Channel":
        data = _MOCK_BY_CHANNEL.get(segment_value)
        if not data:
            gaps.append({"field_name": f"Channel:{segment_value}", "reason": "missing", "severity": "medium"})
            return slices, gaps
        for metric, v in data.items():
            slices.append(_to_slice(metric, v["current"], v["baseline"]))
    elif segment_dimension == "Pincode":
        if not _MOCK_BY_PINCODE or segment_value not in _MOCK_BY_PINCODE:
            gaps.append({"field_name": "Pincode", "reason": "missing", "severity": "high"})
        return slices, gaps
    else:
        gaps.append({"field_name": segment_dimension, "reason": "incomplete", "severity": "medium"})

    return slices, gaps


@tool
def query_business_data(
    metric: str = "all",
    period: str = "WoW",
    segment_dimension: str | None = None,
    segment_value: str | None = None,
) -> str:
    """Pull KPI slices for Revenue decomposition. Use metric 'Revenue', 'Traffic', 'CVR', 'AOV', or 'all'.
    Optionally filter by segment_dimension ('Pincode', 'Region', 'Channel') and segment_value (e.g. 'North India', 'Myntra').
    Returns JSON with current and baseline values; includes data_quality_gaps when data is missing."""
    use_mock = os.getenv("LOCAL_DEV") == "1" or not os.getenv("GATEWAY_URL")

    if segment_dimension and segment_value:
        slices, data_quality_gaps = _get_mock_segment(segment_dimension, segment_value)
        out: dict[str, Any] = {"kpi_slices": slices, "data_quality_gaps": data_quality_gaps}
        return json.dumps(out)

    if use_mock:
        if metric == "all":
            slices = []
            for m in ("Revenue", "Traffic", "CVR", "AOV"):
                s = _get_mock_aggregate(m)
                if s:
                    slices.append(s)
            return json.dumps({"kpi_slices": slices, "data_quality_gaps": []})
        s = _get_mock_aggregate(metric)
        if not s:
            return json.dumps({
                "kpi_slices": [],
                "data_quality_gaps": [{"field_name": metric, "reason": "missing", "severity": "medium"}],
            })
        return json.dumps({"kpi_slices": [s], "data_quality_gaps": []})

    # Deployed path: could call real backend; for now return same mock structure
    if metric == "all":
        slices = []
        for m in ("Revenue", "Traffic", "CVR", "AOV"):
            s = _get_mock_aggregate(m)
            if s:
                slices.append(s)
        return json.dumps({"kpi_slices": slices, "data_quality_gaps": []})
    s = _get_mock_aggregate(metric)
    if not s:
        return json.dumps({
            "kpi_slices": [],
            "data_quality_gaps": [{"field_name": metric, "reason": "missing", "severity": "medium"}],
        })
    return json.dumps({"kpi_slices": [s], "data_quality_gaps": []})
