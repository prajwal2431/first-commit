"""
marketplace_api_fetcher tool: check marketplace operational health
(sync latency, Buybox status, listing health) via web search.
No mock/fake data. When web search is unavailable, explicitly says so.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

from .web_search import _search_tavily

_MARKETPLACE_QUERIES: dict[str, dict[str, str]] = {
    "myntra": {
        "sync_latency": "Myntra seller catalog sync delay issues India",
        "buybox_status": "Myntra seller Buybox loss competition India",
        "listing_health": "Myntra listing suppressed removed India seller",
    },
    "amazon": {
        "sync_latency": "Amazon India seller catalog sync delay issues",
        "buybox_status": "Amazon India Buybox loss price undercut seller",
        "listing_health": "Amazon India listing suppressed deactivated seller",
    },
    "shopify": {
        "sync_latency": "Shopify India store sync delay issues",
        "buybox_status": "Shopify India seller competition pricing",
        "listing_health": "Shopify India listing issues product removed",
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
    """Check marketplace operational health via web search: sync_latency, buybox_status, or listing_health
    for myntra, amazon, or shopify. Uses real web search (Tavily). If no results or no API key, clearly
    states 'no data found'. Never returns fake data. Returns JSON with findings and evidence_trace."""
    platform = (platform or "myntra").lower()
    check_type = (check_type or "sync_latency").lower().replace(" ", "_")
    valid_platforms = ("myntra", "amazon", "shopify")
    valid_checks = ("sync_latency", "buybox_status", "listing_health")
    if platform not in valid_platforms:
        platform = "myntra"
    if check_type not in valid_checks:
        check_type = "sync_latency"

    search_query = _MARKETPLACE_QUERIES.get(platform, {}).get(
        check_type, f"{platform} {check_type} issues India"
    )
    query_params = {"platform": platform, "check_type": check_type, "search_query": search_query}

    search_result = _search_tavily(search_query, max_results=5)

    if search_result.get("error"):
        data = {
            "platform": platform,
            "check_type": check_type,
            "status": "unavailable",
            "details": f"Web search unavailable: {search_result['error']}",
            "latency_ms": None,
            "findings": [],
        }
        trace = _evidence_trace("marketplace_api_fetcher", query_params, {"search_error": search_result["error"]})
        data["evidence_trace"] = trace
        return json.dumps(data)

    findings: list[dict[str, Any]] = []
    for r in search_result.get("results", []):
        findings.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", "")[:500],
        })

    if not findings:
        data = {
            "platform": platform,
            "check_type": check_type,
            "status": "no_data",
            "details": f"No web search results found for: {search_query}",
            "latency_ms": None,
            "findings": [],
        }
        trace = _evidence_trace("marketplace_api_fetcher", query_params, {"search_results_count": 0})
        data["evidence_trace"] = trace
        return json.dumps(data)

    raw_for_trace = {
        "search_results_count": len(findings),
        "search_query": search_query,
        "results_summary": [{"title": f["title"], "url": f["url"]} for f in findings],
    }
    trace = _evidence_trace("marketplace_api_fetcher", query_params, raw_for_trace)
    data = {
        "platform": platform,
        "check_type": check_type,
        "status": "searched",
        "details": f"Found {len(findings)} web results about {platform} {check_type}.",
        "latency_ms": None,
        "findings": findings,
        "evidence_trace": trace,
    }
    return json.dumps(data)
