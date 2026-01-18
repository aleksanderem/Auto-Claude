"""
System Health Check
===================

Comprehensive health checks for Auto Claude system components.
Validates .env configuration vs application settings vs actual runtime state.
"""

import os
import sys
from pathlib import Path
from typing import Any

# Ensure parent directory is in path for imports
_PARENT_DIR = Path(__file__).parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

# Import with fallback for missing dependencies
try:
    from core.auth import get_auth_token, get_auth_token_source
except Exception as e:
    print(f"Warning: Failed to import auth: {e}", file=sys.stderr)

    def get_auth_token():
        return None

    def get_auth_token_source():
        return None


try:
    from integrations.graphiti.config import check_graphiti_health
except Exception as e:
    print(f"Warning: Failed to import graphiti: {e}", file=sys.stderr)

    def check_graphiti_health():
        return {
            "healthy": False,
            "checks": {},
            "message": "Graphiti not available",
            "details": {},
        }


try:
    from linear_updater import is_linear_enabled
except Exception as e:
    print(f"Warning: Failed to import linear: {e}", file=sys.stderr)

    def is_linear_enabled():
        return False


def check_python_environment() -> dict[str, Any]:
    """Check Python environment is properly configured."""
    checks = {
        "python_version_ok": False,
        "venv_active": False,
        "dependencies_installed": False,
    }
    details = {}
    missing_deps = []

    # Check Python version (3.12+)
    version = sys.version_info
    checks["python_version_ok"] = version >= (3, 12)
    details["python_version"] = f"{version.major}.{version.minor}.{version.micro}"

    # Check if virtual environment is active
    checks["venv_active"] = hasattr(sys, "real_prefix") or (
        hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix
    )
    details["venv_path"] = sys.prefix if checks["venv_active"] else None

    # Check key dependencies - claude-agent-sdk is the main SDK used
    try:
        import claude_agent_sdk

        details["claude_agent_sdk_version"] = getattr(
            claude_agent_sdk, "__version__", "unknown"
        )
    except ImportError:
        missing_deps.append("claude-agent-sdk")

    checks["dependencies_installed"] = len(missing_deps) == 0
    if missing_deps:
        details["missing_dependencies"] = missing_deps

    healthy = all(checks.values())

    if not checks["python_version_ok"]:
        message = f"Python 3.12+ required (found {details['python_version']})"
    elif not checks["venv_active"]:
        message = "Virtual environment not active"
    elif missing_deps:
        message = f"Missing dependencies: {', '.join(missing_deps)}"
    else:
        message = "Python environment OK"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_git_configuration() -> dict[str, Any]:
    """Check Git is available and configured."""
    checks = {
        "git_available": False,
        "git_user_configured": False,
    }
    details = {}

    try:
        import subprocess

        # Check git is available
        result = subprocess.run(
            ["git", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            checks["git_available"] = True
            details["git_version"] = result.stdout.strip()

        # Check git user is configured
        result = subprocess.run(
            ["git", "config", "user.name"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            checks["git_user_configured"] = True
            details["git_user"] = result.stdout.strip()
    except Exception as e:
        details["error"] = str(e)

    healthy = all(checks.values())
    message = "Git configured" if healthy else "Git configuration issues"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_claude_authentication() -> dict[str, Any]:
    """Check Claude OAuth token is available."""
    checks = {
        "oauth_token_present": False,
        "token_source_identified": False,
    }
    details = {}

    token = get_auth_token()
    checks["oauth_token_present"] = bool(token)

    if token:
        source = get_auth_token_source()
        checks["token_source_identified"] = bool(source)
        details["token_source"] = source

    healthy = all(checks.values())
    message = "Claude authentication OK" if healthy else "Claude authentication missing"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_integrations() -> dict[str, Any]:
    """Check integrations - Graphiti is required, others are optional."""
    checks = {}
    details = {}
    optional_status = {}  # Optional integrations shown as status, not pass/fail

    # Graphiti memory system - REQUIRED (shows as pass/fail)
    graphiti_health = check_graphiti_health()
    checks["graphiti_configured"] = graphiti_health["checks"].get("config_valid", False)
    details["graphiti"] = graphiti_health

    # Optional integrations - just show status, don't mark as failed if disabled
    # Linear integration
    linear_enabled = is_linear_enabled()
    optional_status["linear"] = "enabled" if linear_enabled else "not configured"
    if linear_enabled:
        details["linear_api_key"] = "***" if os.getenv("LINEAR_API_KEY") else None

    # GitHub integration
    github_token = os.getenv("GITHUB_TOKEN")
    optional_status["github"] = "enabled" if github_token else "not configured"

    # GitLab integration
    gitlab_token = os.getenv("GITLAB_TOKEN")
    optional_status["gitlab"] = "enabled" if gitlab_token else "not configured"

    # Electron MCP (for E2E testing)
    electron_mcp_enabled = os.getenv("ELECTRON_MCP_ENABLED", "").lower() == "true"
    optional_status["electron_mcp"] = (
        "enabled" if electron_mcp_enabled else "not configured"
    )
    if electron_mcp_enabled:
        details["electron_debug_port"] = os.getenv("ELECTRON_DEBUG_PORT", "9222")

    details["optional_integrations"] = optional_status

    # Health based only on required integrations (Graphiti)
    healthy = all(checks.values())

    if healthy:
        message = "Graphiti configured"
    else:
        message = "Graphiti not configured"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_environment_consistency() -> dict[str, Any]:
    """
    Check that .env file exists and is readable.

    Note: We don't compare .env values with runtime because the health check runs
    as a subprocess that doesn't inherit the backend's loaded .env values.
    Actual configuration validation happens in the respective checks (Graphiti, Auth, etc.)
    """
    checks = {
        "env_file_exists": False,
    }
    details = {}

    # Find .env file
    backend_dir = Path(__file__).parent
    env_file = backend_dir / ".env"

    if env_file.exists():
        checks["env_file_exists"] = True
        details["env_file_path"] = str(env_file)

        # Count configured variables (informational only)
        try:
            from dotenv import dotenv_values

            env_values = dotenv_values(env_file)
            # Filter out empty values
            configured_vars = [k for k, v in env_values.items() if v]
            details["configured_variables"] = len(configured_vars)
        except Exception as e:
            details["parse_error"] = str(e)
    else:
        details["env_file_path"] = "Not found (optional)"

    # .env is optional - not having it is not a failure
    healthy = True
    message = (
        f".env found ({details.get('configured_variables', 0)} vars)"
        if checks["env_file_exists"]
        else ".env not found (optional)"
    )

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def run_system_health_check() -> dict[str, Any]:
    """
    Run comprehensive system health check.

    Returns:
        Dict with overall health status and individual component results:
        {
            "healthy": bool,
            "timestamp": str,
            "checks": {
                "python": {...},
                "git": {...},
                "claude_auth": {...},
                "integrations": {...},
                "environment": {...},
            },
            "summary": {
                "total_checks": int,
                "passed": int,
                "failed": int,
            }
        }
    """
    from datetime import datetime

    # Run all checks
    results = {
        "python": check_python_environment(),
        "git": check_git_configuration(),
        "claude_auth": check_claude_authentication(),
        "integrations": check_integrations(),
        "environment": check_environment_consistency(),
    }

    # Calculate summary
    total_checks = len(results)
    passed = sum(1 for r in results.values() if r["healthy"])
    failed = total_checks - passed

    overall_healthy = all(r["healthy"] for r in results.values())

    return {
        "healthy": overall_healthy,
        "timestamp": datetime.now().isoformat(),
        "checks": results,
        "summary": {
            "total_checks": total_checks,
            "passed": passed,
            "failed": failed,
        },
    }
