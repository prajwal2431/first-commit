import json
from datetime import datetime, timezone
from typing import Any, Dict


def lambda_handler(event, context):
    """
    Lambda handler for Bedrock AgentCore Gateway tools.
    Dispatches by context.client_context.custom["bedrockAgentCoreToolName"]:
    - LambdaTarget___placeholder_tool
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

        if tool_name == "placeholder_tool":
            result = placeholder_tool(event)
        elif tool_name == "social_signal_analyzer":
            result = lambda_social_signal_analyzer(event)
        elif tool_name == "marketplace_api_fetcher":
            result = lambda_marketplace_api_fetcher(event)
        elif tool_name == "inventory_mismatch_checker":
            result = lambda_inventory_mismatch_checker(event)
        else:
            return _response(400, {"error": f"Unknown tool '{tool_name}'"})

        return _response(200, {"result": result})

    except Exception as e:
        return _response(500, {"system_error": str(e)})


def _response(status_code: int, body: Dict[str, Any]):
    """Consistent JSON response wrapper."""
    return {"statusCode": status_code, "body": json.dumps(body)}


def placeholder_tool(event: Dict[str, Any]):
    """No-op placeholder tool."""
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


# --- Mock data for social_signal_analyzer (same as src/tools/social_signal_analyzer.py) ---
_MOCK_SIGNALS = {
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


def _evidence_trace_lambda(source_tool: str, query_params: dict, raw_data: dict) -> dict:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def lambda_social_signal_analyzer(event: Dict[str, Any]) -> str:
    """Same mock logic as src/tools/social_signal_analyzer; returns JSON string."""
    signal_type = (event.get("signal_type") or "competitor_activity").lower().replace(" ", "_")
    if signal_type not in _MOCK_SIGNALS:
        signal_type = "competitor_activity"
    region = event.get("region")
    timeframe = event.get("timeframe", "7d")

    data = dict(_MOCK_SIGNALS[signal_type])
    query_params = {"signal_type": signal_type, "region": region, "timeframe": timeframe}
    data["query_params_used"] = query_params
    raw_for_trace = dict(data)
    data["evidence_trace"] = _evidence_trace_lambda("social_signal_analyzer", query_params, raw_for_trace)
    return json.dumps(data)


# --- Mock data for marketplace_api_fetcher ---
_MOCK_MARKETPLACE = {
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


def lambda_marketplace_api_fetcher(event: Dict[str, Any]) -> str:
    """Same mock logic as src/tools/marketplace_api_fetcher; returns JSON string."""
    platform = (event.get("platform") or "myntra").lower()
    check_type = (event.get("check_type") or "sync_latency").lower().replace(" ", "_")
    if platform not in _MOCK_MARKETPLACE:
        platform = "myntra"
    if check_type not in ("sync_latency", "buybox_status", "listing_health"):
        check_type = "sync_latency"

    row = dict(_MOCK_MARKETPLACE[platform][check_type])
    row["platform"] = platform
    row["check_type"] = check_type
    raw_for_trace = dict(row)
    row["evidence_trace"] = _evidence_trace_lambda("marketplace_api_fetcher", {"platform": platform, "check_type": check_type}, raw_for_trace)
    return json.dumps(row)


# --- Mock data for inventory_mismatch_checker ---
_MOCK_MISMATCHES = [
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


def lambda_inventory_mismatch_checker(event: Dict[str, Any]) -> str:
    """Same mock logic as src/tools/inventory_mismatch_checker; returns JSON string."""
    sku = event.get("sku")
    demand_region = event.get("demand_region")
    stock_region = event.get("stock_region")
    query_params = {"sku": sku, "demand_region": demand_region, "stock_region": stock_region}
    out = []

    for m in _MOCK_MISMATCHES:
        if sku and m["sku"] != sku:
            continue
        if demand_region and m["demand_region"] != demand_region:
            continue
        if stock_region and m["stock_region"] != stock_region:
            continue
        row = dict(m)
        raw_for_trace = dict(row)
        row["evidence_trace"] = _evidence_trace_lambda("inventory_mismatch_checker", query_params, raw_for_trace)
        out.append(row)

    payload = {"mismatches": out, "query_params_used": query_params}
    raw_for_trace = dict(payload)
    payload["evidence_trace"] = _evidence_trace_lambda("inventory_mismatch_checker", query_params, raw_for_trace)
    return json.dumps(payload)
