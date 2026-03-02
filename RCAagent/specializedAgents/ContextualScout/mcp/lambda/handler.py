import json
import os
from datetime import datetime, timezone
from typing import Any, Dict


def lambda_handler(event, context):
    """
    Lambda handler for Bedrock AgentCore Gateway tools.
    Dispatches by context.client_context.custom["bedrockAgentCoreToolName"]:
    - LambdaTarget___placeholder_tool
    - LambdaTarget___web_search
    - LambdaTarget___social_signal_analyzer
    - LambdaTarget___marketplace_api_fetcher
    - LambdaTarget___inventory_mismatch_checker
    """
    try:
        extended_name = context.client_context.custom.get("bedrockAgentCoreToolName")
        tool_name = None

        if extended_name and "___" in extended_name:
            tool_name = extended_name.split("___", 1)[1]

        if not tool_name:
            return _response(400, {"error": "Missing tool name"})

        dispatch = {
            "placeholder_tool": placeholder_tool,
            "web_search": lambda_web_search,
            "social_signal_analyzer": lambda_social_signal_analyzer,
            "marketplace_api_fetcher": lambda_marketplace_api_fetcher,
            "inventory_mismatch_checker": lambda_inventory_mismatch_checker,
        }
        handler_fn = dispatch.get(tool_name)
        if not handler_fn:
            return _response(400, {"error": f"Unknown tool '{tool_name}'"})

        result = handler_fn(event)
        return _response(200, {"result": result})

    except Exception as e:
        return _response(500, {"system_error": str(e)})


def _response(status_code: int, body: Dict[str, Any]):
    """Consistent JSON response wrapper."""
    return {"statusCode": status_code, "body": json.dumps(body)}


def _evidence_trace_lambda(source_tool: str, query_params: dict, raw_data: dict) -> dict:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def placeholder_tool(event: Dict[str, Any]):
    """No-op placeholder tool."""
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


