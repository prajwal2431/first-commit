"""Tests for Contextual Scout: tools, schema validation, and entrypoint."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["LOCAL_DEV"] = "1"


class TestSocialSignalAnalyzer:
    """Test social_signal_analyzer returns signals and evidence_trace."""

    def test_returns_signals_and_evidence_trace(self):
        from src.tools.social_signal_analyzer import social_signal_analyzer

        out = social_signal_analyzer.invoke({"signal_type": "competitor_activity", "timeframe": "7d"})
        data = json.loads(out)
        assert "signals" in data
        assert "evidence_trace" in data
        assert data["evidence_trace"]["source_tool"] == "social_signal_analyzer"
        assert data["evidence_trace"]["query_params"]["signal_type"] == "competitor_activity"
        assert len(data["signals"]) >= 1
        assert "description" in data["signals"][0]

    def test_weather_signal_has_region(self):
        from src.tools.social_signal_analyzer import social_signal_analyzer

        out = social_signal_analyzer.invoke({"signal_type": "weather"})
        data = json.loads(out)
        assert data["signals"][0].get("region") == "Delhi NCR"


class TestMarketplaceApiFetcher:
    """Test marketplace_api_fetcher returns status and evidence_trace."""

    def test_returns_status_and_evidence_trace(self):
        from src.tools.marketplace_api_fetcher import marketplace_api_fetcher

        out = marketplace_api_fetcher.invoke({"platform": "myntra", "check_type": "sync_latency"})
        data = json.loads(out)
        assert "status" in data
        assert "evidence_trace" in data
        assert data["platform"] == "myntra"
        assert data["check_type"] == "sync_latency"
        assert data.get("latency_ms") is not None

    def test_amazon_buybox_returns_error_status(self):
        from src.tools.marketplace_api_fetcher import marketplace_api_fetcher

        out = marketplace_api_fetcher.invoke({"platform": "amazon", "check_type": "buybox_status"})
        data = json.loads(out)
        assert data["status"] == "error"
        assert "Buybox" in (data.get("details") or "")


class TestInventoryMismatchChecker:
    """Test inventory_mismatch_checker returns mismatches and evidence_trace."""

    def test_returns_mismatches_and_evidence_trace(self):
        from src.tools.inventory_mismatch_checker import inventory_mismatch_checker

        out = inventory_mismatch_checker.invoke({})
        data = json.loads(out)
        assert "mismatches" in data
        assert "evidence_trace" in data
        assert data["evidence_trace"]["source_tool"] == "inventory_mismatch_checker"
        assert len(data["mismatches"]) >= 1
        m = data["mismatches"][0]
        assert "sku" in m and "demand_region" in m and "stock_region" in m
        assert "evidence_trace" in m

    def test_filter_by_demand_region(self):
        from src.tools.inventory_mismatch_checker import inventory_mismatch_checker

        out = inventory_mismatch_checker.invoke({"demand_region": "Delhi"})
        data = json.loads(out)
        assert all(m["demand_region"] == "Delhi" for m in data["mismatches"])


class TestScoutResultSchema:
    """Test Pydantic schema validation."""

    def test_scout_result_valid(self):
        from src.schemas.scout import (
            EvidenceTrace,
            ExternalSignal,
            MarketplaceCheck,
            ScoutResult,
            SupplyChainAudit,
        )

        trace = EvidenceTrace(
            source_tool="social_signal_analyzer",
            query_params={"signal_type": "weather"},
            raw_data={},
        )
        result = ScoutResult(
            external_factors=[
                ExternalSignal(
                    source="social_signal_analyzer",
                    signal_type="weather",
                    description="Heavy rain Delhi NCR",
                    region="Delhi NCR",
                    severity="high",
                    evidence_trace=trace,
                ),
            ],
            marketplace_checks=[
                MarketplaceCheck(
                    platform="myntra",
                    check_type="sync_latency",
                    status="warning",
                    latency_ms=15120000,
                    evidence_trace=trace,
                ),
            ],
            supply_chain_audits=[
                SupplyChainAudit(
                    sku="SKU-1234",
                    demand_region="Delhi",
                    stock_region="Mumbai",
                    demand_units=800,
                    available_units=650,
                    mismatch_severity="high",
                    evidence_trace=trace,
                ),
            ],
            confidence_scores=[],
            evidence_traces=[],
            reasoning_log=[],
            summary="Weather and inventory mismatch contributed.",
        )
        assert len(result.external_factors) == 1
        assert result.external_factors[0].signal_type == "weather"
        assert len(result.supply_chain_audits) == 1
        assert result.supply_chain_audits[0].demand_region == "Delhi"


class TestBedrockAgentCoreApp:
    """Test app and entrypoint wiring."""

    def test_app_initialization(self):
        from src.main import app

        assert app is not None
        assert hasattr(app, "entrypoint")

    def test_entrypoint_decorator(self):
        from src.main import invoke

        assert hasattr(invoke, "__name__")
        assert invoke.__name__ == "invoke"


class TestInvoke:
    """Test invoke with mocked graph (no real LLM)."""

    @pytest.mark.asyncio
    async def test_invoke_returns_result_and_scout_fields(self):
        from src.main import invoke

        with patch("src.main.create_scout_graph") as mock_create:
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="External causes: weather, Buybox loss, inventory mismatch.")],
                    "external_signals": [
                        {"signal_type": "weather", "description": "Heavy rain Delhi NCR", "severity": "high"},
                    ],
                    "marketplace_checks": [
                        {"platform": "amazon", "check_type": "buybox_status", "status": "error"},
                    ],
                    "supply_chain_audits": [
                        {"sku": "SKU-1234", "demand_region": "Delhi", "stock_region": "Mumbai"},
                    ],
                    "confidence_scores": [],
                    "evidence_traces": [],
                    "reasoning_log": [],
                }
            )
            mock_create.return_value = mock_graph

            payload = {"prompt": "Traffic is down. Find external root causes."}
            result = await invoke(payload)

            assert "result" in result
            assert "external_factors" in result
            assert "marketplace_checks" in result
            assert "supply_chain_audits" in result
            assert result["external_factors"][0]["signal_type"] == "weather"
            assert result["marketplace_checks"][0]["status"] == "error"
