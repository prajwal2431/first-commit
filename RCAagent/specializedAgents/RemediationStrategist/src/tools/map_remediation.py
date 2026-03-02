"""
map_remediation_action tool: map root cause type to remediation paths.
Uses LLM to generate actions (Express Allocation, Ad Optimization, Price/Promo). Returns JSON with actions list and evidence_trace.
"""
import json
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    # Try object first
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Try array (actions only)
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        try:
            return {"actions": json.loads(match.group())}
        except json.JSONDecodeError:
            pass
    return {"actions": []}


def make_map_remediation_action_tool(llm: Any):
    """Build map_remediation_action tool that uses the LLM to generate remediation actions."""

    _llm = llm

    @tool
    def map_remediation_action(
        root_cause_type: str,
        severity: str = "medium",
        affected_skus: str | None = None,
        affected_region: str | None = None,
    ) -> str:
        """Map a root cause to specific remediation paths: Express Allocation, Ad Optimization, or Price/Promo adjustment.
        root_cause_type: stockout | demand_spike | conversion_drop | ad_underperformance | pricing_issue.
        Optional: severity (low/medium/high), affected_skus (comma-separated), affected_region.
        Returns JSON with actions list (action_type, description, target_sku, target_region, owner_role, effort_level, estimated_hours) and evidence_trace."""
        root_cause_type = (root_cause_type or "stockout").lower().replace(" ", "_")
        query_params = {
            "root_cause_type": root_cause_type,
            "severity": severity,
            "affected_skus": affected_skus,
            "affected_region": affected_region,
        }
        system = """You are a remediation strategist for Indian D2C/retail. Given a root cause type and context, output remediation actions.
Respond with ONLY a valid JSON object (no markdown, no other text) with one key "actions" whose value is an array of objects. Each object must have:
- action_type: one of "express_allocation", "ad_optimization", "price_promo_adjustment"
- description: short human-readable description
- target_sku: string or null
- target_region: string or null
- owner_role: e.g. "Ops", "Marketing", "Growth"
- effort_level: "low", "medium", or "high"
- estimated_hours: number
Suggest 1-3 actions per root cause. Be specific for Indian D2C (e.g. FC transfer, channel reallocation, regional promo)."""
        user = f"root_cause_type={root_cause_type}, severity={severity}, affected_skus={affected_skus}, affected_region={affected_region}. Return JSON only: {{\"actions\": [...]}}."
        try:
            response = _llm.invoke([
                SystemMessage(content=system),
                HumanMessage(content=user),
            ])
            content = response.content if hasattr(response, "content") else str(response)
            parsed = _extract_json(content)
        except Exception:
            parsed = {"actions": []}

        actions = parsed.get("actions") or []
        if not isinstance(actions, list):
            actions = []
        # Normalize and apply affected_skus/affected_region
        out_actions = []
        for a in actions:
            if not isinstance(a, dict):
                continue
            row = {
                "action_type": (a.get("action_type") or "express_allocation").lower().replace(" ", "_"),
                "description": a.get("description") or "",
                "target_sku": a.get("target_sku"),
                "target_region": a.get("target_region"),
                "owner_role": a.get("owner_role") or "Ops",
                "effort_level": (a.get("effort_level") or "medium").lower(),
                "estimated_hours": float(a.get("estimated_hours", 4)),
            }
            if affected_skus and isinstance(affected_skus, str):
                row["target_sku"] = affected_skus.split(",")[0].strip()
            if affected_region:
                row["target_region"] = affected_region
            out_actions.append(row)

        out = {"actions": out_actions}
        out["evidence_trace"] = _evidence_trace("map_remediation_action", query_params, {"actions": out_actions})
        return json.dumps(out)

    return map_remediation_action
