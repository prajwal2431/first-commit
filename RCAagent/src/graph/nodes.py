"""
Supervisor and worker nodes for the RCA graph.
Supervisor decides next step(s); workers run in parallel when the supervisor sends multiple Sends.
"""
import json
import logging
import os
import re
from typing import Any

_logger = logging.getLogger(__name__)

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import RCAGraphState

# Node names used in conditional edge and add_node
WORKER_HYPOTHESIZE = "worker_hypothesize"
WORKER_VERIFY = "worker_verify"
WORKER_SUMMARIZE = "worker_summarize"
WORKER_DIAGNOSTIC = "worker_diagnostic"
WORKER_CONTEXTUAL = "worker_contextual"
WORKER_REMEDIATION = "worker_remediation"

# Specialist node names (receive thread_id/actor_id/session_id injected from state)
SPECIALIST_NODES = {WORKER_DIAGNOSTIC, WORKER_CONTEXTUAL, WORKER_REMEDIATION}

# Max messages to include in supervisor context for multi-turn chat (older messages truncated)
_SUPERVISOR_MESSAGE_WINDOW = 20

SUPERVISOR_SYSTEM = """You are the supervisor for a Root Cause Analysis (RCA) agent. You can either respond directly to the user (normal chat) or dispatch specialist workers when analysis is needed.

CRITICAL: Use "respond" only (no workers) when the user message is any of:
- Greetings: "Hello", "Hi", "Hey"
- Capability / meta questions: "What can you do?", "What do you do?", "How can you help?", "What are your capabilities?", "What is this?"
- General explanations: "What is a stockout?", "What is RCA?", "Explain root cause analysis"
- Chit-chat, thanks, or anything that does not include a concrete analysis task
Do NOT call any workers for these. Reply with {"respond": "..."} only.

Use workers ONLY when the user gives a concrete analysis task, e.g.: "find root cause", "why did revenue drop", "diagnose stockout", "decompose revenue", "suggest remediation for X", "verify whether hypothesis Y holds".

For concrete analysis tasks (e.g. "why did revenue drop?"), run a multi-step flow: first worker_hypothesize, then worker_verify to gather evidence (and worker_diagnostic at most once when sheet_url is provided and specialist results are still 0). Once you have hypotheses, evidence, and any diagnostic result, call worker_summarize, then use {"done": true} or {"respond": "<final summary>"}. Do NOT call worker_diagnostic repeatedly — if "Specialist results so far" > 0, proceed to worker_summarize or respond. Do NOT use {"respond": "..."} only to say "I've generated a hypothesis, hold on" — that is an intermediate step; either call more workers or respond with the actual findings.

When in doubt, prefer {"respond": "..."}. Only use "sends" when the user has clearly asked for analysis (hypotheses, verification, summary, decomposition, context, or remediation) on a specific situation.

Available workers (use only when user has given a concrete RCA/analysis task):
- worker_hypothesize: Generates hypotheses from the current context/messages. Call when you need possible root causes.
- worker_verify: Runs data verification (queries, search). Call with one or more tasks to verify hypotheses in parallel.
- worker_summarize: Produces final RCA summary, confidence, and recommendations from hypotheses and evidence. Call when hypotheses are verified and you are ready to conclude.
- worker_diagnostic: External specialist — decomposes revenue/metrics, ranks drivers, segment breakdowns. When the state says "User provided Google Sheet URL: yes" and "Specialist results so far: 0", call worker_diagnostic once to analyze that sheet. Do NOT call worker_diagnostic again if "Specialist results so far" is already > 0; call worker_summarize or respond instead. Use also when user asks for decomposition, contribution analysis, or KPI drill-down (once per analysis).
- worker_contextual: External specialist — gathers external or contextual information (market context, live data). Use when you need outside context to interpret the situation.
- worker_remediation: External specialist — maps root causes to actions, prioritizes, suggests remediation. Use after hypotheses/evidence or when user asks for actions; you may include root_causes from state in the payload.

You must respond with ONLY a valid JSON object, no other text. Use exactly one of these shapes:

1. To reply directly to the user (normal chat, no workers): {"respond": "<your full message to the user>"}

2. To finish without adding a new message (e.g. workers already replied): {"done": true}

3. To call one or more workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples (respond only — no workers):
- "Hello" -> {"respond": "Hi! I'm your RCA assistant. I can help with root cause analysis (e.g. revenue drops, stockouts) or answer questions. What would you like to do?"}
- "What can you do?" -> {"respond": "I can help with root cause analysis: generate hypotheses, verify data, summarize findings, decompose metrics, gather market context, and suggest remediation actions. Ask me to analyze a specific situation (e.g. why did revenue drop) to get started."}
- "What is a stockout?" -> {"respond": "A stockout is when you run out of inventory for a product, so you can't fulfill demand. It often leads to lost sales and can signal supply or demand issues. I can help analyze stockout impact if you have data."}

Examples (use workers — concrete analysis task only):
- For "why did revenue drop?" start with: {"sends": [{"node": "worker_hypothesize", "payload": {"task": "Generate hypotheses for the revenue drop from the user request and context"}}]}. After hypotheses are in state, call worker_verify (and optionally worker_diagnostic if sheet/data is available), then worker_summarize; only then {"done": true} or {"respond": "<summary>"}.
- "Revenue dropped 20% WoW, find root cause" -> first {"sends": [{"node": "worker_hypothesize", "payload": {"task": "Generate hypotheses from the user request and context"}}]}; next turn send to worker_verify and/or worker_diagnostic, then worker_summarize.
- Verify two hypotheses in parallel: {"sends": [{"node": "worker_verify", "payload": {"hypothesis": "Stockout in region X", "query": "..."}}, {"node": "worker_verify", "payload": {"hypothesis": "Demand spike", "query": "..."}}]}
- Final step (after hypotheses and evidence): {"sends": [{"node": "worker_summarize", "payload": {"task": "Summarize RCA and recommend actions"}}]}
- Decompose revenue: {"sends": [{"node": "worker_diagnostic", "payload": {"task": "Decompose revenue drop WoW and rank drivers"}}]}
- Get market context: {"sends": [{"node": "worker_contextual", "payload": {"task": "Gather market context for North India demand"}}]}
- Suggest remediation: {"sends": [{"node": "worker_remediation", "payload": {"task": "Suggest remediation for stockout-led revenue drop", "root_causes": ["Stockout in region X"]}}]}

Valid node names: worker_hypothesize, worker_verify, worker_summarize, worker_diagnostic, worker_contextual, worker_remediation.
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

    def supervisor_node(state: RCAGraphState) -> dict[str, Any]:
        messages = state.get("messages") or []
        hypotheses = state.get("hypotheses") or []
        evidence = state.get("evidence") or []
        reasoning_log = state.get("reasoning_log") or []
        specialist_results = state.get("specialist_results") or []
        sheet_url = (state.get("sheet_url") or "").strip()
        # Conversation history for multi-turn chat (last N messages)
        window = messages[-_SUPERVISOR_MESSAGE_WINDOW:] if len(messages) > _SUPERVISOR_MESSAGE_WINDOW else messages
        conv_lines = []
        for m in window:
            role = getattr(m, "type", "unknown")
            text = (getattr(m, "content", None) or str(m))[:800]
            conv_lines.append(f"[{role}]: {text}")
        conversation_block = "\n".join(conv_lines) if conv_lines else "(no messages yet)"
        prompt_parts = [
            "Current state:",
            f"- Hypotheses so far: {len(hypotheses)}",
            f"- Evidence items: {len(evidence)}",
            f"- Reasoning log entries: {len(reasoning_log)}",
            f"- Specialist results so far: {len(specialist_results)} (if > 0, do NOT call worker_diagnostic again; call worker_summarize or respond).",
            "- User provided Google Sheet URL for data-backed analysis: yes (call worker_diagnostic once to analyze the sheet)." if sheet_url else "- User provided Google Sheet URL: no",
            "",
            "Conversation (last messages):",
            conversation_block,
            "",
            "Decide: reply directly (respond), finish (done), or call workers (sends). Reply with JSON only.",
        ]

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

        if decision.get("respond"):
            _logger.info("supervisor decision: respond (len=%d)", len(decision.get("respond", "")))
        elif decision.get("done"):
            _logger.info("supervisor decision: done")
        elif decision.get("sends"):
            _logger.info("supervisor decision: sends nodes=%s", [s.get("node") for s in decision.get("sends", [])])

        # Direct reply to user (normal chat)
        if decision.get("respond"):
            reply_text = decision.get("respond", "").strip()
            if not reply_text:
                return {"supervisor_decision": {"done": True}}
            return {
                "messages": [AIMessage(content=reply_text)],
                "supervisor_decision": {"done": True},
            }
        if decision.get("done"):
            return {"supervisor_decision": {"done": True}}
        sends = decision.get("sends") or []
        if not sends:
            return {"supervisor_decision": {"done": True}}
        return {"supervisor_decision": {"sends": sends}}

    return supervisor_node


def _run_worker_agent(llm: Any, tools: list[Any], system_prompt: str, task_message: str) -> str:
    # Bind tools directly to the LLM
    llm_with_tools = llm.bind_tools(tools)
    
    messages = [
        SystemMessage(content=system_prompt + " Respond ONLY with a tool call or a final answer."),
        HumanMessage(content=task_message),
    ]
    
    # This avoids the complex ReAct loop inside the node
    response = llm_with_tools.invoke(messages)
    return response.content


def make_worker_hypothesize(llm: Any) -> Any:
    """Worker: generate hypotheses. No tools (Option B)."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        task = payload.get("task", "Generate possible root causes from the context.")
        system = "You are a specialist that generates hypotheses for root cause analysis. Output clear, testable hypotheses. Be concise."
        content = _run_worker_agent(llm, [], system, task)
        hypothesis_entries = [{"text": content, "source": "worker_hypothesize"}]
        log_entries = [{"phase": "hypothesize", "output": content[:500]}]
        return {
            "hypotheses": hypothesis_entries,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "hypothesize",
        }

    return node