# ---------------------------------------------------------------------------
# web_search: real Tavily search in Lambda
# ---------------------------------------------------------------------------
def lambda_web_search(event: Dict[str, Any]) -> str:
    """Run a web search via Tavily. Returns JSON with results or error."""
    query = event.get("query", "")
    max_results = event.get("max_results", 5)
    api_key = os.getenv("TAVILY_API_KEY")
    query_params = {"query": query, "max_results": max_results}

    if not api_key:
        data = {
            "error": "TAVILY_API_KEY not configured in Lambda environment.",
            "results": [],
            "query": query,
        }
        data["evidence_trace"] = _evidence_trace_lambda("web_search", query_params, {"error": data["error"]})
        return json.dumps(data)
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=max_results)
        results = [
            {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", ""), "score": r.get("score")}
            for r in response.get("results", [])
        ]
        data = {"results": results, "query": query}
        data["evidence_trace"] = _evidence_trace_lambda("web_search", query_params, data)
        return json.dumps(data)
    except Exception as e:
        data = {"error": str(e), "results": [], "query": query}
        data["evidence_trace"] = _evidence_trace_lambda("web_search", query_params, {"error": str(e)})
        return json.dumps(data)


# ---------------------------------------------------------------------------
# social_signal_analyzer: web search backed
# ---------------------------------------------------------------------------
_SIGNAL_QUERIES = {
    "competitor_activity": "D2C ecommerce competitor flash sale discount India {region}",
    "viral_trend": "viral negative trend ecommerce brand India {region}",
    "sentiment": "ecommerce brand sentiment complaints India {region}",
    "weather": "severe weather disruption logistics India {region}",
}


def _tavily_search_lambda(query: str, max_results: int = 5) -> dict:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {"error": "TAVILY_API_KEY not configured.", "results": []}
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=max_results)
        return {
            "results": [
                {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", ""), "score": r.get("score")}
                for r in response.get("results", [])
            ],
            "query": query,
        }
    except Exception as e:
        return {"error": str(e), "results": [], "query": query}


def lambda_social_signal_analyzer(event: Dict[str, Any]) -> str:
    """Web-search-backed social signal analyzer."""
    signal_type = (event.get("signal_type") or "competitor_activity").lower().replace(" ", "_")
    if signal_type not in _SIGNAL_QUERIES:
        signal_type = "competitor_activity"
    region = event.get("region") or "all regions"
    timeframe = event.get("timeframe", "7d")

    search_query = _SIGNAL_QUERIES[signal_type].format(region=region) + f" last {timeframe}"
    query_params = {"signal_type": signal_type, "region": event.get("region"), "timeframe": timeframe, "search_query": search_query}
    search_result = _tavily_search_lambda(search_query)

    if search_result.get("error"):
        data = {"signals": [], "search_status": "unavailable", "reason": search_result["error"], "query_params_used": query_params}
        data["evidence_trace"] = _evidence_trace_lambda("social_signal_analyzer", query_params, {"search_error": search_result["error"]})
        return json.dumps(data)

    signals = [
        {"description": r.get("content", r.get("title", ""))[:500], "region": event.get("region"), "severity": "unknown", "source_url": r.get("url", ""), "source_title": r.get("title", "")}
        for r in search_result.get("results", [])
    ]
    if not signals:
        data = {"signals": [], "search_status": "no_results", "reason": f"No results for: {search_query}", "query_params_used": query_params}
        data["evidence_trace"] = _evidence_trace_lambda("social_signal_analyzer", query_params, {"search_results_count": 0})
        return json.dumps(data)

    raw_for_trace = {"search_results_count": len(signals), "search_query": search_query}
    data = {"signals": signals, "search_status": "ok", "query_params_used": query_params}
    data["evidence_trace"] = _evidence_trace_lambda("social_signal_analyzer", query_params, raw_for_trace)
    return json.dumps(data)


# ---------------------------------------------------------------------------
# marketplace_api_fetcher: web search backed
# ---------------------------------------------------------------------------
_MARKETPLACE_QUERIES = {
    "myntra": {"sync_latency": "Myntra seller catalog sync delay issues India", "buybox_status": "Myntra seller Buybox loss India", "listing_health": "Myntra listing suppressed India seller"},
    "amazon": {"sync_latency": "Amazon India seller catalog sync delay", "buybox_status": "Amazon India Buybox loss price undercut", "listing_health": "Amazon India listing suppressed deactivated"},
    "shopify": {"sync_latency": "Shopify India store sync delay issues", "buybox_status": "Shopify India seller pricing competition", "listing_health": "Shopify India listing issues product removed"},
}


def lambda_marketplace_api_fetcher(event: Dict[str, Any]) -> str:
    """Web-search-backed marketplace checker."""
    platform = (event.get("platform") or "myntra").lower()
    check_type = (event.get("check_type") or "sync_latency").lower().replace(" ", "_")
    if platform not in _MARKETPLACE_QUERIES:
        platform = "myntra"
    if check_type not in ("sync_latency", "buybox_status", "listing_health"):
        check_type = "sync_latency"

    search_query = _MARKETPLACE_QUERIES.get(platform, {}).get(check_type, f"{platform} {check_type} issues India")
    query_params = {"platform": platform, "check_type": check_type, "search_query": search_query}
    search_result = _tavily_search_lambda(search_query)

    if search_result.get("error"):
        data = {"platform": platform, "check_type": check_type, "status": "unavailable", "details": f"Web search unavailable: {search_result['error']}", "latency_ms": None, "findings": []}
        data["evidence_trace"] = _evidence_trace_lambda("marketplace_api_fetcher", query_params, {"search_error": search_result["error"]})
        return json.dumps(data)

    findings = [{"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")[:500]} for r in search_result.get("results", [])]
    if not findings:
        data = {"platform": platform, "check_type": check_type, "status": "no_data", "details": f"No results for: {search_query}", "latency_ms": None, "findings": []}
        data["evidence_trace"] = _evidence_trace_lambda("marketplace_api_fetcher", query_params, {"search_results_count": 0})
        return json.dumps(data)

    raw_for_trace = {"search_results_count": len(findings), "search_query": search_query}
    data = {"platform": platform, "check_type": check_type, "status": "searched", "details": f"Found {len(findings)} results.", "latency_ms": None, "findings": findings}
    data["evidence_trace"] = _evidence_trace_lambda("marketplace_api_fetcher", query_params, raw_for_trace)
    return json.dumps(data)


# ---------------------------------------------------------------------------
# inventory_mismatch_checker: requires real data source
# ---------------------------------------------------------------------------
def lambda_inventory_mismatch_checker(event: Dict[str, Any]) -> str:
    """Inventory mismatch checker — no mock data, reports no data source connected."""
    query_params = {"sku": event.get("sku"), "demand_region": event.get("demand_region"), "stock_region": event.get("stock_region")}
    no_data = {
        "status": "no_data_source",
        "reason": "No inventory/WMS data source connected in Lambda. Connect an inventory data source to enable this tool.",
    }
    data = {"mismatches": [], "query_params_used": query_params, **no_data}
    data["evidence_trace"] = _evidence_trace_lambda("inventory_mismatch_checker", query_params, no_data)
    return json.dumps(data)
