"""Tests for Diagnostic Analyst: tools math, query structure, schema validation, live data cache, and entrypoint."""
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
    """Test query_business_data: no mock data; without live data returns empty + data_source gap."""

    def setup_method(self):
        from src.tools.query_data import clear_live_data
        clear_live_data()

    def test_no_data_source_returns_empty_slices_and_gap(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({"metric": "all", "period": "WoW"})
        data = json.loads(out)
        assert "kpi_slices" in data
        assert "data_quality_gaps" in data
        assert data["kpi_slices"] == []
        assert len(data["data_quality_gaps"]) >= 1
        assert data["data_quality_gaps"][0]["field_name"] == "data_source"
        assert "No data source" in data["data_quality_gaps"][0].get("message", "")

    def test_no_data_source_single_metric_returns_empty_and_gap(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({"metric": "Revenue"})
        data = json.loads(out)
        assert data["kpi_slices"] == []
        assert any(g.get("field_name") == "data_source" for g in data["data_quality_gaps"])

    def test_segment_without_data_source_returns_empty_and_gap(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({
            "metric": "all",
            "segment_dimension": "Region",
            "segment_value": "North India",
        })
        data = json.loads(out)
        assert data["kpi_slices"] == []
        assert len(data["data_quality_gaps"]) >= 1

    def test_segment_pincode_without_data_flags_gap(self):
        from src.tools.query_data import query_business_data

        out = query_business_data.invoke({
            "metric": "all",
            "segment_dimension": "Pincode",
            "segment_value": "110001",
        })
        data = json.loads(out)
        assert len(data.get("data_quality_gaps", [])) >= 1


class TestLiveDataCache:
    """Test that set_live_data/clear_live_data switch query_business_data from mock to real."""

    def setup_method(self):
        from src.tools.query_data import clear_live_data
        clear_live_data()

    def teardown_method(self):
        from src.tools.query_data import clear_live_data
        clear_live_data()

    def test_set_live_data_overrides_mock(self):
        from src.tools.query_data import query_business_data, set_live_data

        set_live_data({
            "aggregate": {
                "Revenue": {"current": 100.0, "baseline": 200.0, "period": "DoD"},
                "Traffic": {"current": 5000, "baseline": 6000, "period": "DoD"},
                "CVR": {"current": 3.0, "baseline": 4.0, "period": "DoD"},
                "AOV": {"current": 2000, "baseline": 1800, "period": "DoD"},
            },
            "by_region": {},
            "by_channel": {},
            "by_pincode": {},
        })

        out = query_business_data.invoke({"metric": "Revenue"})
        data = json.loads(out)
        assert data["kpi_slices"][0]["current_value"] == 100.0
        assert data["kpi_slices"][0]["baseline_value"] == 200.0

    def test_set_live_data_segment_override(self):
        from src.tools.query_data import query_business_data, set_live_data

        set_live_data({
            "aggregate": {},
            "by_region": {
                "Custom Region": {
                    "Revenue": {"current": 10.0, "baseline": 20.0},
                    "Traffic": {"current": 1000, "baseline": 2000},
                }
            },
            "by_channel": {},
            "by_pincode": {},
        })

        out = query_business_data.invoke({
            "metric": "all",
            "segment_dimension": "Region",
            "segment_value": "Custom Region",
        })
        data = json.loads(out)
        assert len(data["kpi_slices"]) == 2
        rev = next(s for s in data["kpi_slices"] if s["metric_name"] == "Revenue")
        assert rev["current_value"] == 10.0

    def test_clear_live_data_returns_no_data(self):
        from src.tools.query_data import query_business_data, set_live_data, clear_live_data

        set_live_data({"aggregate": {"Revenue": {"current": 999, "baseline": 999, "period": "X"}}, "by_region": {}, "by_channel": {}, "by_pincode": {}})
        clear_live_data()

        out = query_business_data.invoke({"metric": "Revenue"})
        data = json.loads(out)
        assert data["kpi_slices"] == []
        assert any(g.get("field_name") == "data_source" for g in data["data_quality_gaps"])

    def test_missing_metric_in_live_data_flags_gap(self):
        from src.tools.query_data import query_business_data, set_live_data

        set_live_data({"aggregate": {}, "by_region": {}, "by_channel": {}, "by_pincode": {}})

        out = query_business_data.invoke({"metric": "all"})
        data = json.loads(out)
        assert data["kpi_slices"] == []
        assert len(data["data_quality_gaps"]) == 4


class TestExtractKpiData:
    """Test the extract_kpi_data tool with sample raw tabs and mapping."""

    def setup_method(self):
        from src.tools.query_data import clear_live_data
        clear_live_data()

    def teardown_method(self):
        from src.tools.query_data import clear_live_data
        clear_live_data()

    def test_extract_basic_aggregate(self):
        from src.tools.sheet_loader import extract_kpi_data

        raw_tabs = {
            "Sales": [
                {"Date": "2025-02-24", "Revenue": 52.0, "Sessions": 130000, "CVR": "2.5%", "AOV": "1,600"},
                {"Date": "2025-03-03", "Revenue": 42.5, "Sessions": 125000, "CVR": "2.1%", "AOV": "1,620"},
            ]
        }
        mapping = {
            "aggregate_tab": "Sales",
            "aggregate_mapping": {
                "date_col": "Date",
                "Revenue": "Revenue",
                "Traffic": "Sessions",
                "CVR": "CVR",
                "AOV": "AOV",
            },
            "segment_tabs": [],
            "period_detection": {
                "current_row_index": -1,
                "baseline_row_index": -2,
                "period_label": "WoW",
            },
        }

        out = extract_kpi_data.invoke({
            "raw_tabs_json": json.dumps(raw_tabs),
            "column_mapping_json": json.dumps(mapping),
        })
        data = json.loads(out)
        assert "data" in data
        agg = data["data"]["aggregate"]
        assert "Revenue" in agg
        assert agg["Revenue"]["current"] == 42.5
        assert agg["Revenue"]["baseline"] == 52.0
        assert agg["Traffic"]["current"] == 125000
        assert agg["CVR"]["current"] == 2.1
        assert agg["AOV"]["current"] == 1620

    def test_extract_flags_missing_tab(self):
        from src.tools.sheet_loader import extract_kpi_data

        raw_tabs = {}
        mapping = {
            "aggregate_tab": "Missing Tab",
            "aggregate_mapping": {"Revenue": "Rev"},
            "segment_tabs": [],
            "period_detection": {"current_row_index": -1, "baseline_row_index": -2, "period_label": "WoW"},
        }

        out = extract_kpi_data.invoke({
            "raw_tabs_json": json.dumps(raw_tabs),
            "column_mapping_json": json.dumps(mapping),
        })
        data = json.loads(out)
        assert len(data["data_quality_gaps"]) >= 1

    def test_extract_with_segments(self):
        from src.tools.sheet_loader import extract_kpi_data

        raw_tabs = {
            "Sales": [
                {"Date": "2025-02-24", "Revenue": 52.0, "Sessions": 130000, "CVR": 2.5, "AOV": 1600},
                {"Date": "2025-03-03", "Revenue": 42.5, "Sessions": 125000, "CVR": 2.1, "AOV": 1620},
            ],
            "Regional": [
                {"Week": "2025-02-24", "Zone": "North India", "Rev": 24.0, "Visits": 55000, "CR": 2.4, "AOV": 1600},
                {"Week": "2025-03-03", "Zone": "North India", "Rev": 18.0, "Visits": 52000, "CR": 1.8, "AOV": 1615},
                {"Week": "2025-02-24", "Zone": "South India", "Rev": 14.5, "Visits": 38000, "CR": 2.2, "AOV": 1620},
                {"Week": "2025-03-03", "Zone": "South India", "Rev": 14.2, "Visits": 38000, "CR": 2.2, "AOV": 1625},
            ],
        }
        mapping = {
            "aggregate_tab": "Sales",
            "aggregate_mapping": {
                "date_col": "Date",
                "Revenue": "Revenue",
                "Traffic": "Sessions",
                "CVR": "CVR",
                "AOV": "AOV",
            },
            "segment_tabs": [
                {
                    "tab": "Regional",
                    "dimension": "Region",
                    "dimension_col": "Zone",
                    "date_col": "Week",
                    "Revenue": "Rev",
                    "Traffic": "Visits",
                    "CVR": "CR",
                    "AOV": "AOV",
                }
            ],
            "period_detection": {
                "current_row_index": -1,
                "baseline_row_index": -2,
                "period_label": "WoW",
            },
        }

        out = extract_kpi_data.invoke({
            "raw_tabs_json": json.dumps(raw_tabs),
            "column_mapping_json": json.dumps(mapping),
        })
        data = json.loads(out)
        assert "North India" in data["segments_found"]["regions"]
        assert "South India" in data["segments_found"]["regions"]
        assert data["data"]["by_region"]["North India"]["Revenue"]["current"] == 18.0

    def test_extract_injects_into_query_data_cache(self):
        from src.tools.sheet_loader import extract_kpi_data
        from src.tools.query_data import query_business_data, clear_live_data

        raw_tabs = {
            "Sales": [
                {"Date": "W1", "Revenue": 100.0, "Sessions": 5000, "CVR": 3.0, "AOV": 2000},
                {"Date": "W2", "Revenue": 80.0, "Sessions": 4000, "CVR": 2.5, "AOV": 1900},
            ]
        }
        mapping = {
            "aggregate_tab": "Sales",
            "aggregate_mapping": {"date_col": "Date", "Revenue": "Revenue", "Traffic": "Sessions", "CVR": "CVR", "AOV": "AOV"},
            "segment_tabs": [],
            "period_detection": {"current_row_index": -1, "baseline_row_index": -2, "period_label": "WoW"},
        }

        extract_kpi_data.invoke({
            "raw_tabs_json": json.dumps(raw_tabs),
            "column_mapping_json": json.dumps(mapping),
        })

        out = query_business_data.invoke({"metric": "Revenue"})
        data = json.loads(out)
        assert data["kpi_slices"][0]["current_value"] == 80.0
        assert data["kpi_slices"][0]["baseline_value"] == 100.0

        clear_live_data()


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

    @pytest.mark.asyncio
    async def test_invoke_with_sheet_url_passes_to_state(self):
        from src.main import invoke

        with patch("src.main.create_diagnostic_graph") as mock_create:
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="Sheet ingested and diagnosed.")],
                    "contribution_scores": [],
                    "kpi_slices": [],
                    "segment_breakdowns": [],
                    "data_quality_gaps": [],
                    "evidence": [],
                    "reasoning_log": [],
                    "column_mapping": {"status": "set"},
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
            assert "column_mapping" in result
