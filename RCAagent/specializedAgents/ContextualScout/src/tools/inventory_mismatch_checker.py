"""
inventory_mismatch_checker tool: audit supply chain for inventory mismatch.
This requires real inventory/WMS data from the user's systems.
No mock/fake data — clearly reports when no data source is connected.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Live inventory data cache: populated externally (e.g. from a sheet or WMS integration)
_LIVE_INVENTORY: dict[str, Any] | None = None

_NO_DATA_SOURCE = {
    "status": "no_data_source",
    "reason": "No inventory/WMS data source connected. Provide inventory data via sheet_url, "
              "WMS API, or other integration to enable supply chain mismatch detection.",
}


def set_live_inventory(data: dict[str, Any]) -> None:
    """Called externally to supply inventory data (e.g. from a Google Sheet or WMS API)."""
    global _LIVE_INVENTORY
    _LIVE_INVENTORY = data


def clear_live_inventory() -> None:
    global _LIVE_INVENTORY
    _LIVE_INVENTORY = None


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
    """Check for inventory mismatch: demand high in one region but stock trapped in another.
    Requires real inventory data from a connected data source (sheet, WMS API).
    If no data source is connected, explicitly says so — never returns fake data.
    Returns JSON with mismatches list and evidence_trace."""
    query_params = {"sku": sku, "demand_region": demand_region, "stock_region": stock_region}

    if _LIVE_INVENTORY is None:
        data = {
            "mismatches": [],
            "query_params_used": query_params,
            **_NO_DATA_SOURCE,
        }
        trace = _evidence_trace("inventory_mismatch_checker", query_params, _NO_DATA_SOURCE)
        data["evidence_trace"] = trace
        return json.dumps(data)

    mismatches_raw = _LIVE_INVENTORY.get("mismatches", [])
    out: list[dict[str, Any]] = []

    for m in mismatches_raw:
        if sku and m.get("sku") != sku:
            continue
        if demand_region and m.get("demand_region") != demand_region:
            continue
        if stock_region and m.get("stock_region") != stock_region:
            continue
        row = dict(m)
        raw_for_trace = dict(row)
        row["evidence_trace"] = _evidence_trace("inventory_mismatch_checker", query_params, raw_for_trace)
        out.append(row)

    payload = {
        "mismatches": out,
        "query_params_used": query_params,
        "status": "ok" if out else "no_mismatches_found",
    }
    raw_for_trace = {"mismatches_count": len(out), "query_params": query_params}
    payload["evidence_trace"] = _evidence_trace("inventory_mismatch_checker", query_params, raw_for_trace)
    return json.dumps(payload)
