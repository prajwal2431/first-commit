"""Tests for MCP Lambda handler: web search backed tools + no-data-source for inventory."""
import json
import os
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


def test_web_search_returns_error_without_api_key():
    ctx = _make_context("web_search")
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("TAVILY_API_KEY", None)
        resp = handler.lambda_handler({"query": "test"}, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert "error" in data
    assert "TAVILY_API_KEY" in data["error"]
    assert "evidence_trace" in data


def test_social_signal_analyzer_returns_unavailable_without_key():
    ctx = _make_context("social_signal_analyzer")
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("TAVILY_API_KEY", None)
        resp = handler.lambda_handler({"signal_type": "competitor_activity"}, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert data["search_status"] == "unavailable"
    assert data["signals"] == []
    assert "evidence_trace" in data


def test_marketplace_api_fetcher_returns_unavailable_without_key():
    ctx = _make_context("marketplace_api_fetcher")
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("TAVILY_API_KEY", None)
        resp = handler.lambda_handler({"platform": "myntra", "check_type": "sync_latency"}, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert data["status"] == "unavailable"
    assert data["platform"] == "myntra"
    assert "evidence_trace" in data


def test_inventory_mismatch_checker_returns_no_data_source():
    ctx = _make_context("inventory_mismatch_checker")
    resp = handler.lambda_handler({}, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert data["status"] == "no_data_source"
    assert data["mismatches"] == []
    assert "evidence_trace" in data


def test_unknown_tool_returns_400():
    ctx = _make_context("unknown_tool")
    resp = handler.lambda_handler({}, ctx)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "error" in body
