"""
Google Sheets tools for the Diagnostic Analyst.
- load_google_sheet: reads raw sheet data (tabs, headers, sample rows)
- extract_kpi_data: takes raw data + LLM column mapping, produces structured KPI dicts
"""
import json
import os
import re
from typing import Any

from langchain_core.tools import tool


def _get_gspread_client(credentials_json: dict | None = None):
    """Build an authorized gspread client from service account credentials."""
    import gspread
    from google.oauth2.service_account import Credentials

    SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

    if credentials_json:
        creds = Credentials.from_service_account_info(credentials_json, scopes=SCOPES)
    else:
        raw = os.getenv("GOOGLE_SHEETS_CREDENTIALS", "")
        if not raw:
            raise RuntimeError("No Google Sheets credentials: set GOOGLE_SHEETS_CREDENTIALS env var or pass credentials_json")
        creds = Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    return gspread.authorize(creds)


_MAX_SAMPLE_ROWS = 20


@tool
def load_google_sheet(sheet_url: str) -> str:
    """Read a Google Sheet and return tab names, column headers, and sample rows as a text summary.
    The LLM uses this to figure out which columns map to Revenue, Traffic, CVR, AOV, and segment dimensions.
    Returns a text description of each tab with up to 20 sample rows."""
    gc = _get_gspread_client()
    spreadsheet = gc.open_by_url(sheet_url)
    worksheets = spreadsheet.worksheets()

    parts: list[str] = [f"Spreadsheet: {spreadsheet.title}", f"Tabs found: {[ws.title for ws in worksheets]}", ""]

    raw_tabs: dict[str, list[dict[str, Any]]] = {}

    for ws in worksheets:
        all_records = ws.get_all_records()
        if not all_records:
            parts.append(f'Tab "{ws.title}": (empty)')
            parts.append("")
            continue

        headers = list(all_records[0].keys())
        sample = all_records[:_MAX_SAMPLE_ROWS]
        raw_tabs[ws.title] = all_records

        parts.append(f'Tab "{ws.title}" (columns: {", ".join(headers)}, total rows: {len(all_records)}):')
        for i, row in enumerate(sample):
            vals = [str(row.get(h, "")) for h in headers]
            parts.append(f"  Row {i + 1}: {', '.join(vals)}")
        if len(all_records) > _MAX_SAMPLE_ROWS:
            parts.append(f"  ... ({len(all_records) - _MAX_SAMPLE_ROWS} more rows)")
        parts.append("")

    summary = "\n".join(parts)
    out = {
        "summary": summary,
        "raw_tabs": {tab_name: rows for tab_name, rows in raw_tabs.items()},
    }
    return json.dumps(out)


