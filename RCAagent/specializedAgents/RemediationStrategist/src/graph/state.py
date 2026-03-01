"""
Shared state schema for the Remediation Strategist supervisor graph.
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


class RemediationGraphState(TypedDict, total=False):
    """State for the Remediation Strategist supervisor graph. All list fields use reducers for parallel merge."""

    messages: Annotated[list[BaseMessage], _messages_reducer]
    root_causes: list[Any]  # Set once from payload in main; no reducer
    remediation_actions: Annotated[list[Any], _list_reducer]
    impact_projections: Annotated[list[Any], _list_reducer]
    prioritized_actions: Annotated[list[Any], _list_reducer]
    decision_memo: dict[str, Any]  # last-write-wins (no reducer)
    evidence_traces: Annotated[list[Any], _list_reducer]
    reasoning_log: Annotated[list[Any], _list_reducer]
    requires_approval: bool  # HITL flag; overwrite (no reducer)
    current_phase: Annotated[str, _last_str_reducer]
    supervisor_decision: dict[str, Any]
