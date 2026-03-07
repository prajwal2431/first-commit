"""
Shared state schema for the supervisor graph and worker nodes.
Uses Annotated reducers so parallel worker outputs merge correctly.
"""
from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage


def _messages_reducer(left: list[BaseMessage], right: list[BaseMessage] | BaseMessage) -> list[BaseMessage]:
    """Append message(s) from worker updates to the message list."""
    if isinstance(right, list):
        return left + right
    return left + [right]


def _list_reducer(left: list[Any], right: list[Any] | Any) -> list[Any]:
    """Append list items or a single item from worker updates."""
    if isinstance(right, list):
        return left + right
    if right is None:
        return left
    return left + [right]


def _last_str_reducer(left: str | None, right: str | None) -> str:
    """Last write wins: when parallel workers all write current_phase, keep the last one."""
    if right is not None and right != "":
        return right
    return left or ""


class RCAGraphState(TypedDict, total=False):
    """State for the RCA supervisor graph. All list fields use reducers for parallel merge."""

    messages: Annotated[list[BaseMessage], _messages_reducer]
    hypotheses: Annotated[list[dict[str, Any]], _list_reducer]
    evidence: Annotated[list[dict[str, Any]], _list_reducer]
    recommendations: Annotated[list[dict[str, Any]], _list_reducer]
    reasoning_log: Annotated[list[dict[str, Any]], _list_reducer]
    specialist_results: Annotated[list[dict[str, Any]], _list_reducer]
    current_phase: Annotated[str, _last_str_reducer]
    # Written by supervisor; read by conditional edge. No reducer (overwrite).
    supervisor_decision: dict[str, Any]
    # Passed from entrypoint; injected into specialist payloads. No reducer (overwrite).
    thread_id: str
    actor_id: str
    session_id: str
    sheet_url: str  # Injected into worker_diagnostic payload when set (e.g. from Test UI)