def _parse_numeric(value: Any) -> float:
    """Parse a cell value to float; handles '2.5%', '1,620', '$42.5', etc."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return 0.0
    s = value.strip()
    is_pct = s.endswith("%")
    s = re.sub(r"[₹$€,% ]", "", s)
    try:
        v = float(s)
        if is_pct:
            return v
        return v
    except (ValueError, TypeError):
        return 0.0


def _apply_mapping(
    raw_tabs: dict[str, list[dict[str, Any]]],
    mapping: dict[str, Any],
) -> dict[str, Any]:
    """
    Given raw sheet data and the LLM-produced mapping, extract structured KPI data.

    Expected mapping shape:
    {
        "aggregate_tab": "Sales Data",
        "aggregate_mapping": {
            "date_col": "Date",
            "Revenue": "Total Revenue",
            "Traffic": "Sessions",
            "CVR": "Conv Rate",
            "AOV": "Avg Basket"
        },
        "segment_tabs": [
            {
                "tab": "Regional",
                "dimension": "Region",
                "dimension_col": "Zone",
                "date_col": "Week",
                "Revenue": "Rev",
                "Traffic": "Visits",
                "CVR": "CR",
                "AOV": "AOV"
            }
        ],
        "period_detection": {
            "current_row_index": -1,
            "baseline_row_index": -2,
            "period_label": "WoW"
        }
    }
    """
    result: dict[str, Any] = {
        "aggregate": {},
        "by_region": {},
        "by_channel": {},
        "by_pincode": {},
    }
    data_quality_gaps: list[dict[str, Any]] = []
    period_label = mapping.get("period_detection", {}).get("period_label", "WoW")
    cur_idx = mapping.get("period_detection", {}).get("current_row_index", -1)
    base_idx = mapping.get("period_detection", {}).get("baseline_row_index", -2)

    # --- Aggregate tab ---
    agg_tab_name = mapping.get("aggregate_tab")
    agg_map = mapping.get("aggregate_mapping", {})
    if agg_tab_name and agg_tab_name in raw_tabs:
        rows = raw_tabs[agg_tab_name]
        if rows:
            try:
                cur_row = rows[cur_idx]
                base_row = rows[base_idx]
            except (IndexError, KeyError):
                cur_row = rows[-1] if rows else {}
                base_row = rows[-2] if len(rows) >= 2 else cur_row

            for kpi in ("Revenue", "Traffic", "CVR", "AOV"):
                col = agg_map.get(kpi)
                if not col or col not in cur_row:
                    data_quality_gaps.append({"field_name": kpi, "reason": "missing", "severity": "high"})
                    continue
                result["aggregate"][kpi] = {
                    "current": _parse_numeric(cur_row.get(col)),
                    "baseline": _parse_numeric(base_row.get(col)),
                    "period": period_label,
                }
    elif agg_tab_name:
        data_quality_gaps.append({"field_name": f"Tab:{agg_tab_name}", "reason": "missing", "severity": "high"})

    # --- Segment tabs ---
    dim_to_bucket = {"Region": "by_region", "Channel": "by_channel", "Pincode": "by_pincode"}
    for seg in mapping.get("segment_tabs", []):
        tab_name = seg.get("tab")
        dimension = seg.get("dimension")
        dim_col = seg.get("dimension_col")
        bucket = dim_to_bucket.get(dimension, "")
        if not tab_name or tab_name not in raw_tabs or not bucket:
            if dimension:
                data_quality_gaps.append({"field_name": f"{dimension}:{tab_name}", "reason": "missing", "severity": "medium"})
            continue

        rows = raw_tabs[tab_name]
        segments_seen: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            seg_val = str(row.get(dim_col, "")).strip()
            if not seg_val:
                continue
            if seg_val not in segments_seen:
                segments_seen[seg_val] = []
            segments_seen[seg_val].append(row)

        date_col = seg.get("date_col")
        for seg_val, seg_rows in segments_seen.items():
            if len(seg_rows) < 2:
                data_quality_gaps.append({
                    "field_name": f"{dimension}:{seg_val}",
                    "reason": "incomplete",
                    "severity": "low",
                })
                continue
            try:
                cur_row = seg_rows[cur_idx]
                base_row = seg_rows[base_idx]
            except IndexError:
                cur_row = seg_rows[-1]
                base_row = seg_rows[-2]

            entry: dict[str, dict[str, float]] = {}
            for kpi in ("Revenue", "Traffic", "CVR", "AOV"):
                col = seg.get(kpi)
                if not col or col not in cur_row:
                    continue
                entry[kpi] = {
                    "current": _parse_numeric(cur_row.get(col)),
                    "baseline": _parse_numeric(base_row.get(col)),
                }
            if entry:
                result[bucket][seg_val] = entry

    return {"data": result, "data_quality_gaps": data_quality_gaps}


@tool
def extract_kpi_data(raw_tabs_json: str, column_mapping_json: str) -> str:
    """Given raw sheet data (from load_google_sheet) and a column mapping (from LLM analysis),
    extract structured KPI data. The column_mapping_json must be a JSON object with keys:
    aggregate_tab, aggregate_mapping (with Revenue/Traffic/CVR/AOV column names),
    segment_tabs (list with tab/dimension/dimension_col/Revenue/Traffic/CVR/AOV column names),
    period_detection (current_row_index, baseline_row_index, period_label).
    Returns JSON with 'data' (aggregate/by_region/by_channel/by_pincode) and 'data_quality_gaps'."""
    try:
        raw_tabs = json.loads(raw_tabs_json) if isinstance(raw_tabs_json, str) else raw_tabs_json
        mapping = json.loads(column_mapping_json) if isinstance(column_mapping_json, str) else column_mapping_json
    except json.JSONDecodeError as e:
        return json.dumps({"data": {}, "data_quality_gaps": [{"field_name": "parsing", "reason": f"Invalid JSON: {e}", "severity": "high"}]})

    extracted = _apply_mapping(raw_tabs, mapping)

    # Inject into the query_data live cache so query_business_data reads real data
    from .query_data import set_live_data
    set_live_data(extracted["data"])

    return json.dumps({
        "data": extracted["data"],
        "data_quality_gaps": extracted["data_quality_gaps"],
        "segments_found": {
            "regions": list(extracted["data"].get("by_region", {}).keys()),
            "channels": list(extracted["data"].get("by_channel", {}).keys()),
            "pincodes": list(extracted["data"].get("by_pincode", {}).keys()),
        },
    })
