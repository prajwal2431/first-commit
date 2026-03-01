"""
Pydantic schemas for Diagnostic Analyst: KPI slices, contribution scores,
segment breakdowns, data quality gaps, and the final DiagnosticResult.
"""
from typing import Any

from pydantic import BaseModel, Field


class KPISlice(BaseModel):
    """Single KPI metric with current, baseline, and deltas."""

    metric_name: str = Field(..., description="e.g. Revenue, Traffic, CVR, AOV")
    current_value: float = Field(..., description="Value for current period")
    baseline_value: float = Field(..., description="Value for comparison period")
    delta_absolute: float = Field(..., description="current - baseline")
    delta_percent: float = Field(..., description="(current - baseline) / baseline * 100")
    period: str = Field(default="WoW", description="e.g. WoW, DoD")


class ContributionScore(BaseModel):
    """Ranked component contribution to total revenue change."""

    component_name: str = Field(..., description="e.g. CVR, Traffic, AOV")
    contribution_value: float = Field(
        ..., description="Absolute revenue impact (same units as revenue)"
    )
    contribution_percent: float = Field(
        ..., description="Share of total change attributed to this component"
    )
    direction: str = Field(..., description="up or down")
    rank: int = Field(..., ge=1, description="1 = highest impact")


class SegmentBreakdown(BaseModel):
    """KPI breakdown for a single segment (Pincode, Region, or Channel)."""

    dimension: str = Field(..., description="Pincode, Region, or Channel")
    segment_value: str = Field(..., description="e.g. North India, Myntra, 110001")
    kpi_slices: list[dict[str, Any]] = Field(
        default_factory=list,
        description="KPI slices for this segment (serializable dicts)",
    )
    is_localized: bool = Field(
        default=False,
        description="True if the drop is concentrated in this segment",
    )


class DataQualityGap(BaseModel):
    """Flag when data is missing, incomplete, or stale."""

    field_name: str = Field(..., description="Affected field or metric")
    reason: str = Field(
        ..., description="missing, incomplete, or stale"
    )
    severity: str = Field(default="medium", description="low, medium, high")


class DiagnosticResult(BaseModel):
    """Final output for the Evidence Store: ranked drivers and data evidence."""

    alert_id: str | None = Field(default=None, description="Backend alert/event id if provided")
    kpi_slices: list[KPISlice] = Field(
        default_factory=list,
        description="Traffic, CVR, AOV (and Revenue) slices",
    )
    ranked_drivers: list[ContributionScore] = Field(
        default_factory=list,
        description="Components ranked by impact on revenue change",
    )
    segment_breakdowns: list[SegmentBreakdown] = Field(
        default_factory=list,
        description="Drill-down by Pincode, Region, Channel",
    )
    data_quality_gaps: list[DataQualityGap] = Field(
        default_factory=list,
        description="Missing or incomplete data flagged",
    )
    evidence: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Raw data evidence (tables/plots references)",
    )
    reasoning_log: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Chronological log of reasoning steps",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence in the diagnosis (0-1)",
    )
