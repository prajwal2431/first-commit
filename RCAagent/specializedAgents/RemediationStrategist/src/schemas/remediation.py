"""
Pydantic schemas for Remediation Strategist: actions, impact projections,
prioritized actions, decision memo, and the final RemediationResult.
"""
from typing import Any

from pydantic import BaseModel, Field


class EvidenceTrace(BaseModel):
    """Attached to every claim; cites source and raw data for auditability."""

    source_tool: str = Field(
        ...,
        description="Tool that produced the data, e.g. simulate_impact_range",
    )
    query_params: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters passed to the tool",
    )
    raw_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw response from the tool",
    )
    timestamp: str | None = Field(
        default=None,
        description="ISO timestamp when data was fetched",
    )


class RemediationAction(BaseModel):
    """Single remediation path mapped from a root cause."""

    action_type: str = Field(
        ...,
        description="express_allocation | ad_optimization | price_promo_adjustment",
    )
    description: str = Field(..., description="Human-readable action description")
    target_sku: str | None = Field(default=None, description="SKU if applicable")
    target_region: str | None = Field(default=None, description="Region if applicable")
    owner_role: str = Field(..., description="Suggested owner, e.g. Ops, Growth, Marketing")
    effort_level: str = Field(..., description="low | medium | high")
    estimated_hours: float = Field(..., ge=0, description="Estimated effort in hours")


class ImpactProjection(BaseModel):
    """Revenue recovery estimate for an action."""

    action_id: str = Field(..., description="Identifier linking to remediation action")
    revenue_recovery_low: float = Field(..., ge=0, description="Conservative recovery (INR)")
    revenue_recovery_mid: float = Field(..., ge=0, description="Expected recovery (INR)")
    revenue_recovery_high: float = Field(..., ge=0, description="Optimistic recovery (INR)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence 0-1")
    time_to_effect_days: int = Field(..., ge=0, description="Days until impact visible")


class PrioritizedAction(BaseModel):
    """Action with priority rank and Impact-vs-Effort category."""

    action_type: str = Field(..., description="express_allocation | ad_optimization | price_promo_adjustment")
    description: str = Field(..., description="Action description")
    target_sku: str | None = Field(default=None)
    target_region: str | None = Field(default=None)
    owner_role: str = Field(..., description="Suggested owner")
    effort_level: str = Field(..., description="low | medium | high")
    estimated_hours: float = Field(..., ge=0)
    priority_rank: int = Field(..., ge=1, description="1 = highest priority")
    category: str = Field(
        ...,
        description="quick_win | strategic_move | major_project | fill_in",
    )
    impact_score: float = Field(..., ge=0.0, le=1.0, description="Normalized impact 0-1")
    effort_score: float = Field(..., ge=0.0, le=1.0, description="Normalized effort 0-1")
    risk_level: str = Field(..., description="low | medium | high")
    requires_approval: bool = Field(
        default=False,
        description="True when high-risk; HITL trigger",
    )
    revenue_recovery_mid: float | None = Field(default=None, description="Expected recovery INR if known")


class DecisionMemo(BaseModel):
    """Structured Seller Output: top reasons, top actions, local-friendly summary."""

    top_reasons: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="Top 3 root causes in local-friendly language",
    )
    top_actions: list[dict[str, Any]] = Field(
        default_factory=list,
        max_length=5,
        description="Top 5 owned actions with priority, owner, impact",
    )
    summary: str = Field(
        ...,
        description="Local-friendly narrative (Hindi/English mix acceptable)",
    )
    requires_human_approval: bool = Field(
        default=False,
        description="True if any high-risk action needs business user approval",
    )
    high_risk_actions: list[str] = Field(
        default_factory=list,
        description="Descriptions of actions that require approval",
    )


class RemediationResult(BaseModel):
    """Final output: actions, projections, prioritized list, decision memo, HITL flag."""

    remediation_actions: list[RemediationAction | dict[str, Any]] = Field(
        default_factory=list,
        description="Mapped actions from root causes",
    )
    impact_projections: list[ImpactProjection | dict[str, Any]] = Field(
        default_factory=list,
        description="Revenue recovery estimates per action",
    )
    prioritized_actions: list[PrioritizedAction | dict[str, Any]] = Field(
        default_factory=list,
        description="Ranked by Impact vs Effort with risk flags",
    )
    decision_memo: DecisionMemo | dict[str, Any] = Field(
        ...,
        description="Top 3 reasons, Top 5 actions, local-friendly summary",
    )
    requires_approval: bool = Field(
        default=False,
        description="HITL: True when any action is high-risk",
    )
    evidence_traces: list[EvidenceTrace | dict[str, Any]] = Field(
        default_factory=list,
        description="All evidence traces for auditability",
    )
    reasoning_log: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Chronological log of reasoning steps",
    )
