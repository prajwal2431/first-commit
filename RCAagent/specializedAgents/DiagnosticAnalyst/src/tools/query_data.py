"""
query_business_data tool: pull KPI slices (Traffic, CVR, AOV, Revenue)
with optional segment filters. Returns structured data; flags Data Quality Gaps
when data is missing.

Data comes only from set_live_data() (e.g. after parsing a Google Sheet via worker_ingest).
When no data source is set, returns empty kpi_slices and a Data Quality Gap — no mock/fake data.
"""
import json
from typing import Any

from langchain_core.tools import tool

# ---------------------------------------------------------------------------
# Live data cache: populated by extract_kpi_data after parsing a Google Sheet
# ---------------------------------------------------------------------------
_LIVE_DATA: dict[str, Any] | None = None

_NO_DATA_SOURCE_GAP = {
    "field_name": "data_source",
    "reason": "missing",
    "severity": "high",
    "message": "No data source. Provide sheet_url in the request payload to load a Google Sheet, or connect a backend data source.",
}


def set_live_data(data: dict[str, Any]) -> None:
    """Called by extract_kpi_data after parsing a sheet. Supplies the only source of KPI data."""
    global _LIVE_DATA
    _LIVE_DATA = data


def clear_live_data() -> None:
    """Reset live data (e.g. between requests or in tests)."""
    global _LIVE_DATA
    _LIVE_DATA = None


def _get_aggregate() -> dict[str, Any]:
    if _LIVE_DATA:
        return _LIVE_DATA.get("aggregate", {})
    return {}


def _get_segment_store(dimension: str) -> dict[str, Any]:
    if _LIVE_DATA:
        mapping = {"Region": "by_region", "Channel": "by_channel", "Pincode": "by_pincode"}
        return _LIVE_DATA.get(mapping.get(dimension, ""), {})
    return {}


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


def _get_aggregate_slice(metric: str) -> dict[str, Any] | None:
    agg = _get_aggregate()
    m = agg.get(metric)
    if not m:
        return None
    return _to_slice(metric, m["current"], m["baseline"], m.get("period", "WoW"))


def _get_segment(
    segment_dimension: str, segment_value: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    slices: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []

    store = _get_segment_store(segment_dimension)
    if not store:
        gaps.append(_NO_DATA_SOURCE_GAP if not _LIVE_DATA else {"field_name": segment_dimension, "reason": "missing", "severity": "medium"})
        return slices, gaps

    data = store.get(segment_value)
    if not data:
        gaps.append({"field_name": f"{segment_dimension}:{segment_value}", "reason": "missing", "severity": "medium"})
        return slices, gaps

    for metric, v in data.items():
        if isinstance(v, dict) and "current" in v and "baseline" in v:
            slices.append(_to_slice(metric, v["current"], v["baseline"]))

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
    Data must be loaded first via a Google Sheet (sheet_url) or other data source. Returns JSON with current and baseline values; includes data_quality_gaps when data is missing or no source provided."""

    if segment_dimension and segment_value:
        slices, data_quality_gaps = _get_segment(segment_dimension, segment_value)
        if not _LIVE_DATA and not data_quality_gaps:
            data_quality_gaps = [_NO_DATA_SOURCE_GAP]
        out: dict[str, Any] = {"kpi_slices": slices, "data_quality_gaps": data_quality_gaps}
        return json.dumps(out)

    if metric == "all":
        slices = []
        gaps = []
        if not _LIVE_DATA:
            gaps.append(_NO_DATA_SOURCE_GAP)
        else:
            for m in ("Revenue", "Traffic", "CVR", "AOV"):
                s = _get_aggregate_slice(m)
                if s:
                    slices.append(s)
                else:
                    gaps.append({"field_name": m, "reason": "missing", "severity": "medium"})
        return json.dumps({"kpi_slices": slices, "data_quality_gaps": gaps})

    s = _get_aggregate_slice(metric)
    if not s:
        gaps = [_NO_DATA_SOURCE_GAP] if not _LIVE_DATA else [{"field_name": metric, "reason": "missing", "severity": "medium"}]
        return json.dumps({
            "kpi_slices": [],
            "data_quality_gaps": gaps,
        })
    return json.dumps({"kpi_slices": [s], "data_quality_gaps": []})
