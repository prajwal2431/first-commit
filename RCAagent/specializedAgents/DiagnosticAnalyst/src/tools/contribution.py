"""
calculate_contribution_score tool: multiplicative decomposition
Revenue = Traffic x CVR x AOV; ranks components by absolute impact on revenue change.
"""
import json
from typing import Any

from langchain_core.tools import tool


def _contribution_scores(
    revenue_current: float,
    revenue_baseline: float,
    traffic_current: float,
    traffic_baseline: float,
    cvr_current: float,
    cvr_baseline: float,
    aov_current: float,
    aov_baseline: float,
) -> list[dict[str, Any]]:
    """
    Multiplicative decomposition: Revenue = Traffic * CVR * AOV (in consistent units).
    Contribution of component X = (X_current - X_baseline) * (product of other components at baseline).
    """
    total_delta = revenue_current - revenue_baseline
    if revenue_baseline == 0:
        return []

    # Revenue = Traffic * (CVR/100) * (AOV/100) if CVR in % and AOV in rupees, etc.
    # Assume we work in normalized units so Revenue = Traffic * CVR * AOV (e.g. Traffic in 1k, CVR in %, AOV in 1k)
    # Then rev = traffic * (cvr/100) * aov for typical units. For simplicity use direct product and let units be consistent.
    # Contribution of Traffic = (T_cur - T_base) * CVR_base * AOV_base
    contrib_traffic = (traffic_current - traffic_baseline) * cvr_baseline * aov_baseline
    contrib_cvr = traffic_baseline * (cvr_current - cvr_baseline) * aov_baseline
    contrib_aov = traffic_baseline * cvr_baseline * (aov_current - aov_baseline)

    components = [
        ("Traffic", contrib_traffic),
        ("CVR", contrib_cvr),
        ("AOV", contrib_aov),
    ]
    # Rank by absolute impact (descending)
    components.sort(key=lambda x: abs(x[1]), reverse=True)
    total_abs = sum(abs(c[1]) for c in components) or 1.0

    result: list[dict[str, Any]] = []
    for rank, (name, contrib) in enumerate(components, start=1):
        direction = "down" if contrib < 0 else "up"
        pct = (abs(contrib) / total_abs * 100) if total_abs else 0.0
        result.append({
            "component_name": name,
            "contribution_value": round(contrib, 4),
            "contribution_percent": round(pct, 2),
            "direction": direction,
            "rank": rank,
        })
    return result


@tool
def calculate_contribution_score(
    revenue_current: float,
    revenue_baseline: float,
    traffic_current: float,
    traffic_baseline: float,
    cvr_current: float,
    cvr_baseline: float,
    aov_current: float,
    aov_baseline: float,
) -> str:
    """Rank which component (Traffic, CVR, AOV) had the highest impact on revenue change.
    Uses multiplicative decomposition: Revenue = Traffic x CVR x AOV.
    Returns JSON list of ContributionScore with component_name, contribution_value, contribution_percent, direction, rank."""
    scores = _contribution_scores(
        revenue_current,
        revenue_baseline,
        traffic_current,
        traffic_baseline,
        cvr_current,
        cvr_baseline,
        aov_current,
        aov_baseline,
    )
    return json.dumps({"ranked_drivers": scores})
