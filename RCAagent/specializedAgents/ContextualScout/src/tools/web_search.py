"""
web_search tool: real web search via Tavily API.
Set TAVILY_API_KEY env var to enable. When missing, returns a clear
'no API key configured' response instead of fake data.
"""
import json
import os
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

_TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


def _evidence_trace(query_params: dict[str, Any], raw_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_tool": "web_search",
        "query_params": query_params,
        "raw_data": raw_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _search_tavily(query: str, max_results: int = 5) -> dict[str, Any]:
    """Run a Tavily search. Returns dict with 'results' list or 'error'."""
    if not _TAVILY_API_KEY:
        return {
            "error": "TAVILY_API_KEY not configured. Set this environment variable to enable web search.",
            "results": [],
        }
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=_TAVILY_API_KEY)
        response = client.search(query=query, max_results=max_results)
        results = []
        for r in response.get("results", []):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
                "score": r.get("score"),
            })
        return {"results": results, "query": query}
    except Exception as e:
        return {"error": str(e), "results": [], "query": query}


@tool
def web_search(
    query: str,
    max_results: int = 5,
) -> str:
    """Search the web for real-time information. Use for competitor activity, viral trends, weather disruptions,
    marketplace outages, or any external factor research. Returns JSON with search results (title, url, content, score)
    and evidence_trace. If TAVILY_API_KEY is not set, returns a clear error — never fake data."""
    query_params = {"query": query, "max_results": max_results}
    raw = _search_tavily(query, max_results)
    raw_for_trace = dict(raw)
    trace = _evidence_trace(query_params, raw_for_trace)
    raw["evidence_trace"] = trace
    return json.dumps(raw)
