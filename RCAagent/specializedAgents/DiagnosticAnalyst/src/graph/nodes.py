"""
Supervisor and worker nodes for the Diagnostic Analyst graph.
Supervisor runs: (optionally) ingest -> decompose -> drilldown (parallel) -> synthesize.
"""
import json
import re
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import DiagnosticGraphState

WORKER_INGEST = "worker_ingest"
WORKER_DECOMPOSE = "worker_decompose"
WORKER_DRILLDOWN = "worker_drilldown"
WORKER_SYNTHESIZE = "worker_synthesize"

SUPERVISOR_SYSTEM = """You are the supervisor for the Diagnostic Analyst (Nexus Intelligence). You mathematically decompose KPI deviations.

Flow (follow in order):
0. worker_ingest: If a sheet_url is provided, call this FIRST to load and parse the customer's Google Sheet. Payload: {"sheet_url": "<url>"}. Skip this step if no sheet_url is present (sheet_url will be empty or missing).
1. worker_decompose: Pull Traffic, CVR, AOV via query_business_data and rank drivers via calculate_contribution_score. Call once after ingest (or as first step if no sheet).
2. worker_drilldown: Check if the drop is localized to a segment. Call in parallel for each dimension: Pincode, Region, Channel. Use payload {"segment_dimension": "Region", "segment_value": "North India"} (or Channel/Myntra, Pincode/110001, etc.).
3. worker_synthesize: Produce the final DiagnosticResult with ranked drivers and evidence. Call once when decompose and drilldown are done.

You must respond with ONLY a valid JSON object, no other text:

1. To finish: {"done": true}
2. To call workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples:
- If sheet_url present, first step: {"sends": [{"node": "worker_ingest", "payload": {"sheet_url": "https://docs.google.com/spreadsheets/d/..."}}]}
- If no sheet_url, first step: {"sends": [{"node": "worker_decompose", "payload": {"task": "Decompose revenue drop: pull Traffic, CVR, AOV and rank contribution"}}]}
- After ingest: {"sends": [{"node": "worker_decompose", "payload": {"task": "Decompose revenue drop: pull Traffic, CVR, AOV and rank contribution"}}]}
- Segment drilldown: {"sends": [{"node": "worker_drilldown", "payload": {"segment_dimension": "Region", "segment_value": "North India"}}, {"node": "worker_drilldown", "payload": {"segment_dimension": "Channel", "segment_value": "Myntra"}}, {"node": "worker_drilldown", "payload": {"segment_dimension": "Pincode", "segment_value": "110001"}}]}
- Final step: {"sends": [{"node": "worker_synthesize", "payload": {"task": "Summarize DiagnosticResult with ranked drivers and evidence"}}]}

Valid node names: worker_ingest, worker_decompose, worker_drilldown, worker_synthesize.
"""


def _extract_json(text: str) -> dict[str, Any]:
    """Extract a JSON object from LLM response (allow markdown code block)."""
    text = text.strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        return json.loads(match.group())
    return {"done": True}


def make_supervisor_node(llm: Any) -> Any:
    """Build the supervisor node that decides next worker(s) or end."""

    def supervisor_node(state: DiagnosticGraphState) -> dict[str, Any]:
        messages = state.get("messages") or []
        kpi_slices = state.get("kpi_slices") or []
        contribution_scores = state.get("contribution_scores") or []
        segment_breakdowns = state.get("segment_breakdowns") or []
        reasoning_log = state.get("reasoning_log") or []
        sheet_url = state.get("sheet_url") or ""
        column_mapping = state.get("column_mapping")
        prompt_parts = [
            "Current state:",
            f"- sheet_url: {'provided' if sheet_url else 'none'}",
            f"- column_mapping: {'set' if column_mapping else 'not set'}",
            f"- Messages: {len(messages)}",
            f"- KPI slices: {len(kpi_slices)}",
            f"- Contribution scores: {len(contribution_scores)}",
            f"- Segment breakdowns: {len(segment_breakdowns)}",
            f"- Reasoning log entries: {len(reasoning_log)}",
        ]
        if sheet_url and not column_mapping:
            prompt_parts.append(f"\nsheet_url is provided but not yet ingested. Call worker_ingest first with sheet_url: {sheet_url}")
        if messages:
            last_msg = messages[-1]
            prompt_parts.append(
                f"\nLast message (user or assistant): {getattr(last_msg, 'content', str(last_msg))[:500]}"
            )
        prompt_parts.append("\nDecide the next step. Reply with JSON only.")

        response = llm.invoke(
            [
                SystemMessage(content=SUPERVISOR_SYSTEM),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )
        content = response.content if hasattr(response, "content") else str(response)
        try:
            decision = _extract_json(content)
        except json.JSONDecodeError:
            decision = {"done": True}

        if decision.get("done"):
            return {"supervisor_decision": {"done": True}}
        sends = decision.get("sends") or []
        if not sends:
            return {"supervisor_decision": {"done": True}}
        return {"supervisor_decision": {"sends": sends}}

    return supervisor_node


def _run_worker_agent(llm: Any, tools: list[Any], system_prompt: str, task_message: str) -> str:
    """Run a ReAct-style agent with given tools and return last message content."""
    graph = create_agent(llm, tools=tools)
    messages: list[BaseMessage] = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_message),
    ]
    result = graph.invoke({"messages": messages})
    out_messages = result.get("messages") or []
    if out_messages:
        last = out_messages[-1]
        return getattr(last, "content", str(last))
    return ""