def make_worker_verify(llm: Any, tools: list[Any]) -> Any:
    """Worker: verify hypotheses using tools (MCP/query/search)."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        hypothesis = payload.get("hypothesis", "")
        query = payload.get("query", payload.get("task", "Gather evidence for this hypothesis."))
        _logger.info("worker_verify running tools_count=%d hypothesis_len=%d", len(tools), len(hypothesis))
        system = "You are a specialist that verifies hypotheses using the provided tools. Use tools to fetch data. Summarize evidence found."
        task_message = f"Hypothesis: {hypothesis}\n\nTask: {query}"
        content = _run_worker_agent(llm, tools, system, task_message)
        evidence_entries = [{"hypothesis": hypothesis, "finding": content, "source": "worker_verify"}]
        log_entries = [{"phase": "verify", "hypothesis": hypothesis[:200], "output": content[:500]}]
        return {
            "evidence": evidence_entries,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "verify",
        }

    return node


def make_worker_summarize(llm: Any) -> Any:
    """Worker: produce RCA summary and recommendations. No tools."""

    def node(payload: dict[str, Any]) -> dict[str, Any]:
        task = payload.get("task", "Summarize the root cause analysis and recommend actions.")
        system = "You are a specialist that summarizes RCA: state root cause(s), confidence (0-1), and actionable recommendations. Be concise and evidence-based."
        content = _run_worker_agent(llm, [], system, task)
        rec_entries = [{"text": content, "source": "worker_summarize"}]
        log_entries = [{"phase": "summarize", "output": content[:500]}]
        return {
            "recommendations": rec_entries,
            "reasoning_log": log_entries,
            "messages": [AIMessage(content=content)],
            "current_phase": "summarize",
        }

    return node


def _specialist_payload_and_session(payload: dict[str, Any], agent_key: str) -> tuple[dict[str, Any], str | None, str]:
    """Build invoke payload and session info from node payload (thread_id/actor_id/session_id injected by graph)."""
    prompt = payload.get("prompt") or payload.get("task") or ""
    thread_id = payload.get("thread_id") or "default-session"
    actor_id = payload.get("actor_id") or "default-actor"
    session_id = payload.get("session_id")
    invoke_payload = {"prompt": prompt, "thread_id": thread_id[:100], "actor_id": actor_id}
    fallback_suffix = f"{thread_id}_{actor_id}_{agent_key}"
    return invoke_payload, session_id, fallback_suffix


def _format_specialist_response(agent_key: str, response: dict[str, Any]) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    """Extract message text, specialist_result entry, and optional evidence/recommendations from specialist response."""
    err = response.get("error")
    if err:
        msg = f"[{agent_key}] Error: {err}"
        return msg, {"agent": agent_key, "error": err, "response": None}, [{"phase": agent_key, "error": err}]
    result_text = response.get("result") or (response.get("response", {}).get("result") if isinstance(response.get("response"), dict) else None) or str(response)[:500]
    if isinstance(result_text, dict):
        result_text = result_text.get("result", str(result_text))[:500]
    specialist_entry = {"agent": agent_key, "response": response}
    log_entries = [{"phase": agent_key, "output": (result_text or "")[:500]}]
    return result_text or "(no result)", specialist_entry, log_entries


async def _run_specialist_node(
    agent_key: str,
    runtime_arn: str | None,
    payload: dict[str, Any],
    extra_invoke_keys: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call specialist via AgentCore; return state update. No-op if runtime_arn is missing."""
    from ..agentcore_invoke import invoke_specialist

    if not runtime_arn:
        _logger.warning("specialist node %s: no runtime ARN, skipping", agent_key)
        return {"messages": [AIMessage(content=f"[{agent_key}] Not configured (missing runtime ARN).")]}
    region = os.getenv("AWS_REGION", "eu-west-2")
    qualifier = os.getenv("AGENTCORE_QUALIFIER") or None
    invoke_payload, session_id, fallback_suffix = _specialist_payload_and_session(payload, agent_key)
    if extra_invoke_keys:
        invoke_payload.update(extra_invoke_keys)
    _logger.info("specialist node %s: invoking runtime prompt_len=%d keys=%s", agent_key, len(invoke_payload.get("prompt", "")), list(invoke_payload.keys()))
    response = await invoke_specialist(runtime_arn, invoke_payload, session_id, region, qualifier, fallback_suffix)
    has_error = "error" in response and response.get("error")
    if has_error:
        _logger.warning("specialist node %s: error %s", agent_key, response.get("error", "")[:200])
    else:
        _logger.info("specialist node %s: success result_len=%d", agent_key, len(str(response.get("result", ""))))
    msg_text, specialist_entry, log_entries = _format_specialist_response(agent_key, response)
    return {
        "messages": [AIMessage(content=msg_text)],
        "reasoning_log": log_entries,
        "specialist_results": [specialist_entry],
        "current_phase": agent_key,
    }


