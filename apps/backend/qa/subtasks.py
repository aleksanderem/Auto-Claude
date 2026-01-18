"""
QA Subtasks Module
==================

Manages QA verification subtasks parsed from acceptance criteria in spec.md.
Each acceptance criterion becomes a verifiable QA subtask that the QA agent
must explicitly pass or fail.

This provides granular, auditable QA verification instead of a single
APPROVED/REJECTED verdict.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


@dataclass
class QASubtask:
    """A single QA verification subtask."""

    id: str  # "qa-001", "qa-002", etc.
    description: str  # From acceptance criteria or agent-added
    source: str  # "spec" | "agent" - where it came from
    status: str = "pending"  # "pending" | "passed" | "failed" | "skipped"
    verification_type: str | None = None  # "manual" | "command" | "e2e" | "visual"
    verification_command: str | None = None  # Optional command to run
    notes: str | None = None  # Agent's notes on this check
    checked_at: str | None = None  # ISO timestamp when verified
    failure_reason: str | None = None  # Why it failed (if status == "failed")

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "id": self.id,
            "description": self.description,
            "source": self.source,
            "status": self.status,
        }
        # Only include optional fields if set
        if self.verification_type:
            result["verification_type"] = self.verification_type
        if self.verification_command:
            result["verification_command"] = self.verification_command
        if self.notes:
            result["notes"] = self.notes
        if self.checked_at:
            result["checked_at"] = self.checked_at
        if self.failure_reason:
            result["failure_reason"] = self.failure_reason
        return result

    @classmethod
    def from_dict(cls, data: dict) -> QASubtask:
        """Create QASubtask from dictionary."""
        return cls(
            id=data["id"],
            description=data["description"],
            source=data.get("source", "spec"),
            status=data.get("status", "pending"),
            verification_type=data.get("verification_type"),
            verification_command=data.get("verification_command"),
            notes=data.get("notes"),
            checked_at=data.get("checked_at"),
            failure_reason=data.get("failure_reason"),
        )

    def mark_passed(self, notes: str | None = None) -> None:
        """Mark this subtask as passed."""
        self.status = "passed"
        self.checked_at = datetime.now(timezone.utc).isoformat()
        if notes:
            self.notes = notes

    def mark_failed(self, reason: str, notes: str | None = None) -> None:
        """Mark this subtask as failed."""
        self.status = "failed"
        self.checked_at = datetime.now(timezone.utc).isoformat()
        self.failure_reason = reason
        if notes:
            self.notes = notes

    def mark_skipped(self, reason: str) -> None:
        """Mark this subtask as skipped (not applicable)."""
        self.status = "skipped"
        self.checked_at = datetime.now(timezone.utc).isoformat()
        self.notes = f"Skipped: {reason}"


@dataclass
class QASubtasksResult:
    """Result of QA subtasks verification."""

    subtasks: list[QASubtask] = field(default_factory=list)
    all_passed: bool = False
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    pending: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "subtasks": [s.to_dict() for s in self.subtasks],
            "summary": {
                "all_passed": self.all_passed,
                "total": self.total,
                "passed": self.passed,
                "failed": self.failed,
                "skipped": self.skipped,
                "pending": self.pending,
            },
        }

    @classmethod
    def from_subtasks(cls, subtasks: list[QASubtask]) -> QASubtasksResult:
        """Create result from list of subtasks."""
        total = len(subtasks)
        passed = sum(1 for s in subtasks if s.status == "passed")
        failed = sum(1 for s in subtasks if s.status == "failed")
        skipped = sum(1 for s in subtasks if s.status == "skipped")
        pending = sum(1 for s in subtasks if s.status == "pending")

        # All passed if no failures and no pending (skipped is OK)
        all_passed = failed == 0 and pending == 0 and passed > 0

        return cls(
            subtasks=subtasks,
            all_passed=all_passed,
            total=total,
            passed=passed,
            failed=failed,
            skipped=skipped,
            pending=pending,
        )


# =============================================================================
# PARSING ACCEPTANCE CRITERIA FROM SPEC
# =============================================================================


def parse_acceptance_criteria_from_spec(spec_content: str) -> list[str]:
    """
    Extract acceptance criteria from spec.md content.

    Looks for sections with headers containing:
    - "Success Criteria"
    - "Acceptance Criteria"
    - "Done When"
    - "Complete When"
    - "QA Acceptance Criteria"

    Returns list of criteria text (without checkbox markers).
    """
    criteria: list[str] = []
    in_criteria_section = False

    lines = spec_content.split("\n")
    for line in lines:
        line_lower = line.lower()

        # Look for criteria section headers
        if any(
            header in line_lower
            for header in [
                "success criteria",
                "acceptance criteria",
                "done when",
                "complete when",
                "qa acceptance",
            ]
        ):
            in_criteria_section = True
            continue

        if in_criteria_section:
            # Stop at next section header
            if line.startswith("##"):
                break

            # Extract criteria (lines starting with -, *, or checkboxes)
            stripped = line.strip()
            if stripped.startswith(("- ", "* ", "- [ ]", "- [x]", "- [X]")):
                # Clean up the line - remove list markers and checkboxes
                criterion = re.sub(r"^[-*]\s*(\[[ xX]\])?\s*", "", stripped).strip()
                if criterion:
                    criteria.append(criterion)

    return criteria


def create_qa_subtasks_from_spec(spec_dir: Path) -> list[QASubtask]:
    """
    Create QA subtasks from acceptance criteria in spec.md.

    Args:
        spec_dir: Directory containing spec.md

    Returns:
        List of QASubtask objects ready for verification
    """
    spec_file = spec_dir / "spec.md"
    if not spec_file.exists():
        return []

    spec_content = spec_file.read_text()
    criteria = parse_acceptance_criteria_from_spec(spec_content)

    subtasks = []
    for i, criterion in enumerate(criteria, start=1):
        subtask = QASubtask(
            id=f"qa-{i:03d}",
            description=criterion,
            source="spec",
            status="pending",
            verification_type=infer_verification_type(criterion),
        )
        subtasks.append(subtask)

    return subtasks


def infer_verification_type(criterion: str) -> str:
    """
    Infer the verification type from the criterion text.

    Returns: "manual" | "command" | "e2e" | "visual" | "api"
    """
    criterion_lower = criterion.lower()

    # E2E/browser tests
    if any(
        kw in criterion_lower
        for kw in [
            "click",
            "navigate",
            "page",
            "form",
            "button",
            "input",
            "ui",
            "user can",
        ]
    ):
        return "e2e"

    # Visual checks
    if any(
        kw in criterion_lower
        for kw in ["display", "show", "visible", "appear", "render", "style", "color"]
    ):
        return "visual"

    # API tests
    if any(
        kw in criterion_lower
        for kw in ["api", "endpoint", "request", "response", "status code", "http"]
    ):
        return "api"

    # Command/test execution
    if any(
        kw in criterion_lower
        for kw in ["test", "pass", "run", "execute", "command", "build", "compile"]
    ):
        return "command"

    # Default to manual
    return "manual"


# =============================================================================
# IMPLEMENTATION PLAN INTEGRATION
# =============================================================================


def load_qa_subtasks(spec_dir: Path) -> list[QASubtask]:
    """
    Load QA subtasks from implementation_plan.json.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        List of QASubtask objects (empty if not found)
    """
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return []

    try:
        with open(plan_file) as f:
            plan = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []

    qa_signoff = plan.get("qa_signoff", {})
    subtasks_data = qa_signoff.get("qa_subtasks", [])

    return [QASubtask.from_dict(s) for s in subtasks_data]


def save_qa_subtasks(spec_dir: Path, subtasks: list[QASubtask]) -> bool:
    """
    Save QA subtasks to implementation_plan.json.

    Args:
        spec_dir: Directory containing implementation_plan.json
        subtasks: List of QASubtask objects to save

    Returns:
        True if saved successfully
    """
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return False

    try:
        with open(plan_file) as f:
            plan = json.load(f)
    except (OSError, json.JSONDecodeError):
        return False

    # Ensure qa_signoff exists
    if "qa_signoff" not in plan:
        plan["qa_signoff"] = {}

    # Save subtasks
    result = QASubtasksResult.from_subtasks(subtasks)
    plan["qa_signoff"]["qa_subtasks"] = [s.to_dict() for s in subtasks]
    plan["qa_signoff"]["qa_subtasks_summary"] = result.to_dict()["summary"]

    try:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        return True
    except OSError:
        return False


def initialize_qa_subtasks(spec_dir: Path, force: bool = False) -> list[QASubtask]:
    """
    Initialize QA subtasks from spec.md acceptance criteria.

    If subtasks already exist and force=False, returns existing subtasks.
    If force=True, regenerates from spec (preserving agent-added subtasks).

    Args:
        spec_dir: Directory containing spec.md and implementation_plan.json
        force: If True, regenerate spec-based subtasks

    Returns:
        List of initialized QASubtask objects
    """
    existing = load_qa_subtasks(spec_dir)

    if existing and not force:
        return existing

    # Parse fresh from spec
    spec_subtasks = create_qa_subtasks_from_spec(spec_dir)

    if force and existing:
        # Preserve agent-added subtasks
        agent_subtasks = [s for s in existing if s.source == "agent"]
        # Re-number agent subtasks to follow spec subtasks
        next_id = len(spec_subtasks) + 1
        for subtask in agent_subtasks:
            subtask.id = f"qa-{next_id:03d}"
            next_id += 1
        spec_subtasks.extend(agent_subtasks)

    # Save to plan
    save_qa_subtasks(spec_dir, spec_subtasks)

    return spec_subtasks


def add_qa_subtask(
    spec_dir: Path,
    description: str,
    verification_type: str = "manual",
    verification_command: str | None = None,
) -> QASubtask | None:
    """
    Add an agent-discovered QA subtask (e.g., edge case, regression check).

    Args:
        spec_dir: Directory containing implementation_plan.json
        description: What to verify
        verification_type: How to verify
        verification_command: Optional command to run

    Returns:
        The created QASubtask, or None if failed
    """
    existing = load_qa_subtasks(spec_dir)

    # Generate next ID
    next_id = len(existing) + 1

    subtask = QASubtask(
        id=f"qa-{next_id:03d}",
        description=description,
        source="agent",
        status="pending",
        verification_type=verification_type,
        verification_command=verification_command,
    )

    existing.append(subtask)

    if save_qa_subtasks(spec_dir, existing):
        return subtask
    return None


def update_qa_subtask_status(
    spec_dir: Path,
    subtask_id: str,
    status: str,
    notes: str | None = None,
    failure_reason: str | None = None,
) -> bool:
    """
    Update the status of a QA subtask.

    Args:
        spec_dir: Directory containing implementation_plan.json
        subtask_id: ID of subtask to update (e.g., "qa-001")
        status: New status ("passed" | "failed" | "skipped")
        notes: Optional notes
        failure_reason: Required if status is "failed"

    Returns:
        True if updated successfully
    """
    subtasks = load_qa_subtasks(spec_dir)

    for subtask in subtasks:
        if subtask.id == subtask_id:
            if status == "passed":
                subtask.mark_passed(notes)
            elif status == "failed":
                subtask.mark_failed(failure_reason or "No reason provided", notes)
            elif status == "skipped":
                subtask.mark_skipped(notes or "Not applicable")
            else:
                return False

            return save_qa_subtasks(spec_dir, subtasks)

    return False


def get_qa_subtasks_result(spec_dir: Path) -> QASubtasksResult:
    """
    Get the current QA subtasks result with summary.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        QASubtasksResult with all subtasks and summary
    """
    subtasks = load_qa_subtasks(spec_dir)
    return QASubtasksResult.from_subtasks(subtasks)


def verify_all_subtasks_complete(spec_dir: Path) -> tuple[bool, str | None]:
    """
    Verify that all QA subtasks have been checked (no pending).

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        (success, error_message) - True if all complete, False with reason if not
    """
    result = get_qa_subtasks_result(spec_dir)

    if result.total == 0:
        return False, "No QA subtasks defined - cannot verify"

    if result.pending > 0:
        pending_ids = [s.id for s in result.subtasks if s.status == "pending"]
        return False, f"QA subtasks not checked: {', '.join(pending_ids)}"

    if result.failed > 0:
        failed = [s for s in result.subtasks if s.status == "failed"]
        failed_summary = "; ".join(
            f"{s.id}: {s.failure_reason or 'no reason'}" for s in failed
        )
        return False, f"QA subtasks failed: {failed_summary}"

    return True, None