def make_worker_decompose(llm: Any, query_tool: Any, contribution_tool: Any) -> Any:
    """Worker: pull KPI slices (Traffic, CVR, AOV), compute contribution scores, write to state."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        # Call tools directly so we have structured data for state
        out_slices: list[dict[str, Any]] = []
        out_scores: list[dict[str, Any]] = []
        gaps: list[dict[str, Any]] = []
        evidence: list[dict[str, Any]] = []

        try:
            raw = query_tool.invoke({"metric": "all", "period": "WoW"})
            if isinstance(raw, str):
                data = json.loads(raw)
            else:
                data = raw
            out_slices = data.get("kpi_slices", [])
            gaps = data.get("data_quality_gaps", [])
            evidence.append({"source": "query_business_data", "data": data})
        except Exception as e:
            gaps.append({"field_name": "query_business_data", "reason": "incomplete", "severity": "high"})
            evidence.append({"source": "query_business_data", "error": str(e)})

        # Build contribution score inputs from slices
        rev_cur = rev_base = traffic_cur = traffic_base = cvr_cur = cvr_base = aov_cur = aov_base = 0.0
        for s in out_slices:
            n, c, b = s.get("metric_name"), s.get("current_value"), s.get("baseline_value")
            if n == "Revenue":
                rev_cur, rev_base = c, b
            elif n == "Traffic":
                traffic_cur, traffic_base = c, b
            elif n == "CVR":
                cvr_cur, cvr_base = c, b
            elif n == "AOV":
                aov_cur, aov_base = c, b

        if out_slices:
            try:
                raw2 = contribution_tool.invoke({
                    "revenue_current": rev_cur, "revenue_baseline": rev_base,
                    "traffic_current": traffic_cur, "traffic_baseline": traffic_base,
                    "cvr_current": cvr_cur, "cvr_baseline": cvr_base,
                    "aov_current": aov_cur, "aov_baseline": aov_base,
                })
                if isinstance(raw2, str):
                    data2 = json.loads(raw2)
                else:
                    data2 = raw2
                out_scores = data2.get("ranked_drivers", [])
                evidence.append({"source": "calculate_contribution_score", "data": data2})
            except Exception as e:
                evidence.append({"source": "calculate_contribution_score", "error": str(e)})

        task = payload.get("task", "Decompose revenue drop")
        summary = f"Decomposed: {len(out_slices)} KPI slices, {len(out_scores)} ranked drivers."
        log_entries = [{"phase": "decompose", "output": summary, "kpi_count": len(out_slices), "drivers_count": len(out_scores)}]

        return {
            "kpi_slices": out_slices,
            "contribution_scores": out_scores,
            "data_quality_gaps": gaps,
            "evidence": evidence,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=summary)],
            "current_phase": "decompose",
        }

    return node


def make_worker_drilldown(llm: Any, query_tool: Any) -> Any:
    """Worker: drill down by segment (Pincode, Region, Channel) using query_business_data."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        dim = payload.get("segment_dimension") or "Region"
        val = payload.get("segment_value") or "North India"
        breakdown: dict[str, Any] = {
            "dimension": dim,
            "segment_value": val,
            "kpi_slices": [],
            "is_localized": False,
        }
        evidence: list[dict[str, Any]] = []

        try:
            raw = query_tool.invoke({
                "metric": "all",
                "period": "WoW",
                "segment_dimension": dim,
                "segment_value": val,
            })
            if isinstance(raw, str):
                data = json.loads(raw)
            else:
                data = raw
            breakdown["kpi_slices"] = data.get("kpi_slices", [])
            if data.get("data_quality_gaps"):
                breakdown["data_quality_gaps"] = data["data_quality_gaps"]
            evidence.append({"source": "query_business_data", "segment": f"{dim}:{val}", "data": data})
            # Heuristic: localized if we have slices and revenue delta is negative and large
            for s in breakdown["kpi_slices"]:
                if s.get("metric_name") == "Revenue" and s.get("delta_percent", 0) < -5:
                    breakdown["is_localized"] = True
                    break
        except Exception as e:
            evidence.append({"source": "query_business_data", "segment": f"{dim}:{val}", "error": str(e)})

        summary = f"Drilldown {dim}={val}: {len(breakdown['kpi_slices'])} slices, localized={breakdown['is_localized']}"
        log_entries = [{"phase": "drilldown", "dimension": dim, "segment_value": val, "output": summary}]

        return {
            "segment_breakdowns": [breakdown],
            "evidence": evidence,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=summary)],
            "current_phase": "drilldown",
        }

    return node


