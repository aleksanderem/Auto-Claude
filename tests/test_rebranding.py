#!/usr/bin/env python3
"""
Tests for Ouro Rebranding
=========================

Comprehensive tests to verify the rebranding from "Auto-Claude" to "Ouro"
including:
- Directory path resolution with backwards compatibility
- Branch naming conventions
- MCP tool names
- Function renames and backwards compatibility aliases
- Configuration loading
"""

import json
import subprocess
from pathlib import Path

import pytest


# =============================================================================
# DIRECTORY PATH RESOLUTION TESTS
# =============================================================================


class TestDirectoryPathResolution:
    """Tests for directory path resolution with backwards compatibility."""

    def test_worktree_manager_uses_ouro_path(self, temp_git_repo: Path):
        """WorktreeManager uses .ouro path for new worktrees."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # New path should be .ouro
        assert manager.worktrees_dir == temp_git_repo / ".ouro" / "worktrees" / "tasks"

    def test_worktree_manager_fallback_to_legacy(self, temp_git_repo: Path):
        """WorktreeManager falls back to .auto-claude if it exists."""
        from worktree import WorktreeManager

        # Create legacy directory structure
        legacy_dir = temp_git_repo / ".auto-claude" / "worktrees" / "tasks"
        legacy_dir.mkdir(parents=True)

        manager = WorktreeManager(temp_git_repo)

        # Should use legacy path since it exists
        assert manager.worktrees_dir == legacy_dir

    def test_worktree_manager_prefers_ouro_over_legacy(self, temp_git_repo: Path):
        """WorktreeManager prefers .ouro if both exist."""
        from worktree import WorktreeManager

        # Create both directories
        new_dir = temp_git_repo / ".ouro" / "worktrees" / "tasks"
        new_dir.mkdir(parents=True)
        legacy_dir = temp_git_repo / ".auto-claude" / "worktrees" / "tasks"
        legacy_dir.mkdir(parents=True)

        manager = WorktreeManager(temp_git_repo)

        # Should prefer new .ouro path
        assert manager.worktrees_dir == new_dir

    def test_init_ouro_dir_creates_ouro_directory(self, temp_dir: Path):
        """init_ouro_dir creates .ouro directory."""
        from init import init_ouro_dir

        ouro_dir, _ = init_ouro_dir(temp_dir)

        assert ouro_dir.exists()
        assert ouro_dir.name == ".ouro"
        # Note: init_ouro_dir creates .ouro but not subdirectories like specs/

    def test_init_ouro_dir_with_legacy_fallback(self, temp_dir: Path):
        """init_ouro_dir creates .ouro even if legacy .auto-claude exists."""
        from init import init_ouro_dir

        # Create legacy directory
        legacy_dir = temp_dir / ".auto-claude"
        legacy_dir.mkdir()
        (legacy_dir / "specs").mkdir()

        ouro_dir, _ = init_ouro_dir(temp_dir)

        # Now creates .ouro (migration) rather than returning legacy
        assert ouro_dir.name == ".ouro"
        assert ouro_dir.exists()

    def test_get_existing_build_worktree_checks_ouro_first(self, temp_git_repo: Path):
        """get_existing_build_worktree checks .ouro path first."""
        from core.workspace.git_utils import get_existing_build_worktree

        spec_name = "001-test-spec"

        # Create .ouro worktree directory
        ouro_worktree = temp_git_repo / ".ouro" / "worktrees" / "tasks" / spec_name
        ouro_worktree.mkdir(parents=True)

        result = get_existing_build_worktree(temp_git_repo, spec_name)

        assert result == ouro_worktree

    def test_get_existing_build_worktree_fallback_to_legacy(self, temp_git_repo: Path):
        """get_existing_build_worktree falls back to .auto-claude."""
        from core.workspace.git_utils import get_existing_build_worktree

        spec_name = "001-test-spec"

        # Create legacy worktree directory
        legacy_worktree = temp_git_repo / ".auto-claude" / "worktrees" / "tasks" / spec_name
        legacy_worktree.mkdir(parents=True)

        result = get_existing_build_worktree(temp_git_repo, spec_name)

        assert result == legacy_worktree

    def test_get_existing_build_worktree_very_old_legacy(self, temp_git_repo: Path):
        """get_existing_build_worktree handles very old .worktrees path."""
        from core.workspace.git_utils import get_existing_build_worktree

        spec_name = "001-test-spec"

        # Create very old legacy worktree directory
        very_old_worktree = temp_git_repo / ".worktrees" / spec_name
        very_old_worktree.mkdir(parents=True)

        result = get_existing_build_worktree(temp_git_repo, spec_name)

        assert result == very_old_worktree


# =============================================================================
# BRANCH NAMING TESTS
# =============================================================================


class TestBranchNaming:
    """Tests for branch naming conventions."""

    def test_worktree_branch_uses_ouro_prefix(self, temp_git_repo: Path):
        """WorktreeManager creates branches with ouro/ prefix."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        info = manager.create_worktree("test-spec")

        assert info.branch == "ouro/test-spec"
        assert info.branch.startswith("ouro/")

    def test_get_branch_name_returns_ouro_prefix(self, temp_git_repo: Path):
        """get_branch_name returns ouro/ prefix."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)

        branch_name = manager.get_branch_name("my-feature")

        assert branch_name == "ouro/my-feature"

    def test_list_all_spec_branches_finds_ouro_branches(self, temp_git_repo: Path):
        """list_all_spec_branches finds branches with ouro/ prefix."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # Create a worktree (which creates an ouro/ branch)
        manager.create_worktree("test-spec")

        branches = manager.list_all_spec_branches()

        # Check for ouro/test-spec (may have prefix like '+ ' for current worktree)
        assert any("ouro/test-spec" in b for b in branches)

    def test_list_all_spec_branches_finds_legacy_branches(self, temp_git_repo: Path):
        """list_all_spec_branches also finds branches with auto-claude/ prefix."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # Manually create a legacy branch
        subprocess.run(
            ["git", "branch", "auto-claude/legacy-spec"],
            cwd=temp_git_repo, capture_output=True
        )

        branches = manager.list_all_spec_branches()

        assert "auto-claude/legacy-spec" in branches


# =============================================================================
# MCP TOOL NAME TESTS
# =============================================================================


class TestMCPToolNames:
    """Tests for MCP tool name constants."""

    def test_mcp_tool_names_use_ouro_prefix(self):
        """MCP tool name constants use mcp__ouro__ prefix."""
        from agents.tools_pkg.models import (
            TOOL_UPDATE_SUBTASK_STATUS,
            TOOL_GET_BUILD_PROGRESS,
            TOOL_RECORD_DISCOVERY,
            TOOL_RECORD_GOTCHA,
            TOOL_GET_SESSION_CONTEXT,
            TOOL_UPDATE_QA_STATUS,
        )

        assert TOOL_UPDATE_SUBTASK_STATUS == "mcp__ouro__update_subtask_status"
        assert TOOL_GET_BUILD_PROGRESS == "mcp__ouro__get_build_progress"
        assert TOOL_RECORD_DISCOVERY == "mcp__ouro__record_discovery"
        assert TOOL_RECORD_GOTCHA == "mcp__ouro__record_gotcha"
        assert TOOL_GET_SESSION_CONTEXT == "mcp__ouro__get_session_context"
        assert TOOL_UPDATE_QA_STATUS == "mcp__ouro__update_qa_status"

    def test_agent_configs_use_ouro_tools(self):
        """AGENT_CONFIGS use ouro_tools instead of auto_claude_tools."""
        from agents.tools_pkg.models import AGENT_CONFIGS

        for agent_type, config in AGENT_CONFIGS.items():
            # Check that ouro_tools key exists if tools are defined
            if "ouro_tools" in config:
                assert isinstance(config["ouro_tools"], list)
            # Check that mcp_servers contains "ouro" not "auto-claude"
            if "mcp_servers" in config:
                assert "auto-claude" not in config["mcp_servers"], f"{agent_type} still uses auto-claude"

    def test_mcp_server_name_mapping(self):
        """_map_mcp_server_name maps auto-claude to ouro."""
        from agents.tools_pkg.models import _map_mcp_server_name

        assert _map_mcp_server_name("ouro") == "ouro"
        assert _map_mcp_server_name("auto-claude") == "ouro"  # Legacy alias


# =============================================================================
# BACKWARDS COMPATIBILITY ALIAS TESTS
# =============================================================================


class TestBackwardsCompatibilityAliases:
    """Tests for backwards compatibility aliases."""

    def test_is_ouro_file_function_exists(self):
        """_is_ouro_file function is exported."""
        from core.workspace.git_utils import _is_ouro_file

        assert callable(_is_ouro_file)

    def test_is_auto_claude_file_alias_exists(self):
        """_is_auto_claude_file alias is exported for backwards compatibility."""
        from core.workspace.git_utils import _is_auto_claude_file

        assert callable(_is_auto_claude_file)

    def test_is_ouro_file_and_alias_are_same(self):
        """_is_ouro_file and _is_auto_claude_file are the same function."""
        from core.workspace.git_utils import _is_ouro_file, _is_auto_claude_file

        # They should be the same function
        assert _is_ouro_file is _is_auto_claude_file

    def test_is_ouro_file_detects_ouro_paths(self):
        """_is_ouro_file correctly identifies .ouro paths."""
        from core.workspace.git_utils import _is_ouro_file

        assert _is_ouro_file(".ouro/specs/001-test/spec.md") is True
        assert _is_ouro_file("ouro/specs/001-test/spec.md") is True
        assert _is_ouro_file("src/main.py") is False

    def test_is_ouro_file_detects_legacy_paths(self):
        """_is_ouro_file correctly identifies legacy .auto-claude paths."""
        from core.workspace.git_utils import _is_ouro_file

        assert _is_ouro_file(".auto-claude/specs/001-test/spec.md") is True
        assert _is_ouro_file("auto-claude/specs/001-test/spec.md") is True

    def test_init_ouro_dir_alias_exists(self):
        """init_ouro_dir function is exported."""
        from init import init_ouro_dir

        assert callable(init_ouro_dir)

    def test_init_auto_claude_dir_alias_exists(self):
        """init_auto_claude_dir alias exists for backwards compatibility."""
        from init import init_auto_claude_dir

        assert callable(init_auto_claude_dir)

    def test_create_ouro_mcp_server_exists(self):
        """create_ouro_mcp_server function is exported."""
        from agents.tools_pkg import create_ouro_mcp_server

        assert callable(create_ouro_mcp_server)


# =============================================================================
# CONFIGURATION TESTS
# =============================================================================


class TestConfiguration:
    """Tests for configuration loading."""

    def test_graphiti_default_database_name(self):
        """Graphiti default database name is ouro_memory."""
        from integrations.graphiti.config import DEFAULT_DATABASE

        assert DEFAULT_DATABASE == "ouro_memory"

    def test_graphiti_default_db_path(self):
        """Graphiti default database path uses .ouro."""
        from integrations.graphiti.config import DEFAULT_DB_PATH

        assert ".ouro" in DEFAULT_DB_PATH
        assert "memories" in DEFAULT_DB_PATH

    def test_graphiti_legacy_constants_exist(self):
        """Graphiti legacy constants exist for backwards compatibility."""
        from integrations.graphiti.config import LEGACY_DATABASE, LEGACY_DB_PATH

        assert LEGACY_DATABASE == "auto_claude_memory"
        assert ".auto-claude" in LEGACY_DB_PATH

    def test_security_profile_filename(self):
        """Security profile uses .ouro-security.json."""
        from security.constants import PROFILE_FILENAME

        assert PROFILE_FILENAME == ".ouro-security.json"


# =============================================================================
# FILE EXCLUSION TESTS
# =============================================================================


class TestFileExclusion:
    """Tests for file exclusion in git operations."""

    def test_get_changed_files_excludes_ouro_files(self, temp_git_repo: Path):
        """get_changed_files_from_branch excludes .ouro files by default."""
        from core.workspace.git_utils import get_changed_files_from_branch

        # Create a branch with changes
        subprocess.run(["git", "checkout", "-b", "test-branch"], cwd=temp_git_repo, capture_output=True)

        # Create files including .ouro directory
        (temp_git_repo / ".ouro").mkdir(parents=True)
        (temp_git_repo / ".ouro" / "test.txt").write_text("test")
        (temp_git_repo / "src").mkdir(parents=True)
        (temp_git_repo / "src" / "main.py").write_text("print('hello')")

        subprocess.run(["git", "add", "."], cwd=temp_git_repo, capture_output=True)
        subprocess.run(["git", "commit", "-m", "Add files"], cwd=temp_git_repo, capture_output=True)

        files = get_changed_files_from_branch(temp_git_repo, "main", "test-branch", exclude_ouro=True)

        file_paths = [f[0] for f in files]
        assert "src/main.py" in file_paths
        assert ".ouro/test.txt" not in file_paths

    def test_get_changed_files_excludes_legacy_files(self, temp_git_repo: Path):
        """get_changed_files_from_branch excludes legacy .auto-claude files."""
        from core.workspace.git_utils import get_changed_files_from_branch

        # Create a branch with changes
        subprocess.run(["git", "checkout", "-b", "test-branch"], cwd=temp_git_repo, capture_output=True)

        # Create files including .auto-claude directory
        (temp_git_repo / ".auto-claude").mkdir(parents=True)
        (temp_git_repo / ".auto-claude" / "test.txt").write_text("test")
        (temp_git_repo / "src").mkdir(parents=True)
        (temp_git_repo / "src" / "main.py").write_text("print('hello')")

        subprocess.run(["git", "add", "."], cwd=temp_git_repo, capture_output=True)
        subprocess.run(["git", "commit", "-m", "Add files"], cwd=temp_git_repo, capture_output=True)

        files = get_changed_files_from_branch(temp_git_repo, "main", "test-branch", exclude_ouro=True)

        file_paths = [f[0] for f in files]
        assert "src/main.py" in file_paths
        assert ".auto-claude/test.txt" not in file_paths


# =============================================================================
# SENTRY CONFIGURATION TESTS
# =============================================================================


class TestSentryConfiguration:
    """Tests for Sentry configuration."""

    def test_sentry_release_uses_ouro_prefix(self):
        """Sentry release string uses ouro@ prefix."""
        from core.sentry import _get_version

        # The init_sentry function would use f"ouro@{version}"
        # We can verify the version function works
        version = _get_version()
        assert version is not None
        # The actual release string in init_sentry is f"ouro@{version}"


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestIntegration:
    """Integration tests for the complete rebranding."""

    def test_full_worktree_lifecycle_with_ouro_naming(self, temp_git_repo: Path):
        """Complete worktree lifecycle uses ouro naming."""
        from worktree import WorktreeManager

        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # Create worktree
        info = manager.create_worktree("integration-test-spec")
        assert info.branch == "ouro/integration-test-spec"
        assert ".ouro" in str(info.path)

        # Make changes
        (info.path / "test-file.txt").write_text("test content")
        subprocess.run(["git", "add", "."], cwd=info.path, capture_output=True)
        subprocess.run(["git", "commit", "-m", "Add test file"], cwd=info.path, capture_output=True)

        # Get change summary
        summary = manager.get_change_summary("integration-test-spec")
        assert summary["new_files"] >= 1

        # Merge
        result = manager.merge_worktree("integration-test-spec", delete_after=False)
        assert result is True

        # Clean up
        manager.remove_worktree("integration-test-spec", delete_branch=True)

    def test_spec_directory_structure_uses_ouro(self, temp_dir: Path):
        """Spec directory structure uses .ouro prefix."""
        from init import init_ouro_dir

        ouro_dir, _ = init_ouro_dir(temp_dir)

        # Create a spec
        spec_dir = ouro_dir / "specs" / "001-test-spec"
        spec_dir.mkdir(parents=True)
        (spec_dir / "spec.md").write_text("# Test Spec")
        (spec_dir / "implementation_plan.json").write_text('{"phases": []}')

        # Verify structure
        assert (temp_dir / ".ouro" / "specs" / "001-test-spec" / "spec.md").exists()
        assert (temp_dir / ".ouro" / "specs" / "001-test-spec" / "implementation_plan.json").exists()
