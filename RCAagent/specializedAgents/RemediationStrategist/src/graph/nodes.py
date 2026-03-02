"""
Supervisor and worker nodes for the Remediation Strategist graph.
Flow: action_mapper -> impact_simulator -> prioritizer -> memo_generator.
"""
import json
import re
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import RemediationGraphState

WORKER_ACTION_MAPPER = "worker_action_mapper"
WORKER_IMPACT_SIMULATOR = "worker_impact_simulator"
WORKER_PRIORITIZER = "worker_prioritizer"
WORKER_MEMO_GENERATOR = "worker_memo_generator"

SUPERVISOR_SYSTEM = """You are the supervisor for the Remediation Strategist. You turn business anomalies into Owned Actions.

Flow (follow in order):
1. worker_action_mapper: Map root causes to remediation paths (Express Allocation, Ad Optimization, Price/Promo). Call once with root causes from the user/context.
2. worker_impact_simulator: Estimate revenue recovery for each mapped action. Call once when actions are available.
3. worker_prioritizer: Rank actions by Impact vs Effort (Quick Win, Strategic Move, etc.) and flag high-risk for approval. Call once when impact projections are available.
4. worker_memo_generator: Produce the Decision Memo: Top 3 reasons, Top 5 actions, local-friendly summary. Call once when prioritization is done.

You must respond with ONLY a valid JSON object, no other text:

1. To finish: {"done": true}
2. To call workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples:
- First step: {"sends": [{"node": "worker_action_mapper", "payload": {}}]}
- After actions mapped: {"sends": [{"node": "worker_impact_simulator", "payload": {}}]}
- After impact: {"sends": [{"node": "worker_prioritizer", "payload": {}}]}
- Final step: {"sends": [{"node": "worker_memo_generator", "payload": {"task": "Generate Decision Memo"}}]}

Valid node names: worker_action_mapper, worker_impact_simulator, worker_prioritizer, worker_memo_generator.
"""


def _extract_json(text: str) -> dict[str, Any]:
    """Extract a JSON object from LLM response (allow markdown code block)."""
    text = text.strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        return json.loads(match.group())
    return {"done": True}


def make_supervisor_node(llm: Any) -> Any:
    """Build the supervisor node that decides next worker(s) or end."""

    def supervisor_node(state: RemediationGraphState) -> dict[str, Any]:
        messages = state.get("messages") or []
        remediation_actions = state.get("remediation_actions") or []
        impact_projections = state.get("impact_projections") or []
        prioritized_actions = state.get("prioritized_actions") or []
        decision_memo = state.get("decision_memo") or {}
        reasoning_log = state.get("reasoning_log") or []
        prompt_parts = [
            "Current state:",
            f"- Messages: {len(messages)}",
            f"- Root causes: {len(state.get('root_causes') or [])}",
            f"- Remediation actions: {len(remediation_actions)}",
            f"- Impact projections: {len(impact_projections)}",
            f"- Prioritized actions: {len(prioritized_actions)}",
            f"- Decision memo: {'yes' if decision_memo else 'no'}",
            f"- Reasoning log entries: {len(reasoning_log)}",
        ]
        if messages:
            last_msg = messages[-1]
            prompt_parts.append(
                f"\nLast message (user or assistant): {getattr(last_msg, 'content', str(last_msg))[:800]}"
            )
        prompt_parts.append("\nDecide the next step. Reply with JSON only.")

        response = llm.invoke(
            [
                SystemMessage(content=SUPERVISOR_SYSTEM),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )
        content = response.content if hasattr(response, "content") else str(response)
        try:
            decision = _extract_json(content)
        except json.JSONDecodeError:
            decision = {"done": True}

        if decision.get("done"):
            return {"supervisor_decision": {"done": True}}
        sends = decision.get("sends") or []
        if not sends:
            return {"supervisor_decision": {"done": True}}
        return {"supervisor_decision": {"sends": sends}}

    return supervisor_node


def _run_worker_agent(llm: Any, tools: list[Any], system_prompt: str, task_message: str) -> str:
    """Run a ReAct-style agent with given tools and return last message content."""
    graph = create_agent(llm, tools=tools)
    messages: list[BaseMessage] = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_message),
    ]
    result = graph.invoke({"messages": messages})
    out_messages = result.get("messages") or []
    if out_messages:
        last = out_messages[-1]
        return getattr(last, "content", str(last))
    return ""