def make_worker_diagnostic() -> Any:
    """Worker: invoke DiagnosticAnalyst runtime (decompose, rank drivers, segment breakdowns). No-op if ARN unset."""

    async def node(payload: dict[str, Any]) -> dict[str, Any]:
        arn = os.getenv("DIAGNOSTIC_ANALYST_RUNTIME_ARN")
        extra = {}
        if payload.get("sheet_url"):
            extra["sheet_url"] = payload["sheet_url"]
        return await _run_specialist_node("diagnostic", arn, payload, extra)

    return node


def make_worker_contextual() -> Any:
    """Worker: invoke ContextualScout runtime (external/contextual info). No-op if ARN unset."""

    async def node(payload: dict[str, Any]) -> dict[str, Any]:
        arn = os.getenv("CONTEXTUAL_SCOUT_RUNTIME_ARN")
        return await _run_specialist_node("contextual", arn, payload)

    return node


def make_worker_remediation() -> Any:
    """Worker: invoke RemediationStrategist runtime (actions, prioritization). No-op if ARN unset."""

    async def node(payload: dict[str, Any]) -> dict[str, Any]:
        arn = os.getenv("REMEDIATION_STRATEGIST_RUNTIME_ARN")
        extra = {}
        if payload.get("root_causes"):
            extra["root_causes"] = payload["root_causes"]
        result = await _run_specialist_node("remediation", arn, payload, extra)
        # Optionally merge remediation result into recommendations for supervisor
        resp = result.get("specialist_results") or []
        if resp and resp[0].get("response") and not resp[0].get("error"):
            rec_text = (resp[0]["response"].get("result") or "")[:1000]
            if rec_text:
                result["recommendations"] = result.get("recommendations") or []
                result["recommendations"].append({"text": rec_text, "source": "worker_remediation"})
        return result

    return node
