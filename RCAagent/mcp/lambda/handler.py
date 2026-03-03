"""
MCP Lambda handler for Bedrock AgentCore Gateway.
Dispatches by bedrockAgentCoreToolName to: search, query_sheet, get_revenue_summary,
get_inventory_summary, list_data_schema, placeholder_tool.
"""
import csv
import io
import json
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.request import urlopen, Request

# Optional: use requests if available (for Tavily and controlled timeouts)
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


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
            "search": tool_search,
            "query_sheet": tool_query_sheet,
            "get_revenue_summary": tool_get_revenue_summary,
            "get_inventory_summary": tool_get_inventory_summary,
            "list_data_schema": tool_list_data_schema,
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
# Placeholder (kept for backward compatibility)
# ---------------------------------------------------------------------------
def placeholder_tool(event: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "event_args_received": event,
    }


# ---------------------------------------------------------------------------
# Search (Tavily). Set TAVILY_API_KEY in Lambda env for web search.
# ---------------------------------------------------------------------------
def tool_search(event: Dict[str, Any]) -> Dict[str, Any]:
    """Web search. Event: query (required), max_results (optional, default 5)."""
    query = event.get("query") or event.get("q") or ""
    if not query or not query.strip():
        return {"error": "Missing 'query'", "usage": "Pass query (or q) with the search string."}
    max_results = event.get("max_results", 5)
    if isinstance(max_results, str):
        try:
            max_results = int(max_results)
        except ValueError:
            max_results = 5
    max_results = max(1, min(20, max_results))

    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return {
            "message": "Search is not configured. Set TAVILY_API_KEY in the Lambda environment to enable web search.",
            "query": query,
        }

    if not HAS_REQUESTS:
        return {"error": "requests library required for search", "query": query}

    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query.strip(),
                "max_results": max_results,
                "search_depth": "basic",
                "include_answer": True,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        answer = data.get("answer", "")
        out = {
            "query": query,
            "answer": answer,
            "results": [
                {"title": r.get("title"), "url": r.get("url"), "content": (r.get("content") or "")[:500]}
                for r in results
            ],
        }
        return out
    except requests.RequestException as e:
        return {"error": str(e), "query": query}


# ---------------------------------------------------------------------------
# Helpers: fetch CSV from sheet URL or csv_url
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
    req = Request(url, headers={"User-Agent": "RCAagent-MCP-Lambda/1.0"})
    with urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    return list(reader)


