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


# --- No mock data: Lambda has no sheet access; return empty + Data Quality Gap ---
_NO_DATA_SOURCE_GAP = {
    "field_name": "data_source",
    "reason": "missing",
    "severity": "high",
    "message": "No data source. Provide sheet_url in the request to load a Google Sheet from the agent, or connect this Lambda to a backend data source.",
}


def lambda_query_business_data(event: Dict[str, Any]) -> str:
    """Same contract as query_business_data tool: returns JSON with kpi_slices and data_quality_gaps.
    Lambda has no built-in data; returns empty slices and a data_source gap. Connect to your backend/DB if needed."""
    metric = event.get("metric", "all")
    segment_dimension = event.get("segment_dimension")
    segment_value = event.get("segment_value")

    gaps = [_NO_DATA_SOURCE_GAP]
    if segment_dimension and segment_value:
        return json.dumps({"kpi_slices": [], "data_quality_gaps": gaps})

    if metric == "all":
        return json.dumps({"kpi_slices": [], "data_quality_gaps": gaps})
    return json.dumps({
        "kpi_slices": [],
        "data_quality_gaps": gaps,
    })


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