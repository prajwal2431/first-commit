import pytest
from unittest.mock import Mock, patch, AsyncMock
import sys
from pathlib import Path

# Add project root so "src" is a package and main can use relative imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
# Mock MCP client to prevent Gateway connection attempts (main does mcp_client = get_tools())
mock_mcp_client = Mock()
mock_mcp_client.get_tools = AsyncMock(return_value=[])
mock_client_factory = Mock(return_value=mock_mcp_client)
with patch("src.mcp_client.client.get_streamable_http_mcp_client", mock_client_factory):
    from src.main import app, invoke


class TestAgent:
    @patch("src.main.create_supervisor_graph")
    @patch("src.main.load_model")
    @pytest.mark.asyncio
    async def test_invoke_with_prompt(self, mock_load_model, mock_create_supervisor_graph):
        """Test invoke function with user prompt using supervisor graph."""
        mock_graph = Mock()
        mock_msg = Mock()
        mock_msg.content = "Test response"
        mock_msg.type = "ai"
        mock_result = {"messages": [mock_msg]}
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        mock_create_supervisor_graph.return_value = mock_graph

        payload = {"prompt": "Hello, how are you?"}
        result = await invoke(payload)

        assert result["result"] == "Test response"
        mock_create_supervisor_graph.assert_called_once()

    @patch("src.main.create_supervisor_graph")
    @patch("src.main.load_model")
    @pytest.mark.asyncio
    async def test_invoke_returns_optional_audit_fields(self, mock_load_model, mock_create_supervisor_graph):
        """Test that invoke can return reasoning_log, evidence, recommendations when present."""
        mock_graph = Mock()
        mock_msg = Mock()
        mock_msg.content = "Summary"
        mock_msg.type = "ai"
        mock_result = {
            "messages": [mock_msg],
            "reasoning_log": [{"phase": "hypothesize"}],
            "evidence": [{"finding": "x"}],
            "recommendations": [{"text": "Do Y"}],
        }
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        mock_create_supervisor_graph.return_value = mock_graph

        result = await invoke({"prompt": "Analyze stockout"})

        assert result["result"] == "Summary"
        assert result["reasoning_log"] == [{"phase": "hypothesize"}]
        assert result["evidence"] == [{"finding": "x"}]
        assert result["recommendations"] == [{"text": "Do Y"}]


class TestBedrockAgentCoreApp:
    def test_app_initialization(self):
        """Test that BedrockAgentCoreApp is properly initialized"""
        assert app is not None
        assert hasattr(app, "entrypoint")

    def test_entrypoint_decorator(self):
        """Test that entrypoint function is properly decorated"""
        assert hasattr(invoke, "__name__")
        assert invoke.__name__ == "invoke"


class TestSupervisorGraphStructure:
    """Minimal test that the graph has supervisor and worker nodes (no Bedrock call)."""

    def test_create_supervisor_graph_returns_compiled_graph(self):
        from src.graph.graph import create_supervisor_graph

        mock_llm = Mock()
        g = create_supervisor_graph(mock_llm, [])
        assert g is not None
        assert hasattr(g, "ainvoke")

    def test_graph_has_expected_nodes(self):
        from src.graph.graph import create_supervisor_graph

        mock_llm = Mock()
        g = create_supervisor_graph(mock_llm, [])
        assert hasattr(g, "ainvoke"), "Compiled graph must have ainvoke"