def make_worker_ingest(llm: Any, load_sheet_tool: Any, extract_kpi_tool: Any) -> Any:
    """Worker: load a Google Sheet, use the LLM to map columns to KPIs, then extract structured data."""

    INGEST_SYSTEM = """You are a data analyst for Nexus Intelligence. You have two tools:
1. load_google_sheet: reads a Google Sheet URL and returns tab names, column headers, and sample rows.
2. extract_kpi_data: takes the raw sheet data and a column mapping you produce, and extracts structured KPI data.

Your task:
1. Call load_google_sheet with the sheet_url to see the raw data.
2. Analyze the tabs and columns. Figure out which columns map to: Revenue, Traffic, CVR (conversion rate), AOV (average order value). Also identify segment dimensions (Region, Channel, Pincode) if present.
3. Determine which rows are "current" vs "baseline" (e.g. most recent row = current, second most recent = baseline). Use negative indices: -1 for last row (current), -2 for second-to-last (baseline).
4. Call extract_kpi_data with two JSON string arguments:
   - raw_tabs_json: the "raw_tabs" field from the load_google_sheet output
   - column_mapping_json: a JSON object you construct with this shape:
     {
       "aggregate_tab": "<tab name with overall metrics>",
       "aggregate_mapping": {
         "date_col": "<date/period column name>",
         "Revenue": "<revenue column name>",
         "Traffic": "<traffic/sessions column name>",
         "CVR": "<conversion rate column name>",
         "AOV": "<average order value column name>"
       },
       "segment_tabs": [
         {
           "tab": "<tab name>",
           "dimension": "Region|Channel|Pincode",
           "dimension_col": "<column with segment values>",
           "date_col": "<date column>",
           "Revenue": "<revenue col>",
           "Traffic": "<traffic col>",
           "CVR": "<cvr col>",
           "AOV": "<aov col>"
         }
       ],
       "period_detection": {
         "current_row_index": -1,
         "baseline_row_index": -2,
         "period_label": "WoW"
       }
     }
5. Report what you found: how many KPIs mapped, how many segments, any gaps.

Do NOT guess values. If a column cannot be mapped to a KPI, skip it. The extract tool will flag Data Quality Gaps for missing KPIs."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        sheet_url = payload.get("sheet_url", "")
        if not sheet_url:
            return {
                "data_quality_gaps": [{"field_name": "sheet_url", "reason": "missing", "severity": "high"}],
                "reasoning_log": [{"phase": "ingest", "output": "No sheet_url provided, skipping ingest."}],
                "messages": [AIMessage(content="No sheet_url provided. Using default/mock data.")],
                "current_phase": "ingest",
            }

        task_message = f"Load and parse this Google Sheet: {sheet_url}"
        content = _run_worker_agent(llm, [load_sheet_tool, extract_kpi_tool], INGEST_SYSTEM, task_message)
        log_entries = [{"phase": "ingest", "output": content[:500]}]

        return {
            "column_mapping": {"status": "set", "sheet_url": sheet_url},
            "evidence": [{"source": "worker_ingest", "sheet_url": sheet_url, "summary": content[:500]}],
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "ingest",
        }

    return node


def make_worker_synthesize(llm: Any) -> Any:
    """Worker: produce final DiagnosticResult with ranked drivers and evidence. No tools. Flag Data Quality Gaps."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        task = payload.get("task", "Summarize DiagnosticResult with ranked drivers and evidence.")
        system = """You are the Diagnostic Analyst for Nexus Intelligence. Summarize the diagnosis from the gathered data.
Output a short narrative (2-4 sentences) that: (1) states the top ranked driver of the revenue drop, (2) mentions segment localization if any, (3) notes any Data Quality Gaps. Do not guess external reasons; only report what the internal data confirms."""
        content = _run_worker_agent(llm, [], system, task)
        log_entries = [{"phase": "synthesize", "output": content[:500]}]
        return {
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "synthesize",
        }

    return node
