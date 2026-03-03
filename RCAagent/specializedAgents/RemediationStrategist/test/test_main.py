"""Tests for Remediation Strategist: tools output structure, schema validation, and entrypoint."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestSimulateImpactRange:
    """Test simulate_impact_range tool output structure (LLM-backed; mock LLM in tests)."""

    def test_returns_impact_range_and_evidence_trace(self):
        from src.tools.simulate_impact import make_simulate_impact_range_tool

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"impact_low": 0.5, "impact_mid": 1.0, "impact_high": 1.5, "confidence": 0.7, "time_to_effect_days": 5}'
        )
        tool = make_simulate_impact_range_tool(mock_llm)
        out = tool.invoke({
            "action_type": "express_allocation",
            "sku": "kurta",
            "region": "Delhi",
        })
        data = json.loads(out)
        assert "impact_low" in data and "impact_mid" in data and "impact_high" in data
        assert "confidence" in data and "time_to_effect_days" in data
        assert "evidence_trace" in data
        assert data["evidence_trace"]["source_tool"] == "simulate_impact_range"

    def test_accepts_ad_optimization_and_price_promo(self):
        from src.tools.simulate_impact import make_simulate_impact_range_tool

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"impact_low": 0.3, "impact_mid": 0.7, "impact_high": 1.0, "confidence": 0.6, "time_to_effect_days": 7}'
        )
        tool = make_simulate_impact_range_tool(mock_llm)
        for action_type in ("ad_optimization", "price_promo_adjustment"):
            out = tool.invoke({"action_type": action_type})
            data = json.loads(out)
            assert data["impact_mid"] >= 0
            assert 0 <= data["confidence"] <= 1


class TestMapRemediationAction:
    """Test map_remediation_action tool output structure (LLM-backed; mock LLM in tests)."""

    def test_returns_actions_list_and_evidence_trace(self):
        from src.tools.map_remediation import make_map_remediation_action_tool

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"actions": [{"action_type": "express_allocation", "description": "Transfer stock", "target_sku": null, "target_region": null, "owner_role": "Ops", "effort_level": "medium", "estimated_hours": 4.0}]}'
        )
        tool = make_map_remediation_action_tool(mock_llm)
        out = tool.invoke({
            "root_cause_type": "stockout",
            "severity": "high",
        })
        data = json.loads(out)
        assert "actions" in data
        assert len(data["actions"]) >= 1
        assert "evidence_trace" in data
        for a in data["actions"]:
            assert "action_type" in a and "description" in a and "owner_role" in a
            assert "effort_level" in a and "estimated_hours" in a

    def test_maps_demand_spike_and_pricing_issue(self):
        from src.tools.map_remediation import make_map_remediation_action_tool

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"actions": [{"action_type": "express_allocation", "description": "Rush replenishment", "target_sku": null, "target_region": null, "owner_role": "Ops", "effort_level": "high", "estimated_hours": 8.0}]}'
        )
        tool = make_map_remediation_action_tool(mock_llm)
        for rc in ("demand_spike", "pricing_issue"):
            out = tool.invoke({"root_cause_type": rc})
            data = json.loads(out)
            assert len(data["actions"]) >= 1


class TestAssessRiskLevel:
    """Test assess_risk_level tool and requires_approval logic."""

    def test_returns_risk_level_and_requires_approval(self):
        from src.tools.assess_risk import assess_risk_level

        out = assess_risk_level.invoke({
            "action_type": "express_allocation",
            "affected_inventory_percent": 10.0,
            "revenue_at_stake": 1.0,
            "action_scope": "single_sku",
        })
        data = json.loads(out)
        assert "risk_level" in data
        assert "requires_approval" in data
        assert "risk_factors" in data
        assert "evidence_trace" in data

    def test_high_risk_sets_requires_approval(self):
        from src.tools.assess_risk import assess_risk_level

        out = assess_risk_level.invoke({
            "action_type": "price_promo_adjustment",
            "affected_inventory_percent": 35.0,
            "revenue_at_stake": 6.0,
            "action_scope": "category",
        })
        data = json.loads(out)
        assert data["risk_level"] == "high"
        assert data["requires_approval"] is True


class TestRemediationSchemas:
    """Test Pydantic schema validation."""

    def test_evidence_trace_and_remediation_action(self):
        from src.schemas.remediation import EvidenceTrace, RemediationAction

        EvidenceTrace(
            source_tool="simulate_impact_range",
            query_params={"action_type": "express_allocation"},
            raw_data={},
        )
        RemediationAction(
            action_type="express_allocation",
            description="Transfer stock",
            owner_role="Ops",
            effort_level="medium",
            estimated_hours=4.0,
        )

    def test_decision_memo_and_remediation_result(self):
        from src.schemas.remediation import DecisionMemo, RemediationResult

        memo = DecisionMemo(
            top_reasons=["Stockout in North India", "CVR drop"],
            top_actions=[{"description": "Express allocation", "owner_role": "Ops"}],
            summary="Remediation plan ready.",
            requires_human_approval=False,
            high_risk_actions=[],
        )
        assert len(memo.top_reasons) == 2
        RemediationResult(
            remediation_actions=[],
            impact_projections=[],
            prioritized_actions=[],
            decision_memo=memo,
            requires_approval=False,
            evidence_traces=[],
            reasoning_log=[],
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
    async def test_invoke_returns_result_and_structured_fields(self):
        from src.main import invoke

        with patch("src.main.create_remediation_graph") as mock_create:
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="Remediation plan generated.")],
                    "remediation_actions": [
                        {"action_type": "express_allocation", "description": "Transfer stock", "owner_role": "Ops"},
                    ],
                    "impact_projections": [],
                    "prioritized_actions": [
                        {"priority_rank": 1, "category": "quick_win", "requires_approval": False},
                    ],
                    "decision_memo": {
                        "top_reasons": ["Stockout in North India"],
                        "top_actions": [{"description": "Express allocation"}],
                        "summary": "Top action: express allocation to Delhi.",
                        "requires_human_approval": False,
                        "high_risk_actions": [],
                    },
                    "requires_approval": False,
                    "evidence_traces": [],
                    "reasoning_log": [],
                }
            )
            mock_create.return_value = mock_graph

            payload = {"prompt": "Stockout in Delhi. Suggest actions.", "root_causes": [{"root_cause_type": "stockout"}]}
            result = await invoke(payload)

            assert "result" in result
            assert "remediation_actions" in result
            assert "prioritized_actions" in result
            assert "decision_memo" in result
            assert "requires_approval" in result
            assert result["requires_approval"] is False
            assert result["decision_memo"]["summary"]

    @pytest.mark.asyncio
    async def test_invoke_passes_requires_approval_when_high_risk(self):
        from src.main import invoke

        with patch("src.main.create_remediation_graph") as mock_create:
            mock_graph = MagicMock()
            mock_graph.ainvoke = AsyncMock(
                return_value={
                    "messages": [MagicMock(type="ai", content="One action needs approval.")],
                    "remediation_actions": [],
                    "impact_projections": [],
                    "prioritized_actions": [{"requires_approval": True}],
                    "decision_memo": {"summary": "High-risk action flagged.", "requires_human_approval": True},
                    "requires_approval": True,
                    "evidence_traces": [],
                    "reasoning_log": [],
                }
            )
            mock_create.return_value = mock_graph

            result = await invoke({"prompt": "Clear 40% stock."})
            assert result.get("requires_approval") is True