def make_worker_action_mapper(llm: Any, map_tool: Any) -> Any:
    """Worker: map root causes to remediation actions using map_remediation_action."""

    def node(state: RemediationGraphState) -> dict[str, Any]:
        root_causes = state.get("root_causes") or []
        all_actions: list[dict[str, Any]] = []
        evidence_traces: list[dict[str, Any]] = []
        reasoning_log: list[dict[str, Any]] = []

        for rc in root_causes:
            if isinstance(rc, str):
                rc = {"root_cause_type": rc, "severity": "medium"}
            rc_type = rc.get("root_cause_type") or "stockout"
            severity = rc.get("severity") or "medium"
            skus = rc.get("affected_skus")
            region = rc.get("affected_region")
            try:
                raw = map_tool.invoke({
                    "root_cause_type": rc_type,
                    "severity": severity,
                    "affected_skus": skus,
                    "affected_region": region,
                })
                data = json.loads(raw) if isinstance(raw, str) else raw
                actions = data.get("actions", [])
                trace = data.get("evidence_trace")
                if trace:
                    evidence_traces.append(trace)
                for a in actions:
                    a["_root_cause_type"] = rc_type
                    all_actions.append(a)
                reasoning_log.append({"phase": "action_mapper", "root_cause_type": rc_type, "actions_count": len(actions)})
            except Exception as e:
                reasoning_log.append({"phase": "action_mapper", "error": str(e), "root_cause_type": rc_type})

        summary = f"Mapped {len(root_causes)} root cause(s) to {len(all_actions)} remediation action(s)."
        return {
            "remediation_actions": all_actions,
            "evidence_traces": evidence_traces,
            "reasoning_log": reasoning_log,
            "messages": [AIMessage(content=summary)],
            "current_phase": "action_mapper",
        }

    return node


def make_worker_impact_simulator(llm: Any, simulate_tool: Any) -> Any:
    """Worker: simulate revenue impact for each remediation action."""

    def node(state: RemediationGraphState) -> dict[str, Any]:
        actions = state.get("remediation_actions") or []
        impact_projections: list[dict[str, Any]] = []
        evidence_traces: list[dict[str, Any]] = []
        reasoning_log: list[dict[str, Any]] = []

        for i, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            action_type = action.get("action_type") or "express_allocation"
            sku = action.get("target_sku")
            region = action.get("target_region")
            try:
                raw = simulate_tool.invoke({
                    "action_type": action_type,
                    "sku": sku,
                    "region": region,
                    "current_daily_revenue_loss": 0.0,
                })
                data = json.loads(raw) if isinstance(raw, str) else raw
                trace = data.get("evidence_trace")
                if trace:
                    evidence_traces.append(trace)
                action_id = f"action_{i}_{action_type}"
                impact_projections.append({
                    "action_id": action_id,
                    "action_index": i,
                    "revenue_recovery_low": data.get("impact_low", 0),
                    "revenue_recovery_mid": data.get("impact_mid", 0),
                    "revenue_recovery_high": data.get("impact_high", 0),
                    "confidence": data.get("confidence", 0.5),
                    "time_to_effect_days": data.get("time_to_effect_days", 5),
                })
            except Exception as e:
                reasoning_log.append({"phase": "impact_simulator", "error": str(e), "action_index": i})

        summary = f"Simulated impact for {len(impact_projections)} action(s)."
        return {
            "impact_projections": impact_projections,
            "evidence_traces": evidence_traces,
            "reasoning_log": reasoning_log,
            "messages": [AIMessage(content=summary)],
            "current_phase": "impact_simulator",
        }

    return node


def make_worker_prioritizer(llm: Any, assess_tool: Any) -> Any:
    """Worker: assess risk, rank by Impact vs Effort, set requires_approval for high-risk."""

    def node(state: RemediationGraphState) -> dict[str, Any]:
        actions = state.get("remediation_actions") or []
        projections = state.get("impact_projections") or []
        proj_by_idx = {p.get("action_index", i): p for i, p in enumerate(projections)}

        prioritized: list[dict[str, Any]] = []
        evidence_traces: list[dict[str, Any]] = []
        reasoning_log: list[dict[str, Any]] = []
        requires_approval = False

        for i, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            action_type = action.get("action_type") or "express_allocation"
            proj = proj_by_idx.get(i, {})
            impact_mid = proj.get("revenue_recovery_mid", 0)
            effort_hours = action.get("estimated_hours", 4.0)
            effort_level = action.get("effort_level", "medium")

            try:
                raw = assess_tool.invoke({
                    "action_type": action_type,
                    "affected_inventory_percent": 10.0,
                    "revenue_at_stake": impact_mid or 1.0,
                    "action_scope": "single_sku",
                })
                data = json.loads(raw) if isinstance(raw, str) else raw
                if data.get("evidence_trace"):
                    evidence_traces.append(data["evidence_trace"])
                risk_level = data.get("risk_level", "low")
                if data.get("requires_approval"):
                    requires_approval = True

                # Impact score 0-1 (normalize by 2 Lakhs as high)
                impact_score = min(1.0, (impact_mid or 0) / 2.0)
                effort_score = min(1.0, effort_hours / 8.0)
                # Category: quick_win (high impact, low effort), strategic_move (high impact, high effort), fill_in (low impact, low effort), major_project (low impact, high effort)
                if impact_score >= 0.5 and effort_score < 0.5:
                    category = "quick_win"
                elif impact_score >= 0.5 and effort_score >= 0.5:
                    category = "strategic_move"
                elif impact_score < 0.5 and effort_score < 0.5:
                    category = "fill_in"
                else:
                    category = "major_project"

                prioritized.append({
                    **action,
                    "priority_rank": len(prioritized) + 1,
                    "category": category,
                    "impact_score": round(impact_score, 2),
                    "effort_score": round(effort_score, 2),
                    "risk_level": risk_level,
                    "requires_approval": data.get("requires_approval", False),
                    "revenue_recovery_mid": proj.get("revenue_recovery_mid") or impact_mid,
                })
            except Exception as e:
                reasoning_log.append({"phase": "prioritizer", "error": str(e), "action_index": i})

        # Sort: quick_win first, then strategic_move, then fill_in, then major_project
        order = {"quick_win": 0, "strategic_move": 1, "fill_in": 2, "major_project": 3}
        prioritized.sort(key=lambda x: (order.get(x.get("category", ""), 4), -x.get("impact_score", 0)))
        for r, p in enumerate(prioritized, 1):
            p["priority_rank"] = r

        summary = f"Prioritized {len(prioritized)} action(s). requires_approval={requires_approval}."
        return {
            "prioritized_actions": prioritized,
            "evidence_traces": evidence_traces,
            "reasoning_log": reasoning_log,
            "requires_approval": requires_approval,
            "messages": [AIMessage(content=summary)],
            "current_phase": "prioritizer",
        }

    return node


