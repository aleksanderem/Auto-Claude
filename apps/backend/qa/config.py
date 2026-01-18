"""
QA Configuration Management
============================

Handles per-spec QA configuration including:
- Login credentials for E2E testing
- Dev server configuration
- Human-provided inputs that persist across QA iterations

This enables QA to:
1. Detect when it needs human input (credentials, server config)
2. Escalate clearly to human with specific requests
3. Resume testing once human provides input
4. Reuse configuration across all future QA iterations for the spec
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict

from debug import debug, debug_error, debug_success, debug_warning

# =============================================================================
# TYPE DEFINITIONS
# =============================================================================


class LoginCredentials(TypedDict, total=False):
    """Login credentials for E2E testing."""

    username: str
    password: str
    provided_by_human: bool
    provided_at: str  # ISO timestamp
    login_url: str  # Optional: specific login URL if not auto-detected


class DevServerConfig(TypedDict, total=False):
    """Dev server configuration."""

    start_command: str  # e.g., "npm run dev", "python manage.py runserver"
    base_url: str  # e.g., "http://localhost:3000"
    health_check_url: str  # e.g., "http://localhost:3000/api/health"
    startup_timeout_seconds: int  # How long to wait for server to be ready
    provided_by_human: bool
    provided_at: str


class HumanApprovals(TypedDict, total=False):
    """Human-approved exceptions and overrides."""

    skip_flaky_tests: list[str]  # Test names to skip
    known_acceptable_warnings: list[str]  # Console warnings that are OK
    skip_accessibility_checks: bool
    custom_notes: str


class QAConfig(TypedDict, total=False):
    """Full QA configuration for a spec."""

    version: str  # Schema version for migrations
    spec_id: str
    created_at: str
    last_updated: str

    # Core configs that often need human input
    credentials: dict[str, LoginCredentials]  # Keyed by context (e.g., "admin", "user")
    dev_server: DevServerConfig

    # Human approvals and overrides
    human_approvals: HumanApprovals

    # Test configuration
    test_config: dict[str, Any]  # Flexible for project-specific settings


# =============================================================================
# CONSTANTS
# =============================================================================

QA_CONFIG_FILENAME = "qa_config.json"
QA_CONFIG_VERSION = "1.0"

# Default dev server patterns by project type
DEFAULT_DEV_SERVERS = {
    "next": {"start_command": "npm run dev", "base_url": "http://localhost:3000"},
    "vite": {"start_command": "npm run dev", "base_url": "http://localhost:5173"},
    "react": {"start_command": "npm start", "base_url": "http://localhost:3000"},
    "django": {
        "start_command": "python manage.py runserver",
        "base_url": "http://localhost:8000",
    },
    "flask": {"start_command": "flask run", "base_url": "http://localhost:5000"},
    "fastapi": {
        "start_command": "uvicorn main:app --reload",
        "base_url": "http://localhost:8000",
    },
    "rails": {"start_command": "rails server", "base_url": "http://localhost:3000"},
    "electron": {
        "start_command": "npm run dev",
        "base_url": "http://localhost:5173",
    },  # Vite for renderer
}


# =============================================================================
# LOAD / SAVE
# =============================================================================


def get_qa_config_path(spec_dir: Path) -> Path:
    """Get the path to qa_config.json for a spec."""
    return spec_dir / QA_CONFIG_FILENAME


def load_qa_config(spec_dir: Path) -> QAConfig | None:
    """
    Load QA configuration for a spec.

    Returns None if file doesn't exist (not an error - just not configured yet).
    """
    config_path = get_qa_config_path(spec_dir)

    if not config_path.exists():
        debug("qa_config", "No qa_config.json found", spec_dir=str(spec_dir))
        return None

    try:
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)

        debug_success(
            "qa_config",
            "Loaded qa_config.json",
            has_credentials=bool(config.get("credentials")),
            has_dev_server=bool(config.get("dev_server")),
        )
        return config

    except json.JSONDecodeError as e:
        debug_error("qa_config", f"Invalid JSON in qa_config.json: {e}")
        return None
    except Exception as e:
        debug_error("qa_config", f"Failed to load qa_config.json: {e}")
        return None


def save_qa_config(spec_dir: Path, config: QAConfig) -> bool:
    """
    Save QA configuration for a spec.

    Updates last_updated timestamp automatically.
    """
    config_path = get_qa_config_path(spec_dir)

    # Update metadata
    config["version"] = QA_CONFIG_VERSION
    config["last_updated"] = datetime.now(timezone.utc).isoformat()

    if "created_at" not in config:
        config["created_at"] = config["last_updated"]

    try:
        # Ensure directory exists
        config_path.parent.mkdir(parents=True, exist_ok=True)

        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        debug_success("qa_config", "Saved qa_config.json", path=str(config_path))
        return True

    except Exception as e:
        debug_error("qa_config", f"Failed to save qa_config.json: {e}")
        return False


def create_default_qa_config(spec_dir: Path, spec_id: str) -> QAConfig:
    """
    Create a default QA config structure.

    This is NOT saved automatically - just creates the structure.
    Human needs to fill in credentials/server config.
    """
    return QAConfig(
        version=QA_CONFIG_VERSION,
        spec_id=spec_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        last_updated=datetime.now(timezone.utc).isoformat(),
        credentials={},
        dev_server={},
        human_approvals={},
        test_config={},
    )


# =============================================================================
# CREDENTIAL MANAGEMENT
# =============================================================================


def get_login_credentials(
    spec_dir: Path, context: str = "default"
) -> LoginCredentials | None:
    """
    Get login credentials for a specific context.

    Args:
        spec_dir: Spec directory
        context: Credential context (e.g., "admin", "user", "default")

    Returns:
        Credentials dict or None if not configured
    """
    config = load_qa_config(spec_dir)
    if not config:
        return None

    credentials = config.get("credentials", {})
    return credentials.get(context) or credentials.get("default")


def set_login_credentials(
    spec_dir: Path,
    username: str,
    password: str,
    context: str = "default",
    login_url: str | None = None,
) -> bool:
    """
    Set login credentials (typically called after human provides them).
    """
    config = load_qa_config(spec_dir) or create_default_qa_config(
        spec_dir, spec_dir.name
    )

    if "credentials" not in config:
        config["credentials"] = {}

    config["credentials"][context] = LoginCredentials(
        username=username,
        password=password,
        provided_by_human=True,
        provided_at=datetime.now(timezone.utc).isoformat(),
    )

    if login_url:
        config["credentials"][context]["login_url"] = login_url

    return save_qa_config(spec_dir, config)


def has_login_credentials(spec_dir: Path, context: str = "default") -> bool:
    """Check if login credentials are configured."""
    creds = get_login_credentials(spec_dir, context)
    return bool(creds and creds.get("username") and creds.get("password"))


# =============================================================================
# DEV SERVER MANAGEMENT
# =============================================================================


def get_dev_server_config(spec_dir: Path) -> DevServerConfig | None:
    """Get dev server configuration."""
    config = load_qa_config(spec_dir)
    if not config:
        return None
    return config.get("dev_server")


def set_dev_server_config(
    spec_dir: Path,
    start_command: str,
    base_url: str,
    health_check_url: str | None = None,
    startup_timeout: int = 30,
) -> bool:
    """Set dev server configuration."""
    config = load_qa_config(spec_dir) or create_default_qa_config(
        spec_dir, spec_dir.name
    )

    config["dev_server"] = DevServerConfig(
        start_command=start_command,
        base_url=base_url,
        health_check_url=health_check_url or f"{base_url.rstrip('/')}/",
        startup_timeout_seconds=startup_timeout,
        provided_by_human=True,
        provided_at=datetime.now(timezone.utc).isoformat(),
    )

    return save_qa_config(spec_dir, config)


def has_dev_server_config(spec_dir: Path) -> bool:
    """Check if dev server is configured."""
    config = get_dev_server_config(spec_dir)
    return bool(config and config.get("start_command") and config.get("base_url"))


def guess_dev_server_config(project_dir: Path) -> DevServerConfig | None:
    """
    Try to guess dev server configuration from project structure.

    Returns best guess or None if can't determine.
    """
    # Check package.json for common scripts
    package_json = project_dir / "package.json"
    if package_json.exists():
        try:
            with open(package_json) as f:
                pkg = json.load(f)

            scripts = pkg.get("scripts", {})
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

            # Detect framework
            if "next" in deps:
                return DEFAULT_DEV_SERVERS["next"].copy()
            elif "vite" in deps:
                return DEFAULT_DEV_SERVERS["vite"].copy()
            elif "react-scripts" in deps:
                return DEFAULT_DEV_SERVERS["react"].copy()
            elif "electron" in deps:
                return DEFAULT_DEV_SERVERS["electron"].copy()
            elif "dev" in scripts:
                # Generic - has dev script
                return DevServerConfig(
                    start_command="npm run dev",
                    base_url="http://localhost:3000",  # Common default
                )

        except Exception:
            pass

    # Check for Python projects
    if (project_dir / "manage.py").exists():
        return DEFAULT_DEV_SERVERS["django"].copy()

    if (project_dir / "app.py").exists() or (project_dir / "wsgi.py").exists():
        return DEFAULT_DEV_SERVERS["flask"].copy()

    if (project_dir / "main.py").exists():
        # Could be FastAPI
        main_content = (project_dir / "main.py").read_text()
        if "fastapi" in main_content.lower():
            return DEFAULT_DEV_SERVERS["fastapi"].copy()

    # Check for Rails
    if (project_dir / "Gemfile").exists():
        gemfile = (project_dir / "Gemfile").read_text()
        if "rails" in gemfile.lower():
            return DEFAULT_DEV_SERVERS["rails"].copy()

    debug_warning("qa_config", "Could not auto-detect dev server configuration")
    return None


# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================


class PrerequisiteResult(TypedDict):
    """Result of prerequisite check."""

    can_proceed: bool
    blocker_type: (
        str | None
    )  # "NEED_CREDENTIALS", "NEED_DEV_SERVER", "BLOCKER_UNRESOLVED"
    blocker_details: str | None
    suggestions: list[str]


def check_qa_prerequisites(
    spec_dir: Path,
    project_dir: Path,
    requires_login: bool = False,
    requires_dev_server: bool = True,
) -> PrerequisiteResult:
    """
    Check if QA can proceed or needs human input.

    This is the main gate that prevents QA from running blindly.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        requires_login: Whether this spec needs login credentials
        requires_dev_server: Whether E2E tests need a dev server

    Returns:
        PrerequisiteResult with can_proceed flag and blocker details
    """
    debug(
        "qa_config",
        "Checking QA prerequisites",
        spec_dir=str(spec_dir),
        requires_login=requires_login,
        requires_dev_server=requires_dev_server,
    )

    config = load_qa_config(spec_dir)
    suggestions = []

    # Check 1: Dev server configuration
    if requires_dev_server:
        if not has_dev_server_config(spec_dir):
            # Try to auto-detect
            guessed = guess_dev_server_config(project_dir)

            if guessed:
                suggestions.append(
                    f"Auto-detected dev server: {guessed.get('start_command')} at {guessed.get('base_url')}"
                )
                suggestions.append("Confirm or modify in qa_config.json")

            debug_warning("qa_config", "Dev server not configured")
            return PrerequisiteResult(
                can_proceed=False,
                blocker_type="NEED_DEV_SERVER",
                blocker_details="E2E tests need to know how to start and access the dev server",
                suggestions=suggestions
                or [
                    "Provide start_command (e.g., 'npm run dev')",
                    "Provide base_url (e.g., 'http://localhost:3000')",
                ],
            )

    # Check 2: Login credentials (if required)
    if requires_login:
        if not has_login_credentials(spec_dir):
            debug_warning("qa_config", "Login credentials not configured")
            return PrerequisiteResult(
                can_proceed=False,
                blocker_type="NEED_CREDENTIALS",
                blocker_details="E2E tests need login credentials to authenticate",
                suggestions=[
                    "Provide test username",
                    "Provide test password",
                    "Optionally provide login URL if not standard",
                ],
            )

    # Check 3: Unresolved blockers from previous iterations
    # TODO: Check qa_iterations.json for unresolved blockers

    debug_success("qa_config", "All prerequisites met")
    return PrerequisiteResult(
        can_proceed=True, blocker_type=None, blocker_details=None, suggestions=[]
    )


def detect_login_requirement(spec_dir: Path, project_dir: Path) -> bool:
    """
    Detect if E2E tests will likely need login credentials.

    Checks:
    - spec.md for authentication-related acceptance criteria
    - Test files for login-related selectors
    - Project structure for auth-related files
    """
    # Check spec.md
    spec_file = spec_dir / "spec.md"
    if spec_file.exists():
        content = spec_file.read_text().lower()
        auth_terms = [
            "login",
            "authentication",
            "sign in",
            "sign-in",
            "log in",
            "credentials",
            "password",
            "username",
            "email",
            "auth",
        ]
        if any(term in content for term in auth_terms):
            debug("qa_config", "Login requirement detected from spec.md")
            return True

    # Check for auth-related files in project
    auth_file_patterns = [
        "auth",
        "login",
        "signin",
        "authentication",
        "middleware/auth",
        "guards/auth",
        "hooks/useAuth",
    ]

    for pattern in auth_file_patterns:
        matches = list(project_dir.rglob(f"*{pattern}*"))
        # Filter out node_modules, .git, etc.
        matches = [
            m
            for m in matches
            if not any(
                skip in str(m)
                for skip in ["node_modules", ".git", "__pycache__", "venv"]
            )
        ]
        if matches:
            debug("qa_config", f"Login requirement detected from file: {matches[0]}")
            return True

    return False
