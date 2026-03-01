import json
from datetime import datetime, timezone
from typing import Any, Dict


def lambda_handler(event, context):
    """
    Lambda handler for Bedrock AgentCore Gateway tools.
    Dispatches by context.client_context.custom["bedrockAgentCoreToolName"]:
    - LambdaTarget___placeholder_tool
    - LambdaTarget___simulate_impact_range
    - LambdaTarget___map_remediation_action
    - LambdaTarget___assess_risk_level
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
        elif tool_name == "simulate_impact_range":
            result = lambda_simulate_impact_range(event)
        elif tool_name == "map_remediation_action":
            result = lambda_map_remediation_action(event)
        elif tool_name == "assess_risk_level":
            result = lambda_assess_risk_level(event)
        else:
            return _response(400, {"error": f"Unknown tool '{tool_name}'"})

        return _response(200, {"result": result})

    except Exception as e:
        return _response(500, {"system_error": str(e)})


def _response(status_code: int, body: Dict[str, Any]):
    """Consistent JSON response wrapper."""
    return {"statusCode": status_code, "body": json.dumps(body)}


def _evidence_trace(source_tool: str, query_params: Dict[str, Any], raw_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def placeholder_tool(event: Dict[str, Any]):
    """no-op placeholder tool."""
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


# --- simulate_impact_range (mirror src/tools/simulate_impact.py) ---
_MOCK_IMPACT = {
    "express_allocation": {"impact_low": 0.8, "impact_mid": 1.5, "impact_high": 2.2, "confidence": 0.75, "time_to_effect_days": 3},
    "ad_optimization": {"impact_low": 0.3, "impact_mid": 0.7, "impact_high": 1.2, "confidence": 0.6, "time_to_effect_days": 7},
    "price_promo_adjustment": {"impact_low": 0.5, "impact_mid": 1.0, "impact_high": 1.8, "confidence": 0.65, "time_to_effect_days": 5},
}


def lambda_simulate_impact_range(event: Dict[str, Any]) -> Dict[str, Any]:
    action_type = (event.get("action_type") or "express_allocation").lower().replace(" ", "_")
    if action_type not in _MOCK_IMPACT:
        action_type = "express_allocation"
    base = _MOCK_IMPACT[action_type].copy()
    current_daily_revenue_loss = float(event.get("current_daily_revenue_loss") or 0)
    if current_daily_revenue_loss > 0:
        scale = min(2.0, 1.0 + (current_daily_revenue_loss / 100000))
        base["impact_low"] = round(base["impact_low"] * scale, 2)
        base["impact_mid"] = round(base["impact_mid"] * scale, 2)
        base["impact_high"] = round(base["impact_high"] * scale, 2)
    out = {
        "impact_low": base["impact_low"],
        "impact_mid": base["impact_mid"],
        "impact_high": base["impact_high"],
        "confidence": base["confidence"],
        "time_to_effect_days": base["time_to_effect_days"],
        "sku": event.get("sku") or "all",
        "region": event.get("region") or "all",
    }
    query_params = {
        "action_type": action_type,
        "sku": event.get("sku"),
        "region": event.get("region"),
        "current_daily_revenue_loss": current_daily_revenue_loss,
    }
    out["evidence_trace"] = _evidence_trace("simulate_impact_range", query_params, dict(out))
    return out


# --- map_remediation_action (mirror src/tools/map_remediation.py) ---
_MOCK_MAPPING = {
    "stockout": [
        {"action_type": "express_allocation", "description": "Express transfer stock from high-inventory FC to demand region", "target_sku": None, "target_region": None, "owner_role": "Ops / Supply Chain", "effort_level": "medium", "estimated_hours": 4.0},
        {"action_type": "price_promo_adjustment", "description": "Temporary regional promo to shift demand to in-stock SKUs", "target_sku": None, "target_region": None, "owner_role": "Growth / Marketing", "effort_level": "low", "estimated_hours": 2.0},
    ],
    "demand_spike": [
        {"action_type": "express_allocation", "description": "Rush replenishment and express allocation to hotspot", "target_sku": None, "target_region": None, "owner_role": "Ops", "effort_level": "high", "estimated_hours": 8.0},
        {"action_type": "ad_optimization", "description": "Shift ad spend to high-availability SKUs and regions", "target_sku": None, "target_region": None, "owner_role": "Marketing", "effort_level": "medium", "estimated_hours": 4.0},
    ],
    "conversion_drop": [
        {"action_type": "ad_optimization", "description": "Optimize creatives and landing pages; A/B test CVR", "target_sku": None, "target_region": None, "owner_role": "Growth / Marketing", "effort_level": "medium", "estimated_hours": 6.0},
        {"action_type": "price_promo_adjustment", "description": "Limited-time offer to recover conversion", "target_sku": None, "target_region": None, "owner_role": "Growth", "effort_level": "low", "estimated_hours": 2.0},
    ],
    "ad_underperformance": [
        {"action_type": "ad_optimization", "description": "Pause underperforming campaigns; reallocate to best channels", "target_sku": None, "target_region": None, "owner_role": "Marketing", "effort_level": "low", "estimated_hours": 2.0},
    ],
    "pricing_issue": [
        {"action_type": "price_promo_adjustment", "description": "Align price with competition or run targeted promo", "target_sku": None, "target_region": None, "owner_role": "Growth / Pricing", "effort_level": "medium", "estimated_hours": 4.0},
    ],
}


def lambda_map_remediation_action(event: Dict[str, Any]) -> Dict[str, Any]:
    root_cause_type = (event.get("root_cause_type") or "stockout").lower().replace(" ", "_")
    if root_cause_type not in _MOCK_MAPPING:
        root_cause_type = "stockout"
    actions = []
    for a in _MOCK_MAPPING[root_cause_type]:
        row = dict(a)
        if event.get("affected_skus"):
            row["target_sku"] = event.get("affected_skus").split(",")[0].strip() if isinstance(event.get("affected_skus"), str) else None
        if event.get("affected_region"):
            row["target_region"] = event.get("affected_region")
        actions.append(row)
    out = {"actions": actions}
    query_params = {
        "root_cause_type": root_cause_type,
        "severity": event.get("severity", "medium"),
        "affected_skus": event.get("affected_skus"),
        "affected_region": event.get("affected_region"),
    }
    out["evidence_trace"] = _evidence_trace("map_remediation_action", query_params, {"actions": actions})
    return out


# --- assess_risk_level (mirror src/tools/assess_risk.py) ---
_HIGH_RISK_INVENTORY_PERCENT = 30.0
_HIGH_RISK_REVENUE_LAKHS = 5.0


def lambda_assess_risk_level(event: Dict[str, Any]) -> Dict[str, Any]:
    action_type = (event.get("action_type") or "express_allocation").lower().replace(" ", "_")
    affected_inventory_percent = float(event.get("affected_inventory_percent") or 0)
    revenue_at_stake = float(event.get("revenue_at_stake") or 0)
    action_scope = (event.get("action_scope") or "single_sku").lower().replace(" ", "_")

    risk_factors = []
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

    out = {
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
    return out
