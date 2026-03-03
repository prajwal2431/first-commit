import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict

# Default model for LLM-based tools (override with BEDROCK_MODEL_ID).
# Uses Nova Lite to match the RemediationStrategist runtime (src/model/load.py). The Lambda runs in a
# separate process from the agent container; when we added LLM-based tools here, the default was set
# to Claude. We now use Nova Lite so tool outputs (simulate_impact_range, map_remediation_action) use
# the same model as the rest of the agent.
DEFAULT_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")


def lambda_handler(event, context):
    """
    Lambda handler for Bedrock AgentCore Gateway tools.
    Dispatches by context.client_context.custom["bedrockAgentCoreToolName"]:
    - LambdaTarget___placeholder_tool
    - LambdaTarget___simulate_impact_range (LLM-generated)
    - LambdaTarget___map_remediation_action (LLM-generated)
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


def _invoke_bedrock(system: str, user: str, model_id: str | None = None) -> str:
    """Call Bedrock InvokeModel and return assistant text. Uses Nova messages-v1 schema when model is Nova."""
    import boto3

    model_id = model_id or DEFAULT_MODEL_ID
    client = boto3.client("bedrock-runtime")

    is_nova = "nova" in (model_id or "").lower()
    if is_nova:
        # Amazon Nova messages-v1 request schema
        body = {
            "schemaVersion": "messages-v1",
            "system": [{"text": system}],
            "messages": [{"role": "user", "content": [{"text": user}]}],
            "inferenceConfig": {"maxTokens": 1024, "temperature": 0.2},
        }
    else:
        # Anthropic Claude request body
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }

    response = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    result = json.loads(response["body"].read())

    if is_nova:
        # Nova response: output.message.content[] with "text" or "image"
        out = ""
        output = result.get("output", {})
        message = output.get("message", {})
        for block in message.get("content", []):
            if block.get("type") == "text" and "text" in block:
                out += block.get("text", "")
        return out
    # Claude response: content[] with type "text" and "text" field
    out = ""
    for block in result.get("content", []):
        if block.get("type") == "text":
            out += block.get("text", "")
    return out


def _extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        try:
            return {"actions": json.loads(match.group())}
        except json.JSONDecodeError:
            pass
    return {}


def placeholder_tool(event: Dict[str, Any]):
    """No-op placeholder tool."""
    return {
        "message": "Placeholder tool executed.",
        "string_param": event.get("string_param"),
        "int_param": event.get("int_param"),
        "float_array_param": event.get("float_array_param"),
        "event_args_received": event,
    }


def lambda_simulate_impact_range(event: Dict[str, Any]) -> Dict[str, Any]:
    """LLM-generated impact estimate (no mock data)."""
    action_type = (event.get("action_type") or "express_allocation").lower().replace(" ", "_")
    sku = event.get("sku")
    region = event.get("region")
    current_daily_revenue_loss = float(event.get("current_daily_revenue_loss") or 0)
    query_params = {
        "action_type": action_type,
        "sku": sku,
        "region": region,
        "current_daily_revenue_loss": current_daily_revenue_loss,
    }
    system = """You are an impact analyst for Indian D2C/retail. Given a remediation action type and context, estimate revenue recovery in INR Lakhs.
Respond with ONLY a valid JSON object (no markdown, no other text) with exactly these keys:
- impact_low: number (conservative recovery in Lakhs)
- impact_mid: number (expected recovery in Lakhs)
- impact_high: number (optimistic recovery in Lakhs)
- confidence: number between 0 and 1
- time_to_effect_days: integer (days until impact is visible)
Use context (sku, region, current_daily_revenue_loss) to inform the range. Be realistic for Indian D2C."""
    user = f"action_type={action_type}, sku={sku or 'all'}, region={region or 'all'}, current_daily_revenue_loss={current_daily_revenue_loss}. Return JSON only."
    try:
        content = _invoke_bedrock(system, user)
        parsed = _extract_json(content)
    except Exception:
        parsed = {}
    impact_low = float(parsed.get("impact_low", 0))
    impact_mid = float(parsed.get("impact_mid", 0))
    impact_high = float(parsed.get("impact_high", 0))
    confidence = max(0, min(1, float(parsed.get("confidence", 0.5))))
    time_to_effect_days = max(0, int(parsed.get("time_to_effect_days", 5)))
    out = {
        "impact_low": impact_low,
        "impact_mid": impact_mid,
        "impact_high": impact_high,
        "confidence": confidence,
        "time_to_effect_days": time_to_effect_days,
        "sku": sku or "all",
        "region": region or "all",
    }
    out["evidence_trace"] = _evidence_trace("simulate_impact_range", query_params, dict(out))
    return out


def lambda_map_remediation_action(event: Dict[str, Any]) -> Dict[str, Any]:
    """LLM-generated remediation actions (no mock data)."""
    root_cause_type = (event.get("root_cause_type") or "stockout").lower().replace(" ", "_")
    severity = event.get("severity", "medium")
    affected_skus = event.get("affected_skus")
    affected_region = event.get("affected_region")
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
Suggest 1-3 actions per root cause. Be specific for Indian D2C."""
    user = f"root_cause_type={root_cause_type}, severity={severity}, affected_skus={affected_skus}, affected_region={affected_region}. Return JSON only: {{\"actions\": [...]}}."
    try:
        content = _invoke_bedrock(system, user)
        parsed = _extract_json(content)
    except Exception:
        parsed = {"actions": []}
    actions = parsed.get("actions") or []
    if not isinstance(actions, list):
        actions = []
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
    return out


# --- assess_risk_level (threshold-based; no mock data) ---
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
