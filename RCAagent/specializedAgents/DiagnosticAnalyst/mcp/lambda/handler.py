"""
MCP Lambda handler for Diagnostic Analyst (Bedrock AgentCore Gateway).
Tools: placeholder_tool, query_business_data (with sheet_url/CSV fetch), calculate_contribution_score.
Sheet data uses public CSV export from Google Sheet URL (same approach as parent RCAagent).
"""
import csv
import io
import json
import re
from typing import Any, Dict, List
from urllib.request import Request, urlopen


def lambda_handler(event, context):
    """
    Gateway passes tool name in context.client_context.custom["bedrockAgentCoreToolName"]
    as "LambdaTarget___<tool_name>". Event contains tool arguments (flat key-value).
    """
    try:
        extended_name = context.client_context.custom.get("bedrockAgentCoreToolName")
        tool_name = None
        if extended_name and "___" in extended_name:
            tool_name = extended_name.split("___", 1)[1]

        if not tool_name:
            return _response(400, {"error": "Missing tool name"})

        dispatcher = {
            "placeholder_tool": placeholder_tool,
            "query_business_data": lambda_query_business_data,
            "calculate_contribution_score": lambda_calculate_contribution_score,
        }
        if tool_name not in dispatcher:
            return _response(400, {"error": f"Unknown tool '{tool_name}'"})

        result = dispatcher[tool_name](event)
        return _response(200, {"result": result})
    except Exception as e:
        return _response(500, {"system_error": str(e)})


def _response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {"statusCode": status_code, "body": json.dumps(body)}


