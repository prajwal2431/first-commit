"""Tests for Diagnostic Analyst: schema validation, app wiring, and entrypoint with mocked graph and MCP."""
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _mock_tools():
    """Tools from Gateway must include query_business_data and calculate_contribution_score."""
    q = MagicMock()
    q.name = "query_business_data"
    c = MagicMock()
    c.name = "calculate_contribution_score"
    return [q, c]


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
    """Test invoke with mocked graph and MCP client (no real Gateway)."""

    @pytest.mark.asyncio
    async def test_invoke_returns_result(self):
        from src.main import invoke

        with (
            patch("src.main.mcp_client") as mock_mcp,
            patch("src.main.create_diagnostic_graph") as mock_create,
        ):
            mock_mcp.get_tools = AsyncMock(return_value=_mock_tools())
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

    @pytest.mark.asyncio
    async def test_invoke_with_sheet_url_passes_to_state(self):
        from src.main import invoke

        with (
            patch("src.main.mcp_client") as mock_mcp,
            patch("src.main.create_diagnostic_graph") as mock_create,
        ):
            mock_mcp.get_tools = AsyncMock(return_value=_mock_tools())
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="Sheet data diagnosed.")],
                    "contribution_scores": [],
                    "kpi_slices": [],
                    "segment_breakdowns": [],
                    "data_quality_gaps": [],
                    "evidence": [],
                    "reasoning_log": [],
                }
            )
            mock_create.return_value = mock_graph

            payload = {
                "prompt": "Diagnose.",
                "sheet_url": "https://docs.google.com/spreadsheets/d/test123/edit",
            }
            result = await invoke(payload)

            call_args = mock_graph.ainvoke.call_args
            initial_state = call_args[0][0]
            assert initial_state["sheet_url"] == "https://docs.google.com/spreadsheets/d/test123/edit"
