"""
Ouro tools module facade.

Provides MCP tools for agent operations.
Re-exports from agents.tools_pkg for clean imports.
"""

from agents.tools_pkg.models import (  # noqa: F401
    ELECTRON_TOOLS,
    TOOL_GET_BUILD_PROGRESS,
    TOOL_GET_SESSION_CONTEXT,
    TOOL_RECORD_DISCOVERY,
    TOOL_RECORD_GOTCHA,
    TOOL_UPDATE_QA_STATUS,
    TOOL_UPDATE_SUBTASK_STATUS,
    is_electron_mcp_enabled,
)
from agents.tools_pkg.permissions import get_allowed_tools  # noqa: F401
from agents.tools_pkg.registry import (  # noqa: F401
    create_ouro_mcp_server,
    is_tools_available,
)

# Backwards compatibility alias
create_auto_claude_mcp_server = create_ouro_mcp_server

__all__ = [
    "create_ouro_mcp_server",
    "create_auto_claude_mcp_server",  # Deprecated alias
    "get_allowed_tools",
    "is_tools_available",
    "TOOL_UPDATE_SUBTASK_STATUS",
    "TOOL_GET_BUILD_PROGRESS",
    "TOOL_RECORD_DISCOVERY",
    "TOOL_RECORD_GOTCHA",
    "TOOL_GET_SESSION_CONTEXT",
    "TOOL_UPDATE_QA_STATUS",
    "ELECTRON_TOOLS",
    "is_electron_mcp_enabled",
]
