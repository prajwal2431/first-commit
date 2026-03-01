"""Tests for MCP Lambda handler: placeholder_tool, social_signal_analyzer, marketplace_api_fetcher, inventory_mismatch_checker."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

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


def test_social_signal_analyzer_returns_signals():
    event = {"signal_type": "competitor_activity", "timeframe": "7d"}
    ctx = _make_context("social_signal_analyzer")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    result_str = body["result"]
    data = json.loads(result_str)
    assert "signals" in data
    assert "evidence_trace" in data
    assert data["evidence_trace"]["source_tool"] == "social_signal_analyzer"


def test_marketplace_api_fetcher_returns_status():
    event = {"platform": "myntra", "check_type": "sync_latency"}
    ctx = _make_context("marketplace_api_fetcher")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert data["platform"] == "myntra"
    assert "status" in data
    assert "evidence_trace" in data


def test_inventory_mismatch_checker_returns_mismatches():
    event = {}
    ctx = _make_context("inventory_mismatch_checker")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert "mismatches" in data
    assert "evidence_trace" in data
    assert len(data["mismatches"]) >= 1


def test_unknown_tool_returns_400():
    ctx = _make_context("unknown_tool")
    resp = handler.lambda_handler({}, ctx)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "error" in body