# ---------------------------------------------------------------------------
# query_sheet: KPI-style query from CSV/sheet. Event: sheet_url, metric, segment_dimension, segment_value
# ---------------------------------------------------------------------------
def tool_query_sheet(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Query sheet/CSV for metrics. Event: sheet_url (or csv_url), metric (Revenue|Traffic|CVR|AOV|all),
    segment_dimension (optional), segment_value (optional).
    """
    sheet_url = event.get("sheet_url") or event.get("csv_url")
    if not sheet_url:
        return {"error": "Missing sheet_url or csv_url", "kpi_slices": [], "data_quality_gaps": [{"reason": "missing", "message": "Provide sheet_url or csv_url."}]}

    try:
        rows = _fetch_csv(sheet_url)
    except Exception as e:
        return {"error": str(e), "kpi_slices": [], "data_quality_gaps": [{"reason": "fetch_failed", "message": str(e)}]}

    if not rows:
        return {"kpi_slices": [], "data_quality_gaps": [{"reason": "empty", "message": "No rows in sheet."}]}

    # Normalize column names (case-insensitive, strip)
    first = rows[0]
    col_map = {k.strip().lower(): k for k in first.keys()}
    def get_col(name: str) -> str:
        return col_map.get(name.lower(), name)

    metric = (event.get("metric") or "all").strip()
    segment_dimension = event.get("segment_dimension")
    segment_value = event.get("segment_value")

    # Try to detect numeric columns
    rev_col = get_col("revenue") or get_col("Revenue")
    traffic_col = get_col("traffic") or get_col("Traffic")
    units_col = get_col("units") or get_col("Units")
    segment_col = None
    if segment_dimension and segment_value:
        segment_col = get_col(segment_dimension) or segment_dimension

    def to_float(v: Any) -> float:
        if v is None or v == "":
            return 0.0
        try:
            return float(str(v).replace(",", ""))
        except ValueError:
            return 0.0

    kpi_slices = []
    if segment_col and segment_value:
        segment_rows = [r for r in rows if str(r.get(segment_col, "")).strip() == str(segment_value).strip()]
        if not segment_rows:
            return {"kpi_slices": [], "data_quality_gaps": [{"field_name": f"{segment_dimension}:{segment_value}", "reason": "no_match"}]}
        current_rev = sum(to_float(r.get(rev_col)) for r in segment_rows)
        current_traffic = sum(to_float(r.get(traffic_col)) for r in segment_rows)
        current_units = sum(to_float(r.get(units_col)) for r in segment_rows)
        n = len(segment_rows)
        baseline_rev = current_rev / 2 if n else 0
        baseline_traffic = current_traffic / 2 if n else 0
        kpi_slices = [
            {"metric_name": "Revenue", "current_value": current_rev, "baseline_value": baseline_rev, "delta_percent": ((current_rev - baseline_rev) / baseline_rev * 100) if baseline_rev else 0},
            {"metric_name": "Traffic", "current_value": current_traffic, "baseline_value": baseline_traffic, "delta_percent": ((current_traffic - baseline_traffic) / baseline_traffic * 100) if baseline_traffic else 0},
        ]
    else:
        total_rev = sum(to_float(r.get(rev_col)) for r in rows)
        total_traffic = sum(to_float(r.get(traffic_col)) for r in rows)
        total_units = sum(to_float(r.get(units_col)) for r in rows)
        n = len(rows)
        half = n // 2
        current_rev = sum(to_float(r.get(rev_col)) for r in rows[half:])
        baseline_rev = sum(to_float(r.get(rev_col)) for r in rows[:half]) if half else total_rev / 2
        current_traffic = sum(to_float(r.get(traffic_col)) for r in rows[half:])
        baseline_traffic = sum(to_float(r.get(traffic_col)) for r in rows[:half]) if half else total_traffic / 2
        if metric == "all" or metric == "Revenue":
            kpi_slices.append({"metric_name": "Revenue", "current_value": current_rev, "baseline_value": baseline_rev, "delta_percent": ((current_rev - baseline_rev) / baseline_rev * 100) if baseline_rev else 0})
        if metric == "all" or metric == "Traffic":
            kpi_slices.append({"metric_name": "Traffic", "current_value": current_traffic, "baseline_value": baseline_traffic, "delta_percent": ((current_traffic - baseline_traffic) / baseline_traffic * 100) if baseline_traffic else 0})
        if metric == "all" and total_units and total_traffic:
            cvr = (total_units / total_traffic * 100) if total_traffic else 0
            kpi_slices.append({"metric_name": "CVR", "current_value": round(cvr, 2), "baseline_value": round(cvr, 2), "delta_percent": 0})

    return {"kpi_slices": kpi_slices, "data_quality_gaps": [], "row_count": len(rows)}


# ---------------------------------------------------------------------------
# get_revenue_summary: Aggregate revenue for current vs previous period. Event: sheet_url, period_days (optional)
# ---------------------------------------------------------------------------
def tool_get_revenue_summary(event: Dict[str, Any]) -> Dict[str, Any]:
    """Event: sheet_url (or csv_url), period_days (optional, default 7)."""
    sheet_url = event.get("sheet_url") or event.get("csv_url")
    if not sheet_url:
        return {"error": "Missing sheet_url or csv_url", "summary": None}
    period_days = event.get("period_days", 7)
    if isinstance(period_days, str):
        try:
            period_days = int(period_days)
        except ValueError:
            period_days = 7

    try:
        rows = _fetch_csv(sheet_url)
    except Exception as e:
        return {"error": str(e), "summary": None}

    if not rows:
        return {"summary": {"total_revenue": 0, "current_period_revenue": 0, "previous_period_revenue": 0, "delta_percent": 0, "message": "No rows"}}

    first = rows[0]
    col_map = {k.strip().lower(): k for k in first.keys()}
    rev_col = col_map.get("revenue") or list(first.keys())[0]
    date_col = None
    for d in ("date", "Date", "day"):
        if d in first or d in col_map:
            date_col = col_map.get(d.lower(), d)
            break
    if not date_col:
        date_col = list(first.keys())[0]

    def to_float(v: Any) -> float:
        try:
            return float(str(v).replace(",", ""))
        except (ValueError, TypeError):
            return 0.0

    def parse_date(v: Any) -> Optional[datetime]:
        if not v:
            return None
        s = str(v).strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(s[:10], fmt)
            except ValueError:
                continue
        return None

    total_revenue = 0.0
    by_date: Dict[str, float] = {}
    for r in rows:
        rev = to_float(r.get(rev_col))
        total_revenue += rev
        dt = parse_date(r.get(date_col))
        if dt:
            key = dt.strftime("%Y-%m-%d")
            by_date[key] = by_date.get(key, 0) + rev

    if not by_date:
        return {"summary": {"total_revenue": total_revenue, "current_period_revenue": total_revenue, "previous_period_revenue": 0, "delta_percent": 0, "row_count": len(rows)}}

    sorted_dates = sorted(by_date.keys(), reverse=True)
    current_dates = sorted_dates[:period_days]
    prev_dates = sorted_dates[period_days : period_days * 2]
    current_rev = sum(by_date[d] for d in current_dates)
    prev_rev = sum(by_date[d] for d in prev_dates)
    delta_pct = ((current_rev - prev_rev) / prev_rev * 100) if prev_rev else 0

    return {
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "current_period_revenue": round(current_rev, 2),
            "previous_period_revenue": round(prev_rev, 2),
            "delta_percent": round(delta_pct, 2),
            "current_period_days": period_days,
            "row_count": len(rows),
        },
    }


# ---------------------------------------------------------------------------
# get_inventory_summary: OOS count, by location. Event: sheet_url (or csv_url)
# ---------------------------------------------------------------------------
def tool_get_inventory_summary(event: Dict[str, Any]) -> Dict[str, Any]:
    """Event: sheet_url or csv_url. Expects columns like sku, location, available_qty (or qty, stock)."""
    sheet_url = event.get("sheet_url") or event.get("csv_url")
    if not sheet_url:
        return {"error": "Missing sheet_url or csv_url", "summary": None}

    try:
        rows = _fetch_csv(sheet_url)
    except Exception as e:
        return {"error": str(e), "summary": None}

    if not rows:
        return {"summary": {"oos_count": 0, "total_skus": 0, "by_location": {}, "message": "No rows"}}

    first = rows[0]
    col_map = {k.strip().lower(): k for k in first.keys()}
    sku_col = next((col_map[k] for k in ("sku", "skuid", "product_id") if k in col_map), list(first.keys())[0])
    loc_col = next((col_map[k] for k in ("location", "region", "warehouse", "store") if k in col_map), None)
    qty_col = next((col_map[k] for k in ("available_qty", "qty", "stock", "quantity", "inventory") if k in col_map), None)
    if not qty_col:
        qty_col = list(first.keys())[-1]

    def to_float(v: Any) -> float:
        try:
            return float(str(v).replace(",", ""))
        except (ValueError, TypeError):
            return 0.0

    oos_count = 0
    by_location: Dict[str, Dict[str, Any]] = {}
    skus_seen = set()
    for r in rows:
        sku = str(r.get(sku_col, "")).strip()
        loc = str(r.get(loc_col, "")).strip() if loc_col else "default"
        qty = to_float(r.get(qty_col))
        skus_seen.add((sku, loc))
        if qty <= 0:
            oos_count += 1
        if loc not in by_location:
            by_location[loc] = {"total_skus": 0, "oos_count": 0, "total_units": 0}
        by_location[loc]["total_skus"] += 1
        by_location[loc]["total_units"] += qty
        if qty <= 0:
            by_location[loc]["oos_count"] += 1

    return {
        "summary": {
            "oos_count": oos_count,
            "total_skus": len(skus_seen),
            "by_location": by_location,
            "row_count": len(rows),
        },
    }


# ---------------------------------------------------------------------------
# list_data_schema: Column names and optional sample. Event: sheet_url (or csv_url)
# ---------------------------------------------------------------------------
def tool_list_data_schema(event: Dict[str, Any]) -> Dict[str, Any]:
    """Event: sheet_url or csv_url. Returns column names and first data row as sample."""
    sheet_url = event.get("sheet_url") or event.get("csv_url")
    if not sheet_url:
        return {"error": "Missing sheet_url or csv_url", "columns": [], "sample_row": None}

    try:
        rows = _fetch_csv(sheet_url)
    except Exception as e:
        return {"error": str(e), "columns": [], "sample_row": None}

    if not rows:
        return {"columns": [], "sample_row": None, "row_count": 0}

    columns = list(rows[0].keys())
    sample_row = rows[0] if rows else None
    return {"columns": columns, "sample_row": sample_row, "row_count": len(rows)}
