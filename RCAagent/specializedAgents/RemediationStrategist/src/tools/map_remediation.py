"""
map_remediation_action tool: map root cause type to remediation paths.
Returns actions list (action_type, description, target_sku, target_region, owner_role, effort_level, estimated_hours) and evidence_trace.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Root cause type -> list of applicable actions (mock for Indian D2C)
_MOCK_MAPPING: dict[str, list[dict[str, Any]]] = {
    "stockout": [
        {
            "action_type": "express_allocation",
            "description": "Express transfer stock from high-inventory FC to demand region",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Ops / Supply Chain",
            "effort_level": "medium",
            "estimated_hours": 4.0,
        },
        {
            "action_type": "price_promo_adjustment",
            "description": "Temporary regional promo to shift demand to in-stock SKUs",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Growth / Marketing",
            "effort_level": "low",
            "estimated_hours": 2.0,
        },
    ],
    "demand_spike": [
        {
            "action_type": "express_allocation",
            "description": "Rush replenishment and express allocation to hotspot",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Ops",
            "effort_level": "high",
            "estimated_hours": 8.0,
        },
        {
            "action_type": "ad_optimization",
            "description": "Shift ad spend to high-availability SKUs and regions",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Marketing",
            "effort_level": "medium",
            "estimated_hours": 4.0,
        },
    ],
    "conversion_drop": [
        {
            "action_type": "ad_optimization",
            "description": "Optimize creatives and landing pages; A/B test CVR",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Growth / Marketing",
            "effort_level": "medium",
            "estimated_hours": 6.0,
        },
        {
            "action_type": "price_promo_adjustment",
            "description": "Limited-time offer to recover conversion",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Growth",
            "effort_level": "low",
            "estimated_hours": 2.0,
        },
    ],
    "ad_underperformance": [
        {
            "action_type": "ad_optimization",
            "description": "Pause underperforming campaigns; reallocate to best channels",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Marketing",
            "effort_level": "low",
            "estimated_hours": 2.0,
        },
    ],
    "pricing_issue": [
        {
            "action_type": "price_promo_adjustment",
            "description": "Align price with competition or run targeted promo",
            "target_sku": None,
            "target_region": None,
            "owner_role": "Growth / Pricing",
            "effort_level": "medium",
            "estimated_hours": 4.0,
        },
    ],
}


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


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
    if root_cause_type not in _MOCK_MAPPING:
        root_cause_type = "stockout"

    actions = []
    for a in _MOCK_MAPPING[root_cause_type]:
        row = dict(a)
        if affected_skus:
            row["target_sku"] = affected_skus.split(",")[0].strip() if isinstance(affected_skus, str) else None
        if affected_region:
            row["target_region"] = affected_region
        actions.append(row)

    out: dict[str, Any] = {"actions": actions}
    query_params = {
        "root_cause_type": root_cause_type,
        "severity": severity,
        "affected_skus": affected_skus,
        "affected_region": affected_region,
    }
    out["evidence_trace"] = _evidence_trace("map_remediation_action", query_params, {"actions": actions})
    return json.dumps(out)