def make_worker_memo_generator(llm: Any) -> Any:
    """Worker: produce Decision Memo (Top 3 reasons, Top 5 actions, local-friendly summary). No tools."""

    def node(state: RemediationGraphState) -> dict[str, Any]:
        prioritized = state.get("prioritized_actions") or []
        root_causes = state.get("root_causes") or []
        requires_approval = state.get("requires_approval", False)
        task = "Generate the Seller Output: Top 3 reasons (root causes in local-friendly language), Top 5 actions (with priority, owner, impact), and a short summary. Use simple Hindi/English mix if helpful for the business user. If requires_approval is true, list which actions need approval."

        # Build context for LLM
        reasons_raw = []
        for rc in root_causes[:5]:
            if isinstance(rc, dict):
                reasons_raw.append(rc.get("root_cause_type", str(rc)))
            else:
                reasons_raw.append(str(rc))
        actions_raw = []
        for p in prioritized[:5]:
            if isinstance(p, dict):
                actions_raw.append({
                    "description": p.get("description", ""),
                    "owner_role": p.get("owner_role", ""),
                    "category": p.get("category", ""),
                    "revenue_recovery_mid": p.get("revenue_recovery_mid"),
                    "requires_approval": p.get("requires_approval", False),
                })
            else:
                actions_raw.append(str(p))

        context = (
            f"Root causes (top 3 for memo): {reasons_raw[:3]}\n"
            f"Top 5 prioritized actions: {json.dumps(actions_raw, default=str)}\n"
            f"Requires human approval (high-risk): {requires_approval}"
        )
        system = """You are the Remediation Strategist. Produce a Decision Memo for the seller in local-friendly language (Indian D2C context). Output a JSON object with exactly: "top_reasons" (list of up to 3 strings), "top_actions" (list of up to 5 objects with description, owner_role, impact estimate, requires_approval if any), "summary" (2-4 sentences in simple language), "requires_human_approval" (boolean), "high_risk_actions" (list of action descriptions that need approval, or empty). No other text."""
        content = _run_worker_agent(llm, [], system, task + "\n\n" + context)

        try:
            match = re.search(r"\{[\s\S]*\}", content)
            memo = json.loads(match.group()) if match else {}
        except json.JSONDecodeError:
            memo = {
                "top_reasons": reasons_raw[:3],
                "top_actions": actions_raw,
                "summary": content[:500] if content else "Remediation plan generated.",
                "requires_human_approval": requires_approval,
                "high_risk_actions": [],
            }

        if "top_reasons" not in memo:
            memo["top_reasons"] = reasons_raw[:3]
        if "top_actions" not in memo:
            memo["top_actions"] = actions_raw
        if "summary" not in memo:
            memo["summary"] = memo.get("summary", "Remediation plan ready for review.")
        if "requires_human_approval" not in memo:
            memo["requires_human_approval"] = requires_approval
        if "high_risk_actions" not in memo:
            memo["high_risk_actions"] = []

        return {
            "decision_memo": memo,
            "reasoning_log": [{"phase": "memo_generator", "output": content[:300]}],
            "messages": [AIMessage(content=memo.get("summary", content[:200]))],
            "current_phase": "memo_generator",
        }

    return node