# ---------------------------------------------------------------------------
# Placeholder
# ---------------------------------------------------------------------------
def placeholder_tool(event: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


# ---------------------------------------------------------------------------
# Sheet/CSV helpers (same pattern as RCAagent/mcp/lambda/handler.py)
# ---------------------------------------------------------------------------
def _sheet_url_to_csv_export(sheet_url: str) -> str:
    """Convert a Google Sheet sharing URL to CSV export URL (first sheet)."""
    if "docs.google.com/spreadsheets" in sheet_url:
        match = re.search(r"/d/([a-zA-Z0-9_-]+)", sheet_url)
        if match:
            sheet_id = match.group(1)
            return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid=0"
    return sheet_url


def _fetch_csv(sheet_url: str) -> List[Dict[str, str]]:
    """Fetch URL (sheet export or raw CSV) and return list of row dicts (first row = headers)."""
    url = _sheet_url_to_csv_export(sheet_url)
    req = Request(url, headers={"User-Agent": "DiagnosticAnalyst-MCP-Lambda/1.0"})
    with urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    return list(reader)


_NO_DATA_SOURCE_GAP = {
    "field_name": "data_source",
    "reason": "missing",
    "severity": "high",
    "message": "No data source. Provide sheet_url (or csv_url) in the request to load data from a Google Sheet or CSV.",
}


def _to_float(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return 0.0


def _to_slice(metric_name: str, current: float, baseline: float, period: str = "WoW") -> Dict[str, Any]:
    delta_abs = round(current - baseline, 4)
    delta_pct = ((current - baseline) / baseline * 100) if baseline else 0.0
    return {
        "metric_name": metric_name,
        "current_value": current,
        "baseline_value": baseline,
        "delta_absolute": delta_abs,
        "delta_percent": round(delta_pct, 2),
        "period": period,
    }


def lambda_query_business_data(event: Dict[str, Any]) -> str:
    """
    Same contract as query_business_data: returns JSON with kpi_slices and data_quality_gaps.
    Event: sheet_url (or csv_url), metric ('all'|'Revenue'|'Traffic'|'CVR'|'AOV'), period (default WoW),
    segment_dimension, segment_value.
    When sheet_url is provided, fetches CSV and computes current vs baseline (second half vs first half of rows).
    """
    sheet_url = event.get("sheet_url") or event.get("csv_url")
    metric = (event.get("metric") or "all").strip()
    period = (event.get("period") or "WoW").strip()
    segment_dimension = event.get("segment_dimension")
    segment_value = event.get("segment_value")

    if not sheet_url:
        return json.dumps({"kpi_slices": [], "data_quality_gaps": [_NO_DATA_SOURCE_GAP]})

    try:
        rows = _fetch_csv(sheet_url)
    except Exception as e:
        return json.dumps({
            "kpi_slices": [],
            "data_quality_gaps": [{"field_name": "fetch", "reason": "fetch_failed", "severity": "high", "message": str(e)}],
        })

    if not rows:
        return json.dumps({
            "kpi_slices": [],
            "data_quality_gaps": [{"field_name": "sheet", "reason": "empty", "severity": "medium", "message": "No rows in sheet."}],
        })

    first = rows[0]
    col_map = {k.strip().lower(): k for k in first.keys()}
    first_col = list(first.keys())[0] if first else ""

    def get_col(name: str) -> str:
        return col_map.get(name.lower(), "") or col_map.get(name, "")

    rev_col = get_col("revenue") or get_col("Revenue") or first_col
    traffic_col = get_col("traffic") or get_col("Traffic") or get_col("sessions") or get_col("Sessions")
    units_col = get_col("units") or get_col("Units") or get_col("orders") or get_col("Orders")
    segment_col = None
    if segment_dimension and segment_value:
        segment_col = get_col(segment_dimension) or segment_dimension

    if segment_col and segment_value:
        segment_rows = [r for r in rows if str(r.get(segment_col, "")).strip() == str(segment_value).strip()]
        if not segment_rows:
            return json.dumps({
                "kpi_slices": [],
                "data_quality_gaps": [{"field_name": f"{segment_dimension}:{segment_value}", "reason": "no_match", "severity": "medium"}],
            })
        rows = segment_rows

    n = len(rows)
    half = n // 2
    current_rows = rows[half:] if half else rows
    baseline_rows = rows[:half] if half else rows

    def sum_col(col: str) -> float:
        if not col:
            return 0.0
        return sum(_to_float(r.get(col)) for r in rows)

    def sum_col_subset(rs: List[Dict], col: str) -> float:
        if not col:
            return 0.0
        return sum(_to_float(r.get(col)) for r in rs)

    current_rev = sum_col_subset(current_rows, rev_col)
    baseline_rev = sum_col_subset(baseline_rows, rev_col) if baseline_rows else current_rev / 2
    current_traffic = sum_col_subset(current_rows, traffic_col)
    baseline_traffic = sum_col_subset(baseline_rows, traffic_col) if baseline_rows else current_traffic / 2
    total_units = sum_col(units_col)
    total_traffic = sum_col(traffic_col)

    kpi_slices: List[Dict[str, Any]] = []
    if metric in ("all", "Revenue"):
        kpi_slices.append(_to_slice("Revenue", current_rev, baseline_rev, period))
    if metric in ("all", "Traffic"):
        kpi_slices.append(_to_slice("Traffic", current_traffic, baseline_traffic, period))

    if metric == "all" and total_traffic and total_units:
        cvr = (total_units / total_traffic * 100) if total_traffic else 0.0
        kpi_slices.append(_to_slice("CVR", round(cvr, 2), round(cvr, 2), period))
    if metric == "CVR" and total_traffic and total_units:
        cvr = (total_units / total_traffic * 100) if total_traffic else 0.0
        kpi_slices.append(_to_slice("CVR", round(cvr, 2), round(cvr, 2), period))

    if metric == "all" and current_rev and current_traffic:
        aov_cur = (current_rev / current_traffic) if current_traffic else 0.0
        aov_base = (baseline_rev / baseline_traffic) if baseline_traffic else aov_cur
        kpi_slices.append(_to_slice("AOV", round(aov_cur, 2), round(aov_base, 2), period))
    if metric == "AOV" and current_rev and current_traffic:
        aov_cur = (current_rev / current_traffic) if current_traffic else 0.0
        aov_base = (baseline_rev / baseline_traffic) if baseline_traffic else aov_cur
        kpi_slices.append(_to_slice("AOV", round(aov_cur, 2), round(aov_base, 2), period))

    return json.dumps({"kpi_slices": kpi_slices, "data_quality_gaps": []})


def _contribution_scores(
    revenue_current: float,
    revenue_baseline: float,
    traffic_current: float,
    traffic_baseline: float,
    cvr_current: float,
    cvr_baseline: float,
    aov_current: float,
    aov_baseline: float,
) -> List[Dict[str, Any]]:
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
    """Same contract as calculate_contribution_score: returns JSON string with ranked_drivers."""

    def f(key: str, default: float = 0.0) -> float:
        v = event.get(key)
        if v is None:
            return default
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    scores = _contribution_scores(
        f("revenue_current"), f("revenue_baseline"),
        f("traffic_current"), f("traffic_baseline"),
        f("cvr_current"), f("cvr_baseline"),
        f("aov_current"), f("aov_baseline"),
    )
    return json.dumps({"ranked_drivers": scores})
