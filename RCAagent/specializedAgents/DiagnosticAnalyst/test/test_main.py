"""Tests for Diagnostic Analyst: tools math, query structure, schema validation, and entrypoint."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Project root on path so "from src.*" works
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Set LOCAL_DEV so query_business_data uses mock data
os.environ["LOCAL_DEV"] = "1"


class TestCalculateContributionScore:
    """Test multiplicative decomposition and ranking."""

    def test_ranks_components_and_returns_contributions(self):
        from src.tools.contribution import calculate_contribution_score

        out = calculate_contribution_score.invoke({
            "revenue_current": 42.5,
            "revenue_baseline": 52.0,
            "traffic_current": 125000,
            "traffic_baseline": 130000,
            "cvr_current": 2.1,
            "cvr_baseline": 2.5,
            "aov_current": 1620,
            "aov_baseline": 1600,
        })
        data = json.loads(out)
        drivers = data["ranked_drivers"]
        assert len(drivers) == 3
        names = [d["component_name"] for d in drivers]
        assert "Traffic" in names and "CVR" in names and "AOV" in names
        assert drivers[0]["rank"] == 1
        assert drivers[1]["rank"] == 2
        assert drivers[2]["rank"] == 3
        for d in drivers:
            assert "contribution_value" in d
            assert "contribution_percent" in d
            assert d["direction"] in ("up", "down")

    def test_negative_contribution_has_direction_down(self):
        from src.tools.contribution import calculate_contribution_score

        # CVR drop -> CVR contribution negative
        out = calculate_contribution_score.invoke({
            "revenue_current": 40.0,
            "revenue_baseline": 52.0,
            "traffic_current": 130000,
            "traffic_baseline": 130000,
            "cvr_current": 2.0,
            "cvr_baseline": 2.5,
            "aov_current": 1600,
            "aov_baseline": 1600,
        })
        data = json.loads(out)
        drivers = data["ranked_drivers"]
        cvr = next(d for d in drivers if d["component_name"] == "CVR")
        assert cvr["direction"] == "down"
        assert cvr["contribution_value"] < 0


class TestQueryBusinessData:
    """Test query_business_data structure and data quality gap flagging."""

    def test_returns_all_kpi_slices_when_metric_all(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({"metric": "all", "period": "WoW"})
        data = json.loads(out)
        assert "kpi_slices" in data
        assert "data_quality_gaps" in data
        slices = data["kpi_slices"]
        assert len(slices) >= 4
        names = [s["metric_name"] for s in slices]
        assert "Revenue" in names and "Traffic" in names and "CVR" in names and "AOV" in names
        for s in slices:
            assert "current_value" in s and "baseline_value" in s and "delta_percent" in s

    def test_returns_data_quality_gap_for_unknown_metric(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({"metric": "UnknownMetric"})
        data = json.loads(out)
        assert data["kpi_slices"] == []
        assert len(data["data_quality_gaps"]) >= 1
        assert data["data_quality_gaps"][0]["reason"] in ("missing", "incomplete")

    def test_segment_region_returns_slices(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({
            "metric": "all",
            "segment_dimension": "Region",
            "segment_value": "North India",
        })
        data = json.loads(out)
        assert "kpi_slices" in data
        if data["kpi_slices"]:
            assert any(s.get("metric_name") == "Revenue" for s in data["kpi_slices"])

    def test_segment_pincode_flags_data_quality_gap(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({
            "metric": "all",
            "segment_dimension": "Pincode",
            "segment_value": "110001",
        })
        data = json.loads(out)
        assert len(data.get("data_quality_gaps", [])) >= 1


class TestDiagnosticResultSchema:
    """Test Pydantic schema validation."""

    def test_diagnostic_result_valid(self):
        from src.schemas.diagnostic import (
            ContributionScore,
            DataQualityGap,
            DiagnosticResult,
            KPISlice,
            SegmentBreakdown,
        )

        result = DiagnosticResult(
            alert_id="alert-1",
            kpi_slices=[
                KPISlice(
                    metric_name="Revenue",
                    current_value=42.5,
                    baseline_value=52.0,
                    delta_absolute=-9.5,
                    delta_percent=-18.27,
                    period="WoW",
                ),
            ],
            ranked_drivers=[
                ContributionScore(
                    component_name="CVR",
                    contribution_value=-2080.0,
                    contribution_percent=75.0,
                    direction="down",
                    rank=1,
                ),
            ],
            segment_breakdowns=[
                SegmentBreakdown(
                    dimension="Region",
                    segment_value="North India",
                    kpi_slices=[],
                    is_localized=True,
                ),
            ],
            data_quality_gaps=[
                DataQualityGap(field_name="Pincode", reason="missing", severity="high"),
            ],
            evidence=[],
            reasoning_log=[],
            confidence=0.85,
        )
        assert result.confidence == 0.85
        assert len(result.ranked_drivers) == 1
        assert result.ranked_drivers[0].component_name == "CVR"

    def test_contribution_score_rank_ge_one(self):
        from src.schemas.diagnostic import ContributionScore

        ContributionScore(
            component_name="CVR",
            contribution_value=-100.0,
            contribution_percent=50.0,
            direction="down",
            rank=1,
        )


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
    async def test_invoke_returns_result(self):
        from src.main import invoke

        with patch("src.main.create_diagnostic_graph") as mock_create:
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="Diagnosis: CVR drop drove revenue loss.")],
                    "contribution_scores": [
                        {"component_name": "CVR", "contribution_value": -100, "rank": 1},
                    ],
                    "kpi_slices": [],
                    "segment_breakdowns": [],
                    "data_quality_gaps": [],
                    "evidence": [],
                    "reasoning_log": [],
                }
            )
            mock_create.return_value = mock_graph

            payload = {"prompt": "Revenue dropped. Decompose."}
            result = await invoke(payload)

            assert "result" in result
            assert "ranked_drivers" in result
            assert result["ranked_drivers"][0]["component_name"] == "CVR"
