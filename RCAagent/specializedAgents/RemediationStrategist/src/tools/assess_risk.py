"""
assess_risk_level tool: evaluate risk for an action and set HITL (requires_approval) when high-risk.
E.g. clearing a large stock slice -> high risk -> requires_approval True.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Thresholds for high risk (Indian D2C context)
_HIGH_RISK_INVENTORY_PERCENT = 30.0
_HIGH_RISK_REVENUE_LAKHS = 5.0


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@tool
def assess_risk_level(
    action_type: str,
    affected_inventory_percent: float = 0.0,
    revenue_at_stake: float = 0.0,
    action_scope: str = "single_sku",
) -> str:
    """Assess risk level for a remediation action. Sets requires_approval True when high-risk (e.g. clearing large stock, big revenue at stake).
    action_type: express_allocation | ad_optimization | price_promo_adjustment.
    affected_inventory_percent: share of inventory affected (0-100).
    revenue_at_stake: revenue impact in INR Lakhs.
    action_scope: single_sku | category | all.
    Returns JSON with risk_level (low/medium/high), requires_approval (bool), risk_factors list, evidence_trace."""
    action_type = (action_type or "express_allocation").lower().replace(" ", "_")
    action_scope = (action_scope or "single_sku").lower().replace(" ", "_")

    risk_factors: list[str] = []
    if affected_inventory_percent >= _HIGH_RISK_INVENTORY_PERCENT:
        risk_factors.append(f"Large inventory slice ({affected_inventory_percent}%) affected")
    if revenue_at_stake >= _HIGH_RISK_REVENUE_LAKHS:
        risk_factors.append(f"Revenue at stake >= {_HIGH_RISK_REVENUE_LAKHS} Lakhs")
    if action_scope in ("category", "all"):
        risk_factors.append(f"Broad scope ({action_scope}) increases impact and risk")

    if len(risk_factors) >= 2:
        risk_level = "high"
        requires_approval = True
    elif len(risk_factors) == 1:
        risk_level = "high" if (affected_inventory_percent >= _HIGH_RISK_INVENTORY_PERCENT or action_scope == "all") else "medium"
        requires_approval = risk_level == "high"
    else:
        risk_level = "low"
        requires_approval = False

    out: dict[str, Any] = {
        "risk_level": risk_level,
        "requires_approval": requires_approval,
        "risk_factors": risk_factors if risk_factors else ["No major risk factors identified"],
    }
    query_params = {
        "action_type": action_type,
        "affected_inventory_percent": affected_inventory_percent,
        "revenue_at_stake": revenue_at_stake,
        "action_scope": action_scope,
    }
    out["evidence_trace"] = _evidence_trace("assess_risk_level", query_params, dict(out))
    return json.dumps(out)
