"""Tests for Contextual Scout: tools, schema validation, and entrypoint.
All tools use web search (mocked in tests) or report 'no data source'. No mock/fake data."""
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

# Fake Tavily response for tests (simulates what the real API would return)
_FAKE_TAVILY_RESPONSE = {
    "results": [
        {"title": "Test result", "url": "https://example.com/test", "content": "Test content from web search", "score": 0.9},
    ],
    "query": "test query",
}

_EMPTY_TAVILY_RESPONSE = {
    "results": [],
    "query": "test query",
}


class TestWebSearch:
    """Test web_search tool gracefully handles missing API key."""

    def test_returns_error_when_no_api_key(self):
        from src.tools.web_search import web_search

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TAVILY_API_KEY", None)
            # Force reload of the module-level var
            import src.tools.web_search as ws
            ws._TAVILY_API_KEY = None

            out = web_search.invoke({"query": "test query"})
            data = json.loads(out)
            assert "error" in data
            assert "TAVILY_API_KEY" in data["error"]
            assert data["results"] == []
            assert "evidence_trace" in data

    def test_returns_results_when_api_key_set(self):
        import src.tools.web_search as ws

        with patch.object(ws, "_search_tavily", return_value=_FAKE_TAVILY_RESPONSE):
            out = ws.web_search.invoke({"query": "test query"})
            data = json.loads(out)
            assert len(data["results"]) == 1
            assert data["results"][0]["title"] == "Test result"
            assert "evidence_trace" in data


class TestSocialSignalAnalyzer:
    """Test social_signal_analyzer uses web search, not mock data."""

    def test_returns_unavailable_when_no_api_key(self):
        from src.tools.social_signal_analyzer import social_signal_analyzer
        import src.tools.web_search as ws
        ws._TAVILY_API_KEY = None

        out = social_signal_analyzer.invoke({"signal_type": "competitor_activity", "timeframe": "7d"})
        data = json.loads(out)
        assert data["search_status"] == "unavailable"
        assert data["signals"] == []
        assert "evidence_trace" in data
        assert "TAVILY_API_KEY" in data.get("reason", "")

    def test_returns_signals_from_web_search(self):
        from src.tools import social_signal_analyzer as ssa_mod
        import src.tools.web_search as ws

        with patch.object(ws, "_search_tavily", return_value=_FAKE_TAVILY_RESPONSE):
            # Patch the imported reference in social_signal_analyzer module
            with patch.object(ssa_mod, "_search_tavily", ws._search_tavily):
                out = ssa_mod.social_signal_analyzer.invoke({"signal_type": "weather", "region": "Delhi"})
                data = json.loads(out)
                assert data["search_status"] == "ok"
                assert len(data["signals"]) >= 1
                assert "evidence_trace" in data

    def test_returns_no_results_when_search_empty(self):
        from src.tools import social_signal_analyzer as ssa_mod

        with patch.object(ssa_mod, "_search_tavily", return_value=_EMPTY_TAVILY_RESPONSE):
            out = ssa_mod.social_signal_analyzer.invoke({"signal_type": "sentiment"})
            data = json.loads(out)
            assert data["search_status"] == "no_results"
            assert data["signals"] == []


class TestMarketplaceApiFetcher:
    """Test marketplace_api_fetcher uses web search, not mock data."""

    def test_returns_unavailable_when_no_api_key(self):
        from src.tools.marketplace_api_fetcher import marketplace_api_fetcher
        import src.tools.web_search as ws
        ws._TAVILY_API_KEY = None

        out = marketplace_api_fetcher.invoke({"platform": "myntra", "check_type": "sync_latency"})
        data = json.loads(out)
        assert data["status"] == "unavailable"
        assert data["platform"] == "myntra"
        assert "evidence_trace" in data

    def test_returns_findings_from_web_search(self):
        from src.tools import marketplace_api_fetcher as maf_mod

        with patch.object(maf_mod, "_search_tavily", return_value=_FAKE_TAVILY_RESPONSE):
            out = maf_mod.marketplace_api_fetcher.invoke({"platform": "amazon", "check_type": "buybox_status"})
            data = json.loads(out)
            assert data["status"] == "searched"
            assert len(data["findings"]) >= 1
            assert "evidence_trace" in data


class TestInventoryMismatchChecker:
    """Test inventory_mismatch_checker reports no data source when none connected."""

    def test_returns_no_data_source_when_not_connected(self):
        from src.tools.inventory_mismatch_checker import inventory_mismatch_checker, clear_live_inventory
        clear_live_inventory()

        out = inventory_mismatch_checker.invoke({})
        data = json.loads(out)
        assert data["status"] == "no_data_source"
        assert data["mismatches"] == []
        assert "evidence_trace" in data
        assert "No inventory" in data["reason"]

    def test_returns_mismatches_when_data_connected(self):
        from src.tools.inventory_mismatch_checker import inventory_mismatch_checker, set_live_inventory, clear_live_inventory

        try:
            set_live_inventory({
                "mismatches": [
                    {"sku": "SKU-TEST", "demand_region": "Delhi", "stock_region": "Mumbai", "demand_units": 100, "available_units": 50, "mismatch_severity": "high"},
                ]
            })
            out = inventory_mismatch_checker.invoke({})
            data = json.loads(out)
            assert data["status"] == "ok"
            assert len(data["mismatches"]) == 1
            assert data["mismatches"][0]["sku"] == "SKU-TEST"
            assert "evidence_trace" in data
        finally:
            clear_live_inventory()


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
                    status="searched",
                    latency_ms=None,
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
                    "messages": [MagicMock(type="ai", content="External causes searched via web.")],
                    "external_signals": [
                        {"signal_type": "weather", "description": "Search result about weather", "severity": "unknown"},
                    ],
                    "marketplace_checks": [
                        {"platform": "amazon", "check_type": "buybox_status", "status": "searched"},
                    ],
                    "supply_chain_audits": [],
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
            assert result["external_factors"][0]["signal_type"] == "weather"
            assert result["marketplace_checks"][0]["status"] == "searched"
