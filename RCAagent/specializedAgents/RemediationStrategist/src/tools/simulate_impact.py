"""
simulate_impact_range tool: estimate revenue recovery for a remediation action.
Mock data for Indian D2C (Delhi, Mumbai, Bangalore; kurta, moisturizer, earbuds).
Returns impact_low/mid/high, confidence, time_to_effect_days, evidence_trace.
"""
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

# Mock impact ranges by action_type (INR Lakhs recovery)
_MOCK_IMPACT: dict[str, dict[str, Any]] = {
    "express_allocation": {
        "impact_low": 0.8,
        "impact_mid": 1.5,
        "impact_high": 2.2,
        "confidence": 0.75,
        "time_to_effect_days": 3,
        "notes": "Stock transfer + express dispatch; regional demand known",
    },
    "ad_optimization": {
        "impact_low": 0.3,
        "impact_mid": 0.7,
        "impact_high": 1.2,
        "confidence": 0.6,
        "time_to_effect_days": 7,
        "notes": "Creative/audience tweak; CVR lift varies by channel",
    },
    "price_promo_adjustment": {
        "impact_low": 0.5,
        "impact_mid": 1.0,
        "impact_high": 1.8,
        "confidence": 0.65,
        "time_to_effect_days": 5,
        "notes": "Flash/regional promo; margin trade-off",
    },
}

_REGIONS = ("Delhi", "Mumbai", "Bangalore", "North India", "South India")
_SKUS = ("kurta", "moisturizer", "earbuds", "SKU-001", "SKU-002")


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@tool
def simulate_impact_range(
    action_type: str,
    sku: str | None = None,
    region: str | None = None,
    current_daily_revenue_loss: float = 0.0,
) -> str:
    """Estimate how much revenue (INR) will be recovered by a remediation action.
    action_type: express_allocation | ad_optimization | price_promo_adjustment.
    Optional: sku (e.g. kurta, moisturizer, earbuds), region (e.g. Delhi, Mumbai, Bangalore), current_daily_revenue_loss (INR).
    Returns JSON with impact_low, impact_mid, impact_high (INR Lakhs), confidence (0-1), time_to_effect_days, evidence_trace."""
    action_type = (action_type or "express_allocation").lower().replace(" ", "_")
    if action_type not in _MOCK_IMPACT:
        action_type = "express_allocation"

    base = _MOCK_IMPACT[action_type].copy()
    # Scale by daily loss if provided (rough multiplier for context)
    if current_daily_revenue_loss > 0:
        scale = min(2.0, 1.0 + (current_daily_revenue_loss / 100000))
        base["impact_low"] = round(base["impact_low"] * scale, 2)
        base["impact_mid"] = round(base["impact_mid"] * scale, 2)
        base["impact_high"] = round(base["impact_high"] * scale, 2)

    out: dict[str, Any] = {
        "impact_low": base["impact_low"],
        "impact_mid": base["impact_mid"],
        "impact_high": base["impact_high"],
        "confidence": base["confidence"],
        "time_to_effect_days": base["time_to_effect_days"],
        "sku": sku or "all",
        "region": region or "all",
    }
    query_params = {
        "action_type": action_type,
        "sku": sku,
        "region": region,
        "current_daily_revenue_loss": current_daily_revenue_loss,
    }
    out["evidence_trace"] = _evidence_trace("simulate_impact_range", query_params, dict(out))
    return json.dumps(out)
