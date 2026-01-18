"""
QA Validation Loop Orchestration
=================================

Main QA loop that coordinates reviewer and fixer sessions until
approval or max iterations.
"""

import os
import time as time_module
from pathlib import Path

from core.client import create_client, load_project_mcp_config
from debug import debug, debug_error, debug_section, debug_success, debug_warning
from linear_updater import (
    LinearTaskState,
    is_linear_enabled,
    linear_qa_approved,
    linear_qa_max_iterations,
    linear_qa_rejected,
    linear_qa_started,
)
from phase_config import get_phase_model, get_phase_thinking_budget
from phase_event import ExecutionPhase, emit_phase
from progress import count_subtasks, is_build_complete
from security.constants import PROJECT_DIR_ENV_VAR
from task_logger import (
    LogPhase,
    get_task_logger,
)

from .config import (
    check_qa_prerequisites,
    detect_login_requirement,
    has_dev_server_config,
    load_qa_config,
)
from .criteria import (
    get_qa_iteration_count,
    get_qa_signoff_status,
    is_qa_approved,
    load_implementation_plan,
    save_implementation_plan,
)
from .escalation import (
    apply_auto_detected_config,
    clear_escalation,
    escalate_for_credentials,
    escalate_for_dev_server,
    escalate_recurring_issues,
    has_pending_escalation,
)
from .fixer import run_qa_fixer_session
from .gates import (
    GateResult,
    IssueClassification,
    get_recommended_action,
    run_post_session_gates,
)
from .report import (
    create_manual_test_plan,
    escalate_to_human,
    get_iteration_history,
    get_recurring_issue_summary,
    has_recurring_issues,
    is_no_test_project,
    record_iteration,
)
from .reviewer import run_qa_agent_session

# Configuration
MAX_QA_ITERATIONS = 50
MAX_CONSECUTIVE_ERRORS = 3  # Stop after 3 consecutive errors without progress


# =============================================================================
# QA VALIDATION LOOP
# =============================================================================


