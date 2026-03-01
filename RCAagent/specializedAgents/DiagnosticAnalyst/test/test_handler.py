"""Tests for MCP Lambda handler: placeholder_tool, query_business_data, calculate_contribution_score."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Add mcp/lambda to path so we can import handler
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


def test_query_business_data_returns_kpi_slices():
    event = {"metric": "all", "period": "WoW"}
    ctx = _make_context("query_business_data")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    result_str = body["result"]
    data = json.loads(result_str)
    assert "kpi_slices" in data
    assert "data_quality_gaps" in data
    assert len(data["kpi_slices"]) >= 4


def test_calculate_contribution_score_returns_ranked_drivers():
    event = {
        "revenue_current": 42.5,
        "revenue_baseline": 52.0,
        "traffic_current": 125000,
        "traffic_baseline": 130000,
        "cvr_current": 2.1,
        "cvr_baseline": 2.5,
        "aov_current": 1620,
        "aov_baseline": 1600,
    }
    ctx = _make_context("calculate_contribution_score")
    resp = handler.lambda_handler(event, ctx)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    data = json.loads(body["result"])
    assert "ranked_drivers" in data
    assert len(data["ranked_drivers"]) == 3


def test_unknown_tool_returns_400():
    ctx = _make_context("unknown_tool")
    resp = handler.lambda_handler({}, ctx)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "error" in body
