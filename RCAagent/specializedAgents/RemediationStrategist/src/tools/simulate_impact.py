"""
simulate_impact_range tool: estimate revenue recovery for a remediation action.
Uses LLM to generate impact_low/mid/high, confidence, time_to_effect_days. Returns JSON with evidence_trace.
"""
import json
import re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool


def _evidence_trace(source_tool: str, query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        return json.loads(match.group())
    return {}


def make_simulate_impact_range_tool(llm: Any):
    """Build simulate_impact_range tool that uses the LLM to estimate revenue recovery."""

    _llm = llm

    @tool
    def simulate_impact_range(
        action_type: str,
        sku: str | None = None,
        region: str | None = None,
        current_daily_revenue_loss: float = 0.0,
    ) -> str:
        """Estimate how much revenue (INR) will be recovered by a remediation action.
        action_type: express_allocation | ad_optimization | price_promo_adjustment.
        Optional: sku, region, current_daily_revenue_loss (INR).
        Returns JSON with impact_low, impact_mid, impact_high (INR Lakhs), confidence (0-1), time_to_effect_days, evidence_trace."""
        action_type = (action_type or "express_allocation").lower().replace(" ", "_")
        query_params = {
            "action_type": action_type,
            "sku": sku,
            "region": region,
            "current_daily_revenue_loss": current_daily_revenue_loss,
        }
        system = """You are an impact analyst for Indian D2C/retail. Given a remediation action type and context, estimate revenue recovery in INR Lakhs.
Respond with ONLY a valid JSON object (no markdown, no other text) with exactly these keys:
- impact_low: number (conservative recovery in Lakhs)
- impact_mid: number (expected recovery in Lakhs)
- impact_high: number (optimistic recovery in Lakhs)
- confidence: number between 0 and 1
- time_to_effect_days: integer (days until impact is visible)
Use context (sku, region, current_daily_revenue_loss) to inform the range. Be realistic for Indian D2C."""
        user = f"action_type={action_type}, sku={sku or 'all'}, region={region or 'all'}, current_daily_revenue_loss={current_daily_revenue_loss}. Return JSON only."
        try:
            response = _llm.invoke([
                SystemMessage(content=system),
                HumanMessage(content=user),
            ])
            content = response.content if hasattr(response, "content") else str(response)
            parsed = _extract_json(content)
        except Exception as e:
            parsed = {"impact_low": 0, "impact_mid": 0, "impact_high": 0, "confidence": 0, "time_to_effect_days": 0}
            content = str(e)

        impact_low = float(parsed.get("impact_low", 0))
        impact_mid = float(parsed.get("impact_mid", 0))
        impact_high = float(parsed.get("impact_high", 0))
        confidence = float(parsed.get("confidence", 0.5))
        time_to_effect_days = int(parsed.get("time_to_effect_days", 5))

        out = {
            "impact_low": impact_low,
            "impact_mid": impact_mid,
            "impact_high": impact_high,
            "confidence": max(0, min(1, confidence)),
            "time_to_effect_days": max(0, time_to_effect_days),
            "sku": sku or "all",
            "region": region or "all",
        }
        out["evidence_trace"] = _evidence_trace("simulate_impact_range", query_params, dict(out))
        return json.dumps(out)

    return simulate_impact_range