async def run_qa_validation_loop(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool:
    """
    Run the full QA validation loop.

    This is the self-validating loop:
    1. QA Agent reviews
    2. If rejected → Fixer Agent fixes
    3. QA Agent re-reviews
    4. Loop until approved or max iterations

    Enhanced with:
    - Iteration tracking with detailed history
    - Recurring issue detection (3+ occurrences → human escalation)
    - No-test project handling

    Args:
        project_dir: Project root directory
        spec_dir: Spec directory
        model: Claude model to use
        verbose: Whether to show detailed output

    Returns:
        True if QA approved, False otherwise
    """
    # Set environment variable for security hooks to find the correct project directory
    # This is needed because os.getcwd() may return the wrong directory in worktree mode
    os.environ[PROJECT_DIR_ENV_VAR] = str(project_dir.resolve())

    debug_section("qa_loop", "QA Validation Loop")
    debug(
        "qa_loop",
        "Starting QA validation loop",
        project_dir=str(project_dir),
        spec_dir=str(spec_dir),
        model=model,
        max_iterations=MAX_QA_ITERATIONS,
    )

    print("\n" + "=" * 70)
    print("  QA VALIDATION LOOP")
    print("  Self-validating quality assurance")
    print("=" * 70)

    # Initialize task logger for the validation phase
    task_logger = get_task_logger(spec_dir)

    # Verify build is complete
    if not is_build_complete(spec_dir):
        debug_warning("qa_loop", "Build is not complete, cannot run QA")
        print("\n❌ Build is not complete. Cannot run QA validation.")
        completed, total = count_subtasks(spec_dir)
        debug("qa_loop", "Build progress", completed=completed, total=total)
        print(f"   Progress: {completed}/{total} subtasks completed")
        return False

    # Emit phase event at start of QA validation (before any early returns)
    emit_phase(ExecutionPhase.QA_REVIEW, "Starting QA validation")

    # =========================================================================
    # PREREQUISITES CHECK - Gate before running QA
    # =========================================================================
    # This is a programmatic gate that prevents QA from running blindly.
    # If prerequisites aren't met, we escalate to human and STOP.

    # First, try to auto-apply detected config (e.g., dev server)
    await apply_auto_detected_config(spec_dir, project_dir)

    # Detect if this spec likely needs login credentials
    requires_login = detect_login_requirement(spec_dir, project_dir)

    # Check prerequisites
    prereq_result = check_qa_prerequisites(
        spec_dir=spec_dir,
        project_dir=project_dir,
        requires_login=requires_login,
        requires_dev_server=True  # E2E tests need dev server
    )

    if not prereq_result["can_proceed"]:
        blocker_type = prereq_result["blocker_type"]
        debug_warning(
            "qa_loop",
            f"Prerequisites not met: {blocker_type}",
            details=prereq_result["blocker_details"]
        )

        # Escalate to human based on blocker type
        if blocker_type == "NEED_CREDENTIALS":
            await escalate_for_credentials(spec_dir, project_dir)
        elif blocker_type == "NEED_DEV_SERVER":
            await escalate_for_dev_server(spec_dir, project_dir)

        # End task logger phase
        if task_logger:
            task_logger.end_phase(
                LogPhase.VALIDATION,
                success=False,
                message=f"QA blocked: {prereq_result['blocker_details']}"
            )

        return False  # Stop - wait for human input

    # Prerequisites met - clear any old escalation files
    clear_escalation(spec_dir)

    debug_success("qa_loop", "Prerequisites check passed")

    # =========================================================================
    # INITIALIZE QA SUBTASKS - Parse from spec.md acceptance criteria
    # =========================================================================
    from .subtasks import get_qa_subtasks_result, initialize_qa_subtasks

    qa_subtasks = initialize_qa_subtasks(spec_dir)
    if qa_subtasks:
        debug(
            "qa_loop",
            "QA subtasks initialized from spec",
            count=len(qa_subtasks),
            subtasks=[s.id for s in qa_subtasks],
        )
        print(f"\n📋 QA Subtasks: {len(qa_subtasks)} acceptance criteria to verify")
        for subtask in qa_subtasks[:5]:  # Show first 5
            print(f"   - {subtask.id}: {subtask.description[:60]}...")
        if len(qa_subtasks) > 5:
            print(f"   ... and {len(qa_subtasks) - 5} more")
    else:
        debug_warning("qa_loop", "No QA subtasks found - will use traditional verdict-only mode")

    # =========================================================================
    # END QA SUBTASKS INITIALIZATION
    # =========================================================================

    # =========================================================================
    # END PREREQUISITES CHECK
    # =========================================================================

    # Check if there's pending human feedback that needs to be processed
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    has_human_feedback = fix_request_file.exists()

    # Check if already approved - but if there's human feedback, we need to process it first
    if is_qa_approved(spec_dir) and not has_human_feedback:
        debug_success("qa_loop", "Build already approved by QA")
        print("\n✅ Build already approved by QA.")
        return True

    # If there's human feedback, we need to run the fixer first before re-validating
    if has_human_feedback:
        debug(
            "qa_loop",
            "Human feedback detected - will run fixer first",
            fix_request_file=str(fix_request_file),
        )
        emit_phase(ExecutionPhase.QA_FIXING, "Processing human feedback")
        print("\n📝 Human feedback detected. Running QA Fixer first...")

        # Get model and thinking budget for fixer (uses QA phase config)
        qa_model = get_phase_model(spec_dir, "qa", model)
        fixer_thinking_budget = get_phase_thinking_budget(spec_dir, "qa")

        # Set SPEC_DIR environment variable for Playwright screenshot path resolution
        os.environ["SPEC_DIR"] = str(spec_dir.resolve())

        # Load project MCP config and set PLAYWRIGHT_HEADLESS if specified
        # This allows UI changes to .env to take effect immediately
        mcp_config = load_project_mcp_config(project_dir)
        if "PLAYWRIGHT_HEADLESS" in mcp_config:
            os.environ["PLAYWRIGHT_HEADLESS"] = mcp_config["PLAYWRIGHT_HEADLESS"]

        fix_client = create_client(
            project_dir,
            spec_dir,
            qa_model,
            agent_type="qa_fixer",
            max_thinking_tokens=fixer_thinking_budget,
        )

        async with fix_client:
            fix_status, fix_response = await run_qa_fixer_session(
                fix_client,
                spec_dir,
                0,
                False,  # iteration 0 for human feedback
            )

        if fix_status == "error":
            debug_error("qa_loop", f"Fixer error: {fix_response[:200]}")
            print(f"\n❌ Fixer encountered error: {fix_response}")
            return False

        debug_success("qa_loop", "Human feedback fixes applied")
        print("\n✅ Fixes applied based on human feedback. Running QA validation...")

        # Remove the fix request file after processing
        try:
            fix_request_file.unlink()
            debug("qa_loop", "Removed processed QA_FIX_REQUEST.md")
        except OSError:
            pass  # Ignore if file removal fails

    # Check for no-test projects
    if is_no_test_project(spec_dir, project_dir):
        print("\n⚠️  No test framework detected in project.")
        print("Creating manual test plan...")
        manual_plan = create_manual_test_plan(spec_dir, spec_dir.name)
        print(f"📝 Manual test plan created: {manual_plan}")
        print("\nNote: Automated testing will be limited for this project.")

    # Start validation phase in task logger
    if task_logger:
        task_logger.start_phase(LogPhase.VALIDATION, "Starting QA validation...")

    # Check Linear integration status
    linear_task = None
    if is_linear_enabled():
        linear_task = LinearTaskState.load(spec_dir)
        if linear_task and linear_task.task_id:
            print(f"Linear task: {linear_task.task_id}")
            # Update Linear to "In Review" when QA starts
            await linear_qa_started(spec_dir)
            print("Linear task moved to 'In Review'")

    qa_iteration = get_qa_iteration_count(spec_dir)
    consecutive_errors = 0
    last_error_context = None  # Track error for self-correction feedback

    while qa_iteration < MAX_QA_ITERATIONS:
        qa_iteration += 1
        iteration_start = time_module.time()

        debug_section("qa_loop", f"QA Iteration {qa_iteration}")
        debug(
            "qa_loop",
            f"Starting iteration {qa_iteration}/{MAX_QA_ITERATIONS}",
            iteration=qa_iteration,
            max_iterations=MAX_QA_ITERATIONS,
        )

        print(f"\n--- QA Iteration {qa_iteration}/{MAX_QA_ITERATIONS} ---")
        emit_phase(
            ExecutionPhase.QA_REVIEW, f"Running QA review iteration {qa_iteration}"
        )

        # Run QA reviewer with phase-specific model and thinking budget
        qa_model = get_phase_model(spec_dir, "qa", model)
        qa_thinking_budget = get_phase_thinking_budget(spec_dir, "qa")
        debug(
            "qa_loop",
            "Creating client for QA reviewer session...",
            model=qa_model,
            thinking_budget=qa_thinking_budget,
        )

        # Set SPEC_DIR environment variable for Playwright screenshot path resolution
        os.environ["SPEC_DIR"] = str(spec_dir.resolve())

        # Load project MCP config and set PLAYWRIGHT_HEADLESS if specified
        # This allows UI changes to .env to take effect immediately
        mcp_config = load_project_mcp_config(project_dir)
        if "PLAYWRIGHT_HEADLESS" in mcp_config:
            os.environ["PLAYWRIGHT_HEADLESS"] = mcp_config["PLAYWRIGHT_HEADLESS"]

        client = create_client(
            project_dir,
            spec_dir,
            qa_model,
            agent_type="qa_reviewer",
            max_thinking_tokens=qa_thinking_budget,
        )

        async with client:
            debug("qa_loop", "Running QA reviewer agent session...")
            status, response = await run_qa_agent_session(
                client,
                project_dir,  # Pass project_dir for capability-based tool injection
                spec_dir,
                qa_iteration,
                MAX_QA_ITERATIONS,
                verbose,
                previous_error=last_error_context,  # Pass error context for self-correction
            )

        iteration_duration = time_module.time() - iteration_start
        debug(
            "qa_loop",
            "QA reviewer session completed",
            status=status,
            duration_seconds=f"{iteration_duration:.1f}",
            response_length=len(response),
        )

        # =========================================================================
        # PROGRAMMATIC GATES - Run after agent session
        # =========================================================================
        # Gates can override agent verdict based on objective metrics
        qa_signoff = get_qa_signoff_status(spec_dir)
        history = get_iteration_history(spec_dir)

        gate_result = run_post_session_gates(
            spec_dir=spec_dir,
            qa_signoff=qa_signoff,
            agent_verdict=status,
            history=history,
            response_text=response,  # For verdict token verification
        )

        # Use gate's final verdict (may override agent)
        final_status = gate_result.final_verdict

        if gate_result.override_reason:
            debug_warning(
                "qa_loop",
                f"Gates overrode agent: {gate_result.override_reason}",
                agent_said=status,
                gates_say=final_status,
            )
            print(f"\n⚠️  Gate override: {gate_result.override_reason}")

        # Get recommended action from gates
        action = get_recommended_action(gate_result)
        debug(
            "qa_loop",
            "Gate recommended action",
            action=action["action"],
            reason=action["reason"],
        )

        # =========================================================================
        # END PROGRAMMATIC GATES
        # =========================================================================

        if final_status == "approved":
            emit_phase(ExecutionPhase.COMPLETE, "QA validation passed")
            # Reset error tracking on success
            consecutive_errors = 0
            last_error_context = None

            # Record successful iteration
            debug_success(
                "qa_loop",
                "QA APPROVED",
                iteration=qa_iteration,
                duration=f"{iteration_duration:.1f}s",
            )
            record_iteration(spec_dir, qa_iteration, "approved", [], iteration_duration)

            # Update plan status to human_review after QA approval
            plan = load_implementation_plan(spec_dir)
            if plan:
                plan["status"] = "human_review"
                plan["planStatus"] = "review"
                save_implementation_plan(spec_dir, plan)
                debug("qa_loop", "Updated plan status to human_review")

            print("\n" + "=" * 70)
            print("  ✅ QA APPROVED")
            print("=" * 70)
            print("\nAll acceptance criteria verified.")
            print("The implementation is production-ready.")
            print("\nNext steps:")
            print("  1. Review the ouro/* branch")
            print("  2. Create a PR and merge to main")

            # End validation phase successfully
            if task_logger:
                task_logger.end_phase(
                    LogPhase.VALIDATION,
                    success=True,
                    message="QA validation passed - all criteria met",
                )

            # Update Linear: QA approved, awaiting human review
            if linear_task and linear_task.task_id:
                await linear_qa_approved(spec_dir)
                print("\nLinear: Task marked as QA approved, awaiting human review")

            return True

        elif final_status == "rejected":
            # Reset error tracking on valid response (rejected is a valid response)
            consecutive_errors = 0
            last_error_context = None

            debug_warning(
                "qa_loop",
                "QA REJECTED",
                iteration=qa_iteration,
                duration=f"{iteration_duration:.1f}s",
            )
            print(f"\n❌ QA found issues. Iteration {qa_iteration}/{MAX_QA_ITERATIONS}")

            # Get issues from QA signoff (already fetched for gates)
            current_issues = qa_signoff.get("issues_found", []) if qa_signoff else []
            debug(
                "qa_loop",
                "Issues found by QA",
                issue_count=len(current_issues),
                issues=current_issues[:3] if current_issues else [],  # Show first 3
            )

            # Record rejected iteration
            record_iteration(
                spec_dir, qa_iteration, "rejected", current_issues, iteration_duration
            )

            # =====================================================================
            # GATE-BASED ROUTING - Use classification to determine next action
            # =====================================================================
            classification = gate_result.classification

            # Handle escalations based on gate classification
            if classification == IssueClassification.NEEDS_CREDENTIALS:
                debug_warning("qa_loop", "Gate classification: needs credentials")
                print("\n⚠️  Login credentials required for E2E testing.")
                await escalate_for_credentials(spec_dir, project_dir)

                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message="QA blocked: credentials required",
                    )

                return False

            if classification == IssueClassification.NEEDS_CONFIG:
                debug_warning("qa_loop", "Gate classification: needs config")
                print("\n⚠️  Dev server configuration required.")
                await escalate_for_dev_server(spec_dir, project_dir)

                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message="QA blocked: dev server config required",
                    )

                return False

            if classification == IssueClassification.RECURRING:
                from .report import RECURRING_ISSUE_THRESHOLD

                # Get recurring issues for escalation
                has_recurring_flag, recurring_issues = has_recurring_issues(
                    current_issues, history
                )

                debug_error(
                    "qa_loop",
                    "Gate classification: recurring issues",
                    recurring_count=len(recurring_issues),
                    threshold=RECURRING_ISSUE_THRESHOLD,
                )
                print(
                    f"\n⚠️  Recurring issues detected ({len(recurring_issues)} issue(s) appeared {RECURRING_ISSUE_THRESHOLD}+ times)"
                )
                print("Escalating to human review due to recurring issues...")

                await escalate_to_human(spec_dir, recurring_issues, qa_iteration)

                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message=f"QA escalated to human after {qa_iteration} iterations due to recurring issues",
                    )

                if linear_task and linear_task.task_id:
                    await linear_qa_max_iterations(spec_dir, qa_iteration)
                    print(
                        "\nLinear: Task marked as needing human intervention (recurring issues)"
                    )

                return False

            if classification == IssueClassification.NEEDS_HUMAN:
                debug_warning("qa_loop", "Gate classification: needs human judgment")
                print("\n⚠️  Issues require human judgment.")

                # Create escalation with the issues
                await escalate_recurring_issues(spec_dir, current_issues, qa_iteration)

                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message="QA escalated: issues need human judgment",
                    )

                if linear_task and linear_task.task_id:
                    await linear_qa_max_iterations(spec_dir, qa_iteration)

                return False

            # =====================================================================
            # AUTO-FIXABLE - Continue the loop
            # =====================================================================
            debug("qa_loop", "Gate classification: auto-fixable - continuing loop")

            # Show gate violations if any
            if gate_result.violations:
                print("\nGate violations (will be fixed):")
                for v in gate_result.violations:
                    print(f"  - {v.message}")

            # Record rejection in Linear
            if linear_task and linear_task.task_id:
                issues_count = len(current_issues)
                await linear_qa_rejected(spec_dir, issues_count, qa_iteration)

            if qa_iteration >= MAX_QA_ITERATIONS:
                print("\n⚠️  Maximum QA iterations reached.")
                print("Escalating to human review.")
                break

            # Run fixer with phase-specific thinking budget
            fixer_thinking_budget = get_phase_thinking_budget(spec_dir, "qa")
            debug(
                "qa_loop",
                "Starting QA fixer session...",
                model=qa_model,
                thinking_budget=fixer_thinking_budget,
            )
            emit_phase(ExecutionPhase.QA_FIXING, "Fixing QA issues")
            print("\nRunning QA Fixer Agent...")

            fix_client = create_client(
                project_dir,
                spec_dir,
                qa_model,
                agent_type="qa_fixer",
                max_thinking_tokens=fixer_thinking_budget,
            )

            async with fix_client:
                fix_status, fix_response = await run_qa_fixer_session(
                    fix_client, spec_dir, qa_iteration, verbose
                )

            debug(
                "qa_loop",
                "QA fixer session completed",
                fix_status=fix_status,
                response_length=len(fix_response),
            )

            if fix_status == "error":
                debug_error("qa_loop", f"Fixer error: {fix_response[:200]}")
                print(f"\n❌ Fixer encountered error: {fix_response}")
                record_iteration(
                    spec_dir,
                    qa_iteration,
                    "error",
                    [{"title": "Fixer error", "description": fix_response}],
                )
                break

            debug_success("qa_loop", "Fixes applied, re-running QA validation")
            print("\n✅ Fixes applied. Re-running QA validation...")

        elif final_status == "error":
            consecutive_errors += 1

            # Determine error message - use gate override reason if available
            error_message = gate_result.override_reason or response[:200]

            debug_error(
                "qa_loop",
                f"QA session error: {error_message}",
                consecutive_errors=consecutive_errors,
                max_consecutive=MAX_CONSECUTIVE_ERRORS,
                gate_override=gate_result.override_reason is not None,
            )
            print(f"\n❌ QA error: {error_message}")
            print(
                f"   Consecutive errors: {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS}"
            )
            record_iteration(
                spec_dir,
                qa_iteration,
                "error",
                [{"title": "QA error", "description": error_message}],
            )

            # Build error context for self-correction in next iteration
            # Include verdict token requirement if that was the issue
            if gate_result.override_reason and "token" in gate_result.override_reason.lower():
                expected_action = (
                    "You MUST output <qa-verdict>APPROVED</qa-verdict> or "
                    "<qa-verdict>REJECTED</qa-verdict> at the end of your response. "
                    "This token MUST match the status you write to qa_signoff in implementation_plan.json."
                )
                error_type = "missing_verdict_token"
            else:
                expected_action = (
                    "You MUST update implementation_plan.json with a qa_signoff object "
                    "containing 'status': 'approved' or 'status': 'rejected'"
                )
                error_type = "missing_implementation_plan_update"

            last_error_context = {
                "error_type": error_type,
                "error_message": error_message,
                "consecutive_errors": consecutive_errors,
                "expected_action": expected_action,
                "file_path": str(spec_dir / "implementation_plan.json"),
            }

            # Check if we've hit max consecutive errors
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                debug_error(
                    "qa_loop",
                    f"Max consecutive errors ({MAX_CONSECUTIVE_ERRORS}) reached - escalating to human",
                )
                print(
                    f"\n⚠️  {MAX_CONSECUTIVE_ERRORS} consecutive errors without progress."
                )
                print(
                    "The QA agent is unable to properly update implementation_plan.json."
                )
                print("Escalating to human review.")

                # End validation phase as failed
                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message=f"QA agent failed {MAX_CONSECUTIVE_ERRORS} consecutive times - unable to update implementation_plan.json",
                    )
                return False

            print("Retrying with error feedback...")

    # Max iterations reached without approval
    emit_phase(ExecutionPhase.FAILED, "QA validation incomplete")
    debug_error(
        "qa_loop",
        "QA VALIDATION INCOMPLETE - max iterations reached",
        iterations=qa_iteration,
        max_iterations=MAX_QA_ITERATIONS,
    )
    print("\n" + "=" * 70)
    print("  ⚠️  QA VALIDATION INCOMPLETE")
    print("=" * 70)
    print(f"\nReached maximum iterations ({MAX_QA_ITERATIONS}) without approval.")
    print("\nRemaining issues require human review:")

    # Show iteration summary
    history = get_iteration_history(spec_dir)
    summary = get_recurring_issue_summary(history)
    debug(
        "qa_loop",
        "QA loop final summary",
        total_iterations=len(history),
        total_issues=summary.get("total_issues", 0),
        unique_issues=summary.get("unique_issues", 0),
    )
    if summary["total_issues"] > 0:
        print("\n📊 Iteration Summary:")
        print(f"   Total iterations: {len(history)}")
        print(f"   Total issues found: {summary['total_issues']}")
        print(f"   Unique issues: {summary['unique_issues']}")
        if summary.get("most_common"):
            print("   Most common issues:")
            for issue in summary["most_common"][:3]:
                print(f"     - {issue['title']} ({issue['occurrences']} occurrences)")

    # End validation phase as failed
    if task_logger:
        task_logger.end_phase(
            LogPhase.VALIDATION,
            success=False,
            message=f"QA validation incomplete after {qa_iteration} iterations",
        )

    # Show the fix request file if it exists
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    if fix_request_file.exists():
        print(f"\nSee: {fix_request_file}")

    qa_report_file = spec_dir / "qa_report.md"
    if qa_report_file.exists():
        print(f"See: {qa_report_file}")

    # Update Linear: max iterations reached, needs human intervention
    if linear_task and linear_task.task_id:
        await linear_qa_max_iterations(spec_dir, qa_iteration)
        print("\nLinear: Task marked as needing human intervention")

    print("\nManual intervention required.")
    return False
