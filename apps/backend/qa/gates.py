"""
QA Programmatic Gates
=====================

Objective, measurable validation checks that run AFTER the QA agent session.
These gates can override the agent's verdict based on objective criteria.

Philosophy:
- Gates are programmatic and objective (no AI judgment)
- If agent says "approved" but metrics show failures → override to "rejected"
- Gates classify issues as auto-fixable vs. needing human intervention
- Final verdict = Agent verdict AND Gates verdict
- Agent MUST output explicit verdict token: <qa-verdict>APPROVED|REJECTED</qa-verdict>

Gate Types:
- TEST_FAILURES: Unit/integration/E2E tests have failures
- CONSOLE_ERRORS: Browser console has errors
- BUILD_ERRORS: Build/compile failed
- ASSERTION_FAILURES: Test assertions failed
- RECURRING_ISSUE: Same issue appeared 3+ times (from report.py)
- VERDICT_TOKEN_MISSING: Agent didn't output required <qa-verdict> token
- VERDICT_TOKEN_MISMATCH: Token doesn't match qa_signoff.status

Inspired by Ralph Loop's completion promise pattern - agent cannot exit
without outputting explicit, verifiable completion token.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from debug import debug, debug_error, debug_section, debug_success, debug_warning


class GateViolationType(Enum):
    """Types of gate violations."""
    TEST_FAILURES = "test_failures"
    CONSOLE_ERRORS = "console_errors"
    BUILD_ERRORS = "build_errors"
    ASSERTION_FAILURES = "assertion_failures"
    MISSING_SIGNOFF = "missing_signoff"
    VERDICT_TOKEN_MISSING = "verdict_token_missing"
    VERDICT_TOKEN_MISMATCH = "verdict_token_mismatch"
    QA_SUBTASKS_INCOMPLETE = "qa_subtasks_incomplete"
    QA_SUBTASKS_FAILED = "qa_subtasks_failed"


# =============================================================================
# VERDICT TOKEN DETECTION (Inspired by Ralph Loop's completion promise)
# =============================================================================

# The QA agent MUST output this token to signal completion
# Format: <qa-verdict>APPROVED</qa-verdict> or <qa-verdict>REJECTED</qa-verdict>
VERDICT_TOKEN_PATTERN = re.compile(
    r"<qa-verdict>\s*(APPROVED|REJECTED)\s*</qa-verdict>",
    re.IGNORECASE
)


def extract_verdict_token(response_text: str) -> str | None:
    """
    Extract the verdict token from agent's response.

    The agent MUST output <qa-verdict>APPROVED</qa-verdict> or
    <qa-verdict>REJECTED</qa-verdict> to signal its verdict.

    This is a programmatic gate - the agent cannot "approve" by just
    writing to qa_signoff, it must also output the explicit token.

    Returns:
        "approved", "rejected", or None if no valid token found
    """
    if not response_text:
        return None

    match = VERDICT_TOKEN_PATTERN.search(response_text)
    if match:
        verdict = match.group(1).lower()
        return verdict

    return None


def verify_verdict_token(
    response_text: str,
    qa_signoff_status: str | None
) -> tuple[bool, str | None, str | None]:
    """
    Verify that the verdict token matches qa_signoff.status.

    Both must be present and must match. This prevents the agent from:
    1. Approving via qa_signoff but not outputting token (sneaky approval)
    2. Outputting APPROVED token but writing rejected to qa_signoff (inconsistency)

    Returns:
        (is_valid, token_verdict, error_message)
    """
    token_verdict = extract_verdict_token(response_text)

    # Case 1: No token found
    if token_verdict is None:
        return False, None, "Agent did not output required <qa-verdict> token"

    # Case 2: No qa_signoff status
    if qa_signoff_status is None:
        return False, token_verdict, "Agent output token but didn't write qa_signoff"

    # Case 3: Token and signoff don't match
    if token_verdict != qa_signoff_status:
        return False, token_verdict, (
            f"Token says '{token_verdict}' but qa_signoff says '{qa_signoff_status}' - "
            "agent is being inconsistent"
        )

    # All checks passed
    return True, token_verdict, None


class IssueClassification(Enum):
    """Classification of QA issues for routing."""
    AUTO_FIXABLE = "auto_fixable"       # Return to In Progress, let Coder fix
    NEEDS_HUMAN = "needs_human"         # Move to Human Review
    NEEDS_CREDENTIALS = "needs_credentials"  # Specific: needs login creds
    NEEDS_CONFIG = "needs_config"       # Specific: needs dev server config
    RECURRING = "recurring"             # 3+ occurrences, human judgment needed


@dataclass
class GateViolation:
    """A single gate violation."""
    violation_type: GateViolationType
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    is_auto_fixable: bool = True


@dataclass
class GateResult:
    """Result of running programmatic gates."""
    passed: bool
    agent_verdict: str  # What the agent said: "approved", "rejected", "error"
    final_verdict: str  # After gates: may override agent
    violations: list[GateViolation] = field(default_factory=list)
    classification: IssueClassification | None = None
    override_reason: str | None = None
    metrics: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# METRIC EXTRACTION
# =============================================================================


def parse_test_results(tests_passed: dict[str, str] | None) -> dict[str, tuple[int, int]]:
    """
    Parse test results from qa_signoff.tests_passed field.

    Format: {"unit": "5/5", "integration": "3/3", "e2e": "2/3"}

    Returns:
        Dict mapping test type to (passed, total) tuple
    """
    if not tests_passed:
        return {}

    results = {}
    pattern = re.compile(r"(\d+)\s*/\s*(\d+)")

    for test_type, value in tests_passed.items():
        if isinstance(value, str):
            match = pattern.search(value)
            if match:
                passed = int(match.group(1))
                total = int(match.group(2))
                results[test_type] = (passed, total)
        elif isinstance(value, (int, float)):
            # Handle case where value is just a number (all passed)
            results[test_type] = (int(value), int(value))

    return results


def extract_metrics_from_signoff(qa_signoff: dict[str, Any] | None) -> dict[str, Any]:
    """
    Extract objective metrics from qa_signoff.

    Returns:
        Dict with:
        - test_failures: total test failures
        - console_errors: count of console errors (if reported)
        - issues_count: number of issues found
        - critical_issues: number of critical severity issues
    """
    if not qa_signoff:
        return {
            "test_failures": 0,
            "console_errors": 0,
            "issues_count": 0,
            "critical_issues": 0,
            "tests_parsed": {},
        }

    metrics = {
        "test_failures": 0,
        "console_errors": 0,
        "issues_count": 0,
        "critical_issues": 0,
        "tests_parsed": {},
    }

    # Parse test results
    tests_passed = qa_signoff.get("tests_passed", {})
    tests_parsed = parse_test_results(tests_passed)
    metrics["tests_parsed"] = tests_parsed

    # Calculate failures
    for test_type, (passed, total) in tests_parsed.items():
        failures = total - passed
        if failures > 0:
            metrics["test_failures"] += failures

    # Count issues
    issues = qa_signoff.get("issues_found", [])
    metrics["issues_count"] = len(issues)

    # Count critical issues
    for issue in issues:
        issue_type = issue.get("type", "").lower()
        if issue_type in ("critical", "blocker", "error"):
            metrics["critical_issues"] += 1

        # Check for console errors in issue descriptions
        title = issue.get("title", "").lower()
        description = issue.get("description", "").lower()
        if "console error" in title or "console error" in description:
            metrics["console_errors"] += 1

    return metrics


def extract_metrics_from_report(spec_dir: Path) -> dict[str, Any]:
    """
    Extract additional metrics from qa_report.md.

    Parses the markdown report for objective indicators like:
    - "X tests failed"
    - "Console errors: Y"
    - "Build failed"
    """
    report_file = spec_dir / "qa_report.md"
    if not report_file.exists():
        return {}

    try:
        content = report_file.read_text()
    except OSError:
        return {}

    metrics = {}

    # Look for test failure patterns
    test_patterns = [
        r"(\d+)\s+tests?\s+failed",
        r"(\d+)\s+failing",
        r"failures?:\s*(\d+)",
        r"failed:\s*(\d+)",
    ]
    for pattern in test_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            metrics["test_failures_from_report"] = int(match.group(1))
            break

    # Look for console error patterns
    console_patterns = [
        r"console\s+errors?:\s*(\d+)",
        r"(\d+)\s+console\s+errors?",
        r"browser\s+errors?:\s*(\d+)",
    ]
    for pattern in console_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            metrics["console_errors_from_report"] = int(match.group(1))
            break

    # Check for build failure indicators
    build_fail_patterns = [
        r"build\s+failed",
        r"compilation?\s+failed",
        r"compile\s+error",
        r"build\s+error",
    ]
    for pattern in build_fail_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            metrics["build_failed"] = True
            break

    return metrics


# =============================================================================
# ISSUE CLASSIFICATION
# =============================================================================


def classify_issues(
    issues: list[dict[str, Any]],
    metrics: dict[str, Any],
    has_recurring: bool = False
) -> IssueClassification:
    """
    Classify the overall QA result for routing.

    Returns classification that determines next action:
    - AUTO_FIXABLE: Back to In Progress, Coder fixes, then re-QA
    - NEEDS_HUMAN: To Human Review status, wait for human
    - NEEDS_CREDENTIALS/NEEDS_CONFIG: Specific blockers
    - RECURRING: Same issues keep appearing
    """
    if has_recurring:
        return IssueClassification.RECURRING

    # Check for credential/config blockers in issues
    for issue in issues:
        title = (issue.get("title") or "").lower()
        description = (issue.get("description") or "").lower()
        combined = f"{title} {description}"

        # Credential indicators
        if any(kw in combined for kw in ["login", "credential", "password", "authentication", "auth fail"]):
            if any(kw in combined for kw in ["need", "require", "missing", "provide"]):
                return IssueClassification.NEEDS_CREDENTIALS

        # Config indicators
        if any(kw in combined for kw in ["dev server", "server not running", "connection refused", "econnrefused"]):
            return IssueClassification.NEEDS_CONFIG

    # Check for human-required issues
    for issue in issues:
        issue_type = (issue.get("type") or "").lower()
        title = (issue.get("title") or "").lower()
        description = (issue.get("description") or "").lower()
        combined = f"{title} {description}"

        # Issues that typically need human judgment
        human_indicators = [
            "unclear requirement",
            "design decision",
            "ambiguous spec",
            "flaky test",
            "environment issue",
            "infrastructure",
            "third party",
            "external service",
            "permission denied",
            "access denied",
        ]

        if any(indicator in combined for indicator in human_indicators):
            return IssueClassification.NEEDS_HUMAN

    # Most issues are auto-fixable (code bugs, test failures, etc.)
    return IssueClassification.AUTO_FIXABLE


# =============================================================================
# GATE EXECUTION
# =============================================================================


def run_post_session_gates(
    spec_dir: Path,
    qa_signoff: dict[str, Any] | None,
    agent_verdict: str,
    history: list[dict[str, Any]] | None = None,
    response_text: str | None = None,
) -> GateResult:
    """
    Run programmatic gates AFTER the QA agent session.

    This is the main entry point for gate validation.

    CRITICAL: The agent MUST output <qa-verdict>APPROVED|REJECTED</qa-verdict>
    token in its response. This is inspired by Ralph Loop's completion promise
    pattern - the agent cannot exit the QA loop without explicit, verifiable
    commitment to a verdict.

    Args:
        spec_dir: Spec directory
        qa_signoff: The qa_signoff object from implementation_plan.json
        agent_verdict: What the agent said ("approved", "rejected", "error")
        history: QA iteration history for recurring issue detection
        response_text: Full response text from agent (for token extraction)

    Returns:
        GateResult with final verdict and any violations
    """
    debug_section("qa_gates", "Running post-session programmatic gates")
    debug(
        "qa_gates",
        "Gate inputs",
        agent_verdict=agent_verdict,
        has_signoff=qa_signoff is not None,
        has_response_text=response_text is not None,
    )

    violations: list[GateViolation] = []

    # =========================================================================
    # GATE 0: VERDICT TOKEN VERIFICATION (Ralph Loop inspired)
    # =========================================================================
    # The agent MUST output <qa-verdict>APPROVED|REJECTED</qa-verdict>
    # This is a hard gate - if missing or mismatched, we cannot trust the verdict

    signoff_status = qa_signoff.get("status") if qa_signoff else None

    if response_text:
        token_valid, token_verdict, token_error = verify_verdict_token(
            response_text, signoff_status
        )

        if not token_valid:
            if token_verdict is None:
                # No token found at all
                debug_error("qa_gates", "GATE VIOLATION: Verdict token missing")
                violations.append(GateViolation(
                    violation_type=GateViolationType.VERDICT_TOKEN_MISSING,
                    message="Agent did not output required <qa-verdict>APPROVED|REJECTED</qa-verdict> token",
                    details={"expected": "<qa-verdict>APPROVED</qa-verdict> or <qa-verdict>REJECTED</qa-verdict>"},
                    is_auto_fixable=False,  # Agent must learn to output token
                ))
            else:
                # Token found but doesn't match signoff
                debug_error(
                    "qa_gates",
                    f"GATE VIOLATION: Token mismatch - token={token_verdict}, signoff={signoff_status}"
                )
                violations.append(GateViolation(
                    violation_type=GateViolationType.VERDICT_TOKEN_MISMATCH,
                    message=token_error or "Verdict token doesn't match qa_signoff.status",
                    details={"token": token_verdict, "signoff": signoff_status},
                    is_auto_fixable=False,
                ))

            # Token violation is critical - override to error and force retry
            return GateResult(
                passed=False,
                agent_verdict=agent_verdict,
                final_verdict="error",
                violations=violations,
                classification=None,
                override_reason=f"Verdict token invalid: {token_error}",
                metrics={},
            )

        debug_success(
            "qa_gates",
            f"Verdict token verified: <qa-verdict>{token_verdict.upper()}</qa-verdict>"
        )

    # =========================================================================
    # GATE 0.5: QA Subtasks Verification (if subtasks exist)
    # =========================================================================
    from .subtasks import get_qa_subtasks_result, verify_all_subtasks_complete

    subtasks_result = get_qa_subtasks_result(spec_dir)

    if subtasks_result.total > 0:
        # QA subtasks exist - verify they were all checked
        subtasks_complete, subtasks_error = verify_all_subtasks_complete(spec_dir)

        if not subtasks_complete:
            if subtasks_result.pending > 0:
                # Subtasks not all checked
                debug_error(
                    "qa_gates",
                    f"GATE VIOLATION: {subtasks_result.pending} QA subtasks not checked"
                )
                pending_ids = [s.id for s in subtasks_result.subtasks if s.status == "pending"]
                violations.append(GateViolation(
                    violation_type=GateViolationType.QA_SUBTASKS_INCOMPLETE,
                    message=f"QA subtasks not checked: {', '.join(pending_ids)}",
                    details={
                        "pending": subtasks_result.pending,
                        "pending_ids": pending_ids,
                        "total": subtasks_result.total,
                    },
                    is_auto_fixable=False,  # Agent must check all subtasks
                ))

            if subtasks_result.failed > 0:
                # Some subtasks failed
                debug_warning(
                    "qa_gates",
                    f"GATE VIOLATION: {subtasks_result.failed} QA subtasks failed"
                )
                failed = [s for s in subtasks_result.subtasks if s.status == "failed"]
                violations.append(GateViolation(
                    violation_type=GateViolationType.QA_SUBTASKS_FAILED,
                    message=f"{subtasks_result.failed} QA subtasks failed",
                    details={
                        "failed": subtasks_result.failed,
                        "failures": [
                            {"id": s.id, "description": s.description, "reason": s.failure_reason}
                            for s in failed
                        ],
                    },
                    is_auto_fixable=True,  # Failed subtasks can be fixed
                ))

            # If agent approved but subtasks incomplete/failed, we may need to override
            if agent_verdict == "approved" and (subtasks_result.pending > 0 or subtasks_result.failed > 0):
                return GateResult(
                    passed=False,
                    agent_verdict=agent_verdict,
                    final_verdict="rejected",
                    violations=violations,
                    classification=IssueClassification.AUTO_FIXABLE if subtasks_result.failed > 0 else None,
                    override_reason=f"Agent approved but QA subtasks incomplete: {subtasks_error}",
                    metrics={"qa_subtasks": subtasks_result.to_dict()["summary"]},
                )
        else:
            debug_success(
                "qa_gates",
                f"QA subtasks verified: {subtasks_result.passed}/{subtasks_result.total} passed"
            )

    # =========================================================================
    # GATE 1: Missing signoff (agent didn't do its job)
    # =========================================================================
    if not qa_signoff:
        debug_error("qa_gates", "GATE VIOLATION: Missing qa_signoff")
        violations.append(GateViolation(
            violation_type=GateViolationType.MISSING_SIGNOFF,
            message="QA agent did not write qa_signoff to implementation_plan.json",
            is_auto_fixable=False,
        ))

        return GateResult(
            passed=False,
            agent_verdict=agent_verdict,
            final_verdict="error",
            violations=violations,
            classification=IssueClassification.NEEDS_HUMAN,
            override_reason="Agent failed to write qa_signoff",
            metrics={},
        )

    # Extract metrics
    metrics = extract_metrics_from_signoff(qa_signoff)
    report_metrics = extract_metrics_from_report(spec_dir)

    # Merge report metrics (they may have more detail)
    if report_metrics.get("test_failures_from_report", 0) > metrics["test_failures"]:
        metrics["test_failures"] = report_metrics["test_failures_from_report"]
    if report_metrics.get("console_errors_from_report", 0) > metrics["console_errors"]:
        metrics["console_errors"] = report_metrics["console_errors_from_report"]
    if report_metrics.get("build_failed"):
        metrics["build_failed"] = True

    debug(
        "qa_gates",
        "Extracted metrics",
        test_failures=metrics["test_failures"],
        console_errors=metrics["console_errors"],
        issues_count=metrics["issues_count"],
        critical_issues=metrics["critical_issues"],
    )

    # Gate 1: Test failures
    if metrics["test_failures"] > 0:
        debug_warning(
            "qa_gates",
            f"GATE VIOLATION: {metrics['test_failures']} test failures"
        )
        violations.append(GateViolation(
            violation_type=GateViolationType.TEST_FAILURES,
            message=f"{metrics['test_failures']} tests failed",
            details={"tests_parsed": metrics["tests_parsed"]},
            is_auto_fixable=True,  # Test failures are usually fixable
        ))

    # Gate 2: Console errors
    if metrics["console_errors"] > 0:
        debug_warning(
            "qa_gates",
            f"GATE VIOLATION: {metrics['console_errors']} console errors"
        )
        violations.append(GateViolation(
            violation_type=GateViolationType.CONSOLE_ERRORS,
            message=f"{metrics['console_errors']} console errors detected",
            is_auto_fixable=True,
        ))

    # Gate 3: Build errors
    if metrics.get("build_failed"):
        debug_error("qa_gates", "GATE VIOLATION: Build failed")
        violations.append(GateViolation(
            violation_type=GateViolationType.BUILD_ERRORS,
            message="Build/compilation failed",
            is_auto_fixable=True,
        ))

    # Check for recurring issues if history provided
    has_recurring = False
    if history:
        from .report import has_recurring_issues
        issues = qa_signoff.get("issues_found", [])
        has_recurring, _ = has_recurring_issues(issues, history)
        if has_recurring:
            debug_warning("qa_gates", "Recurring issues detected from history")

    # Determine if gates passed
    gates_passed = len(violations) == 0

    # Determine final verdict (may override agent)
    final_verdict = agent_verdict

    if agent_verdict == "approved" and not gates_passed:
        # Override: Agent said approved but gates failed
        final_verdict = "rejected"
        override_reason = f"Agent approved but gates found: {', '.join(v.message for v in violations)}"
        debug_warning("qa_gates", f"OVERRIDE: {override_reason}")
    elif agent_verdict == "approved" and gates_passed:
        # Confirmed approval
        debug_success("qa_gates", "Gates confirmed agent approval")
        override_reason = None
    elif agent_verdict == "rejected":
        # Agent rejected - gates just add more context
        override_reason = None
        debug("qa_gates", "Agent rejected - gates add context")
    else:
        # Error case - keep as error
        override_reason = None

    # Classify issues for routing
    issues = qa_signoff.get("issues_found", [])
    classification = None
    if final_verdict == "rejected":
        classification = classify_issues(issues, metrics, has_recurring)
        debug(
            "qa_gates",
            "Issue classification",
            classification=classification.value if classification else None,
        )

    result = GateResult(
        passed=gates_passed,
        agent_verdict=agent_verdict,
        final_verdict=final_verdict,
        violations=violations,
        classification=classification,
        override_reason=override_reason,
        metrics=metrics,
    )

    debug_success(
        "qa_gates",
        "Gates complete",
        passed=result.passed,
        final_verdict=result.final_verdict,
        violations_count=len(violations),
    )

    return result


# =============================================================================
# GATE RESULT TO ACTION
# =============================================================================


def get_recommended_action(gate_result: GateResult) -> dict[str, Any]:
    """
    Convert gate result to recommended action for the QA loop.

    Returns:
        Dict with:
        - action: "continue_loop" | "escalate_human" | "escalate_credentials" | "escalate_config"
        - reason: Why this action
        - task_status: Recommended task status ("in_progress", "human_review", "error")
        - create_subtasks: Whether to create QA-related subtasks
        - subtask_descriptions: If create_subtasks, what subtasks to create
    """
    if gate_result.final_verdict == "approved":
        return {
            "action": "complete",
            "reason": "QA approved by agent and gates",
            "task_status": "completed",
            "create_subtasks": False,
        }

    if gate_result.final_verdict == "error":
        return {
            "action": "escalate_human",
            "reason": "QA agent error - could not determine status",
            "task_status": "error",
            "create_subtasks": False,
        }

    # Final verdict is "rejected" - determine action based on classification
    classification = gate_result.classification

    if classification == IssueClassification.NEEDS_CREDENTIALS:
        return {
            "action": "escalate_credentials",
            "reason": "Login credentials required for testing",
            "task_status": "blocked",
            "create_subtasks": False,
        }

    if classification == IssueClassification.NEEDS_CONFIG:
        return {
            "action": "escalate_config",
            "reason": "Dev server configuration required",
            "task_status": "blocked",
            "create_subtasks": False,
        }

    if classification == IssueClassification.RECURRING:
        return {
            "action": "escalate_human",
            "reason": "Recurring issues - automated fixes not resolving",
            "task_status": "human_review",
            "create_subtasks": False,
        }

    if classification == IssueClassification.NEEDS_HUMAN:
        return {
            "action": "escalate_human",
            "reason": "Issues require human judgment",
            "task_status": "human_review",
            "create_subtasks": False,
        }

    # AUTO_FIXABLE - continue the loop
    # Build subtask descriptions from violations
    subtask_descriptions = []

    for violation in gate_result.violations:
        if violation.violation_type == GateViolationType.TEST_FAILURES:
            subtask_descriptions.append(f"Fix failing tests: {violation.message}")
        elif violation.violation_type == GateViolationType.CONSOLE_ERRORS:
            subtask_descriptions.append(f"Fix console errors: {violation.message}")
        elif violation.violation_type == GateViolationType.BUILD_ERRORS:
            subtask_descriptions.append("Fix build/compilation errors")

    return {
        "action": "continue_loop",
        "reason": "Issues are auto-fixable - running QA fixer",
        "task_status": "in_progress",
        "create_subtasks": len(subtask_descriptions) > 0,
        "subtask_descriptions": subtask_descriptions,
        "violations": [
            {
                "type": v.violation_type.value,
                "message": v.message,
                "auto_fixable": v.is_auto_fixable,
            }
            for v in gate_result.violations
        ],
    }
