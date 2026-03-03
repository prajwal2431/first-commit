"""Patch MCP client so main can be imported without GATEWAY_URL; tools from gateway (stub names for graph)."""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _stub_tool(name: str):
    t = MagicMock()
    t.name = name
    return t


@pytest.fixture(scope="session", autouse=True)
def mock_mcp_client_for_main():
    """Patch get_streamable_http_mcp_client so src.main can load without real gateway."""
    stub_tools = [
        _stub_tool("map_remediation_action"),
        _stub_tool("simulate_impact_range"),
        _stub_tool("assess_risk_level"),
    ]
    mock_client = MagicMock()
    mock_client.get_tools = AsyncMock(return_value=stub_tools)
    with patch("src.mcp_client.client.get_streamable_http_mcp_client", return_value=mock_client):
        yield
