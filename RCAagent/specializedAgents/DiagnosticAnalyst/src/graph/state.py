"""
Shared state schema for the Diagnostic Analyst supervisor graph.
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


class DiagnosticGraphState(TypedDict, total=False):
    """State for the Diagnostic Analyst supervisor graph. All list fields use reducers for parallel merge."""

    messages: Annotated[list[BaseMessage], _messages_reducer]
    kpi_slices: Annotated[list[dict[str, Any]], _list_reducer]
    contribution_scores: Annotated[list[dict[str, Any]], _list_reducer]
    segment_breakdowns: Annotated[list[dict[str, Any]], _list_reducer]
    data_quality_gaps: Annotated[list[dict[str, Any]], _list_reducer]
    evidence: Annotated[list[dict[str, Any]], _list_reducer]
    reasoning_log: Annotated[list[dict[str, Any]], _list_reducer]
    current_phase: Annotated[str, _last_str_reducer]
    # Written by supervisor; read by conditional edge. No reducer (overwrite).
    supervisor_decision: dict[str, Any]
    # Google Sheet integration: set from payload; workers pass sheet_url to query_business_data (Lambda)
    sheet_url: str
    column_mapping: dict[str, Any]
