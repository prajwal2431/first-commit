import json
from typing import Any, Dict


def lambda_handler(event, context):
    """
    Lambda handler for Bedrock AgentCore Gateway tools.
    Dispatches by context.client_context.custom["bedrockAgentCoreToolName"]:
    - LambdaTarget___placeholder_tool
    - LambdaTarget___query_business_data
    - LambdaTarget___calculate_contribution_score
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
        elif tool_name == "query_business_data":
            result = lambda_query_business_data(event)
        elif tool_name == "calculate_contribution_score":
            result = lambda_calculate_contribution_score(event)
        else:
            return _response(400, {"error": f"Unknown tool '{tool_name}'"})

        return _response(200, {"result": result})

    except Exception as e:
        return _response(500, {"system_error": str(e)})


def _response(status_code: int, body: Dict[str, Any]):
    """Consistent JSON response wrapper."""
    return {"statusCode": status_code, "body": json.dumps(body)}


def placeholder_tool(event: Dict[str, Any]):
    """
    no-op placeholder tool.

    Demonstrates argument passing from AgentCore Gateway.
    """
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


# --- Mock data for query_business_data (same as src/tools/query_data.py) ---
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


def _to_slice(metric_name: str, current: float, baseline: float, period: str = "WoW") -> Dict[str, Any]:
    delta_pct = ((current - baseline) / baseline) * 100 if baseline else 0.0
    return {
        "metric_name": metric_name,
        "current_value": current,
        "baseline_value": baseline,
        "delta_absolute": round(current - baseline, 4),
        "delta_percent": round(delta_pct, 2),
        "period": period,
    }


def _get_mock_segment(segment_dimension: str, segment_value: str) -> tuple:
    slices = []
    gaps = []
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
        gaps.append({"field_name": "Pincode", "reason": "missing", "severity": "high"})
    else:
        gaps.append({"field_name": segment_dimension, "reason": "incomplete", "severity": "medium"})
    return slices, gaps


def lambda_query_business_data(event: Dict[str, Any]) -> str:
    """Same contract as query_business_data tool: returns JSON string with kpi_slices and data_quality_gaps."""
    metric = event.get("metric", "all")
    segment_dimension = event.get("segment_dimension")
    segment_value = event.get("segment_value")

    if segment_dimension and segment_value:
        slices, gaps = _get_mock_segment(segment_dimension, segment_value)
        return json.dumps({"kpi_slices": slices, "data_quality_gaps": gaps})

    if metric == "all":
        slices = []
        for m in ("Revenue", "Traffic", "CVR", "AOV"):
            row = _MOCK_AGGREGATE.get(m)
            if row:
                slices.append(_to_slice(m, row["current"], row["baseline"], row.get("period", "WoW")))
        return json.dumps({"kpi_slices": slices, "data_quality_gaps": []})

    row = _MOCK_AGGREGATE.get(metric)
    if not row:
        return json.dumps({
            "kpi_slices": [],
            "data_quality_gaps": [{"field_name": metric, "reason": "missing", "severity": "medium"}],
        })
    return json.dumps({"kpi_slices": [_to_slice(metric, row["current"], row["baseline"], row.get("period", "WoW"))], "data_quality_gaps": []})


def _contribution_scores(
    revenue_current: float, revenue_baseline: float,
    traffic_current: float, traffic_baseline: float,
    cvr_current: float, cvr_baseline: float,
    aov_current: float, aov_baseline: float,
) -> list:
    contrib_traffic = (traffic_current - traffic_baseline) * cvr_baseline * aov_baseline
    contrib_cvr = traffic_baseline * (cvr_current - cvr_baseline) * aov_baseline
    contrib_aov = traffic_baseline * cvr_baseline * (aov_current - aov_baseline)
    components = [("Traffic", contrib_traffic), ("CVR", contrib_cvr), ("AOV", contrib_aov)]
    components.sort(key=lambda x: abs(x[1]), reverse=True)
    total_abs = sum(abs(c[1]) for c in components) or 1.0
    result = []
    for rank, (name, contrib) in enumerate(components, start=1):
        direction = "down" if contrib < 0 else "up"
        pct = (abs(contrib) / total_abs * 100) if total_abs else 0.0
        result.append({
            "component_name": name,
            "contribution_value": round(contrib, 4),
            "contribution_percent": round(pct, 2),
            "direction": direction,
            "rank": rank,
        })
    return result


def lambda_calculate_contribution_score(event: Dict[str, Any]) -> str:
    """Same contract as calculate_contribution_score tool: returns JSON string with ranked_drivers."""
    def f(key: str, default: float = 0.0) -> float:
        v = event.get(key)
        return float(v) if v is not None else default

    scores = _contribution_scores(
        f("revenue_current"), f("revenue_baseline"),
        f("traffic_current"), f("traffic_baseline"),
        f("cvr_current"), f("cvr_baseline"),
        f("aov_current"), f("aov_baseline"),
    )
    return json.dumps({"ranked_drivers": scores})