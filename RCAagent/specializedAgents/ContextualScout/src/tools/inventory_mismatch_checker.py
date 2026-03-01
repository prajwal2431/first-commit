"""
inventory_mismatch_checker tool: audit supply chain for inventory mismatch
where demand is high in one region but stock is trapped in another. Returns
structured data with evidence_trace.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Mock inventory mismatch data for Indian D2C (stockout scenario)
_MOCK_MISMATCHES: list[dict[str, Any]] = [
    {
        "sku": "SKU-1234",
        "demand_region": "Delhi",
        "stock_region": "Mumbai",
        "demand_units": 800,
        "available_units": 650,
        "mismatch_severity": "high",
        "details": "Demand high in Delhi; 650 units stuck in Mumbai warehouse, transfer 3–5 days",
    },
    {
        "sku": "SKU-5678",
        "demand_region": "Bangalore",
        "stock_region": "Chennai",
        "demand_units": 420,
        "available_units": 380,
        "mismatch_severity": "medium",
        "details": "Bangalore demand spike; stock in Chennai, 1–2 day transfer",
    },
]


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@tool
def inventory_mismatch_checker(
    sku: str | None = None,
    demand_region: str | None = None,
    stock_region: str | None = None,
) -> str:
    """Check for inventory mismatch: demand high in one region (e.g. Delhi) but stock trapped in another (e.g. Mumbai).
    Supply chain audit for Indian D2C. Optional filters: sku, demand_region, stock_region. Returns JSON list of mismatches with evidence_trace."""
    query_params = {"sku": sku, "demand_region": demand_region, "stock_region": stock_region}
    out: list[dict[str, Any]] = []

    for m in _MOCK_MISMATCHES:
        if sku and m["sku"] != sku:
            continue
        if demand_region and m["demand_region"] != demand_region:
            continue
        if stock_region and m["stock_region"] != stock_region:
            continue
        row = m.copy()
        raw_for_trace = dict(row)
        trace = _evidence_trace("inventory_mismatch_checker", query_params, raw_for_trace)
        row["evidence_trace"] = trace
        out.append(row)

    payload = {"mismatches": out, "query_params_used": query_params}
    raw_for_trace = dict(payload)
    payload["evidence_trace"] = _evidence_trace("inventory_mismatch_checker", query_params, raw_for_trace)
    return json.dumps(payload)
