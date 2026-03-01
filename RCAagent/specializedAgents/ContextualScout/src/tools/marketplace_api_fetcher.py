"""
marketplace_api_fetcher tool: check Myntra/Amazon/Shopify sync latency,
Buybox status, and listing health. Returns structured data with evidence_trace.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Mock marketplace data for Indian D2C (revenue drop scenario)
_MOCK_MARKETPLACE: dict[str, dict[str, Any]] = {
    "myntra": {
        "sync_latency": {"status": "warning", "latency_ms": 15120000, "details": "Catalog sync delay ~4.2 hours"},
        "buybox_status": {"status": "ok", "latency_ms": None, "details": "Buybox held"},
        "listing_health": {"status": "warning", "latency_ms": None, "details": "3 listings suppressed for image mismatch"},
    },
    "amazon": {
        "sync_latency": {"status": "ok", "latency_ms": 300000, "details": "~5 min sync"},
        "buybox_status": {"status": "error", "latency_ms": None, "details": "Buybox lost on top 3 SKUs (price undercut)"},
        "listing_health": {"status": "ok", "latency_ms": None, "details": "Listings live"},
    },
    "shopify": {
        "sync_latency": {"status": "ok", "latency_ms": 120000, "details": "~2 min sync"},
        "buybox_status": {"status": "ok", "latency_ms": None, "details": "N/A (direct)"},
        "listing_health": {"status": "ok", "latency_ms": None, "details": "All listings healthy"},
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
def marketplace_api_fetcher(
    platform: str,
    check_type: str,
) -> str:
    """Check marketplace operational health: sync_latency, buybox_status, or listing_health for myntra, amazon, or shopify.
    Use to check for Myntra/Amazon sync latency or Buybox losses. Returns JSON with status, latency_ms if applicable, details, and evidence_trace."""
    platform = (platform or "myntra").lower()
    check_type = (check_type or "sync_latency").lower().replace(" ", "_")
    if platform not in _MOCK_MARKETPLACE:
        platform = "myntra"
    if check_type not in ("sync_latency", "buybox_status", "listing_health"):
        check_type = "sync_latency"

    row = _MOCK_MARKETPLACE[platform][check_type].copy()
    row["platform"] = platform
    row["check_type"] = check_type
    query_params = {"platform": platform, "check_type": check_type}
    raw_for_trace = dict(row)
    trace = _evidence_trace("marketplace_api_fetcher", query_params, raw_for_trace)
    row["evidence_trace"] = trace

    return json.dumps(row)
