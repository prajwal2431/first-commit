"""
Pydantic schemas for Contextual Scout: external signals, marketplace checks,
supply chain audits, evidence traces, and the final ScoutResult.
"""
from typing import Any

from pydantic import BaseModel, Field


class EvidenceTrace(BaseModel):
    """Attached to every claim; cites source and raw data for auditability."""

    source_tool: str = Field(..., description="Tool that produced the data, e.g. social_signal_analyzer")
    query_params: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters passed to the tool",
    )
    raw_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw response from the tool",
    )
    timestamp: str | None = Field(default=None, description="ISO timestamp when data was fetched")


class ExternalSignal(BaseModel):
    """Competitor activity, viral trends, sentiment shifts, or weather."""

    source: str = Field(..., description="Data source, e.g. social_signal_analyzer")
    signal_type: str = Field(
        ...,
        description="competitor_activity | viral_trend | sentiment | weather",
    )
    description: str = Field(..., description="Human-readable description of the signal")
    region: str | None = Field(default=None, description="Geographic region if applicable")
    severity: str = Field(default="medium", description="low, medium, high")
    evidence_trace: EvidenceTrace | dict[str, Any] = Field(
        ...,
        description="Evidence trace for this claim",
    )


class MarketplaceCheck(BaseModel):
    """Sync latency, Buybox status, or listing health for a marketplace."""

    platform: str = Field(..., description="myntra | amazon | shopify")
    check_type: str = Field(
        ...,
        description="sync_latency | buybox_status | listing_health",
    )
    status: str = Field(..., description="ok | warning | error")
    latency_ms: int | None = Field(default=None, description="Sync latency in ms if check_type is sync_latency")
    details: str | None = Field(default=None, description="Additional details, e.g. Buybox loss on SKUs")
    evidence_trace: EvidenceTrace | dict[str, Any] = Field(
        ...,
        description="Evidence trace for this claim",
    )


class SupplyChainAudit(BaseModel):
    """Inventory mismatch: demand in one region, stock in another."""

    sku: str = Field(..., description="SKU identifier")
    demand_region: str = Field(..., description="Region with high demand, e.g. Delhi")
    stock_region: str = Field(..., description="Region where stock is trapped, e.g. Mumbai")
    demand_units: float = Field(..., description="Demand units in demand_region")
    available_units: float = Field(..., description="Available units in stock_region")
    mismatch_severity: str = Field(default="medium", description="low, medium, high")
    evidence_trace: EvidenceTrace | dict[str, Any] = Field(
        ...,
        description="Evidence trace for this claim",
    )


class ConfidenceScore(BaseModel):
    """Confidence score for an external factor."""

    factor_id: str = Field(..., description="Identifier linking to external signal or check")
    factor_type: str = Field(..., description="external_signal | marketplace | supply_chain")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence 0-1")
    rationale: str | None = Field(default=None, description="Brief rationale for the score")


class ScoutResult(BaseModel):
    """Final output: external factors, marketplace checks, supply chain audits, confidence, evidence."""

    external_factors: list[ExternalSignal | dict[str, Any]] = Field(
        default_factory=list,
        description="External signals (competitor, viral, sentiment, weather)",
    )
    marketplace_checks: list[MarketplaceCheck | dict[str, Any]] = Field(
        default_factory=list,
        description="Sync latency, Buybox, listing health per platform",
    )
    supply_chain_audits: list[SupplyChainAudit | dict[str, Any]] = Field(
        default_factory=list,
        description="Inventory mismatches (demand vs stock region)",
    )
    confidence_scores: list[ConfidenceScore | dict[str, Any]] = Field(
        default_factory=list,
        description="Confidence 0-1 per external factor",
    )
    evidence_traces: list[EvidenceTrace | dict[str, Any]] = Field(
        default_factory=list,
        description="All evidence traces for auditability",
    )
    reasoning_log: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Chronological log of reasoning steps",
    )
    summary: str | None = Field(default=None, description="Narrative summary with evidence citations")
