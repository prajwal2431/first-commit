"""Tests for MCP Lambda handler: placeholder_tool, simulate_impact_range, map_remediation_action, assess_risk_level."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

LAMBDA_DIR = Path(__file__).resolve().parent.parent / "mcp" / "lambda"
if str(LAMBDA_DIR) not in sys.path:
    sys.path.insert(0, str(LAMBDA_DIR))

import handler


def _make_context(tool_name: str) -> MagicMock:
    ctx = MagicMock()
    ctx.client_context.custom = {"bedrockAgentCoreToolName": f"LambdaTarget___{tool_name}"}
    return ctx


def test_placeholder_tool_returns_200():
    event = {"string_param": "hello", "int_param": 1}
    ctx = _make_context("placeholder_tool")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "result" in body
    assert "message" in body["result"]


def test_simulate_impact_range_returns_impact_and_evidence():
    event = {"action_type": "express_allocation", "sku": "kurta", "region": "Delhi"}
    ctx = _make_context("simulate_impact_range")
    with patch.object(handler, "_invoke_bedrock", return_value='{"impact_low": 0.5, "impact_mid": 1.0, "impact_high": 1.5, "confidence": 0.7, "time_to_effect_days": 5}'):
        resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    result = body["result"]
    assert "impact_low" in result and "impact_mid" in result and "impact_high" in result
    assert "confidence" in result and "evidence_trace" in result


def test_map_remediation_action_returns_actions():
    event = {"root_cause_type": "stockout", "severity": "high"}
    ctx = _make_context("map_remediation_action")
    with patch.object(
        handler,
        "_invoke_bedrock",
        return_value='{"actions": [{"action_type": "express_allocation", "description": "Transfer stock", "target_sku": null, "target_region": null, "owner_role": "Ops", "effort_level": "medium", "estimated_hours": 4.0}]}',
    ):
        resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    result = body["result"]
    assert "actions" in result
    assert len(result["actions"]) >= 1
    assert "evidence_trace" in result


def test_assess_risk_level_returns_risk_and_requires_approval():
    event = {
        "action_type": "express_allocation",
        "affected_inventory_percent": 10.0,
        "revenue_at_stake": 1.0,
        "action_scope": "single_sku",
    }
    ctx = _make_context("assess_risk_level")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    result = body["result"]
    assert "risk_level" in result
    assert "requires_approval" in result
    assert "evidence_trace" in result


def test_assess_risk_level_high_risk_returns_requires_approval_true():
    event = {
        "action_type": "price_promo_adjustment",
        "affected_inventory_percent": 35.0,
        "revenue_at_stake": 6.0,
        "action_scope": "category",
    }
    ctx = _make_context("assess_risk_level")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["result"]["requires_approval"] is True


def test_unknown_tool_returns_400():
    ctx = _make_context("unknown_tool")
    resp = handler.lambda_handler({}, ctx)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "error" in body
