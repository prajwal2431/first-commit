"""
Invoke Bedrock AgentCore runtimes (specialist agents) via boto3 invoke_agent_runtime.
Used by RCAagent to call DiagnosticAnalyst, ContextualScout, RemediationStrategist.
"""
import asyncio
import hashlib
import json
import logging
import os
from typing import Any

import boto3

_logger = logging.getLogger(__name__)


def _ensure_session_id_33(session_id: str | None, fallback: str) -> str:
    """AgentCore requires runtimeSessionId of at least 33 characters."""
    if session_id and len(session_id) >= 33:
        return session_id[:512]  # cap length
    if session_id:
        return (session_id + "_" * (33 - len(session_id)))[:33]
    # Deterministic fallback from thread_id/actor_id/agent_key
    h = hashlib.sha256(fallback.encode()).hexdigest()[:33]
    return h if len(h) >= 33 else h + "_"


def invoke_specialist_sync(
    runtime_arn: str,
    payload_dict: dict[str, Any],
    session_id: str,
    region: str,
    qualifier: str | None = None,
) -> dict[str, Any]:
    """
    Invoke a specialist agent runtime via Bedrock AgentCore (sync).
    Returns parsed response body or {"error": str, "result": None} on failure.
    """
    try:
        _logger.info("invoke_agent_runtime arn=%s session_id_len=%d payload_keys=%s",
                     runtime_arn.split("/")[-1] if "/" in runtime_arn else runtime_arn[:50],
                     len(session_id), list(payload_dict.keys()))
        client = boto3.client("bedrock-agentcore", region_name=region)
        sid = _ensure_session_id_33(session_id, session_id or "default")
        payload = json.dumps(payload_dict)
        kwargs = {
            "agentRuntimeArn": runtime_arn,
            "runtimeSessionId": sid,
            "payload": payload,
        }
        if qualifier:
            kwargs["qualifier"] = qualifier
        response = client.invoke_agent_runtime(**kwargs)
        body = response["response"].read()
        out = json.loads(body)
        _logger.info("invoke_agent_runtime success result_key=%s", "result" if out.get("result") else "none")
        return out
    except Exception as e:
        _logger.warning("invoke_agent_runtime error %s", str(e)[:300])
        return {"error": str(e), "result": None}


async def invoke_specialist(
    runtime_arn: str,
    payload_dict: dict[str, Any],
    session_id: str | None,
    region: str,
    qualifier: str | None = None,
    fallback_session_suffix: str = "",
) -> dict[str, Any]:
    """
    Async wrapper: run invoke_specialist_sync in a thread so the graph stays non-blocking.
    session_id: from backend (same session for all agents for shared memory); must be 33+ chars.
    fallback_session_suffix: used when session_id is None to build deterministic id (e.g. thread_id_actor_id_agent_key).
    """
    sid = session_id if session_id and len(session_id) >= 33 else None
    if not sid and fallback_session_suffix:
        sid = _ensure_session_id_33(None, fallback_session_suffix)
    elif not sid:
        sid = _ensure_session_id_33(None, "default")
    return await asyncio.to_thread(
        invoke_specialist_sync,
        runtime_arn,
        payload_dict,
        sid,
        region,
        qualifier,
    )
