"""
Supervisor and worker nodes for the RCA graph.
Supervisor decides next step(s); workers run in parallel when the supervisor sends multiple Sends.
"""
import json
import re
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .state import RCAGraphState

# Node names used in conditional edge and add_node
WORKER_HYPOTHESIZE = "worker_hypothesize"
WORKER_VERIFY = "worker_verify"
WORKER_SUMMARIZE = "worker_summarize"

# Max messages to include in supervisor context for multi-turn chat (older messages truncated)
_SUPERVISOR_MESSAGE_WINDOW = 20

SUPERVISOR_SYSTEM = """You are the supervisor for a Root Cause Analysis (RCA) agent. You can either respond directly to the user (normal chat) or dispatch specialist workers when analysis is needed.

When the user's message is conversational (greetings, general questions, explanations, chit-chat, or anything that does not require root cause analysis or data verification), reply directly using the "respond" option. When the user clearly needs RCA (e.g. "find root cause", "why did revenue drop", "diagnose stockout"), use the workers.

Available workers (use only when RCA/analysis is required):
- worker_hypothesize: Generates hypotheses from the current context/messages. Call when you need possible root causes.
- worker_verify: Runs data verification (queries, search). Call with one or more tasks to verify hypotheses in parallel.
- worker_summarize: Produces final RCA summary, confidence, and recommendations from hypotheses and evidence. Call when hypotheses are verified and you are ready to conclude.

You must respond with ONLY a valid JSON object, no other text. Use exactly one of these shapes:

1. To reply directly to the user (normal chat, no workers): {"respond": "<your full message to the user>"}

2. To finish without adding a new message (e.g. workers already replied): {"done": true}

3. To call one or more workers: {"sends": [{"node": "<worker_name>", "payload": <object>}, ...]}

Examples:
- User says "Hello" -> {"respond": "Hi! I'm your RCA assistant. I can help with root cause analysis (e.g. revenue drops, stockouts) or answer questions. What would you like to do?"}
- User asks "What is a stockout?" -> {"respond": "A stockout is when you run out of inventory for a product, so you can't fulfill demand. It often leads to lost sales and can signal supply or demand issues. I can help analyze stockout impact if you have data."}
- User says "Revenue dropped 20% WoW, find root cause" -> {"sends": [{"node": "worker_hypothesize", "payload": {"task": "Generate hypotheses from the user request and context"}}]}
- Verify two hypotheses in parallel: {"sends": [{"node": "worker_verify", "payload": {"hypothesis": "Stockout in region X", "query": "..."}}, {"node": "worker_verify", "payload": {"hypothesis": "Demand spike", "query": "..."}}]}
- Final step: {"sends": [{"node": "worker_summarize", "payload": {"task": "Summarize RCA and recommend actions"}}]}

Valid node names: worker_hypothesize, worker_verify, worker_summarize.
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
    """Run a ReAct-style agent (create_agent) with given tools and return last message content."""
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
