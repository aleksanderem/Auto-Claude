"""
QA Validation Package
=====================

Modular QA validation system with:
- Acceptance criteria validation
- Issue tracking and reporting
- Recurring issue detection
- QA reviewer and fixer agents
- Main orchestration loop
- Prerequisites checking and human escalation (NEW)
- QA configuration management (credentials, dev server) (NEW)

Usage:
    from qa import run_qa_validation_loop, should_run_qa, is_qa_approved

Module structure:
    - loop.py: Main QA orchestration loop
    - reviewer.py: QA reviewer agent session
    - fixer.py: QA fixer agent session
    - report.py: Issue tracking, reporting, escalation
    - criteria.py: Acceptance criteria and status management
    - config.py: QA configuration (credentials, dev server) (NEW)
    - escalation.py: Human escalation mechanisms (NEW)
"""

# QA Configuration (NEW)
from .config import (
    QAConfig,
    check_qa_prerequisites,
    detect_login_requirement,
    get_dev_server_config,
    get_login_credentials,
    has_dev_server_config,
    has_login_credentials,
    load_qa_config,
    save_qa_config,
    set_dev_server_config,
    set_login_credentials,
)

# Criteria & status
from .criteria import (
    get_qa_iteration_count,
    get_qa_signoff_status,
    is_fixes_applied,
    is_qa_approved,
    is_qa_rejected,
    load_implementation_plan,
    print_qa_status,
    save_implementation_plan,
    should_run_fixes,
    should_run_qa,
)
from .fixer import (
    load_qa_fixer_prompt,
    run_qa_fixer_session,
)

# Main loop
from .loop import MAX_QA_ITERATIONS, run_qa_validation_loop

# Report & tracking
from .report import (
    ISSUE_SIMILARITY_THRESHOLD,
    RECURRING_ISSUE_THRESHOLD,
    _issue_similarity,
    # Private functions exposed for testing
    _normalize_issue_key,
    check_test_discovery,
    create_manual_test_plan,
    escalate_to_human,
    get_iteration_history,
    get_recurring_issue_summary,
    has_recurring_issues,
    is_no_test_project,
    record_iteration,
)

# Agent sessions
from .reviewer import run_qa_agent_session

# Escalation mechanisms (NEW)
from .escalation import (
    clear_escalation,
    escalate_for_credentials,
    escalate_for_dev_server,
    escalate_recurring_issues,
    has_pending_escalation,
)

# Programmatic gates (NEW)
from .gates import (
    GateResult,
    GateViolation,
    GateViolationType,
    IssueClassification,
    get_recommended_action,
    run_post_session_gates,
)

# QA Subtasks (NEW)
from .subtasks import (
    QASubtask,
    QASubtasksResult,
    add_qa_subtask,
    create_qa_subtasks_from_spec,
    get_qa_subtasks_result,
    initialize_qa_subtasks,
    load_qa_subtasks,
    parse_acceptance_criteria_from_spec,
    save_qa_subtasks,
    update_qa_subtask_status,
    verify_all_subtasks_complete,
)

# Public API
__all__ = [
    # Configuration
    "MAX_QA_ITERATIONS",
    "RECURRING_ISSUE_THRESHOLD",
    "ISSUE_SIMILARITY_THRESHOLD",
    # Main loop
    "run_qa_validation_loop",
    # QA Config (NEW)
    "QAConfig",
    "load_qa_config",
    "save_qa_config",
    "get_login_credentials",
    "set_login_credentials",
    "has_login_credentials",
    "get_dev_server_config",
    "set_dev_server_config",
    "has_dev_server_config",
    "check_qa_prerequisites",
    "detect_login_requirement",
    # Escalation (NEW)
    "escalate_for_credentials",
    "escalate_for_dev_server",
    "escalate_recurring_issues",
    "has_pending_escalation",
    "clear_escalation",
    # Programmatic gates (NEW)
    "GateResult",
    "GateViolation",
    "GateViolationType",
    "IssueClassification",
    "run_post_session_gates",
    "get_recommended_action",
    # QA Subtasks (NEW)
    "QASubtask",
    "QASubtasksResult",
    "parse_acceptance_criteria_from_spec",
    "create_qa_subtasks_from_spec",
    "load_qa_subtasks",
    "save_qa_subtasks",
    "initialize_qa_subtasks",
    "add_qa_subtask",
    "update_qa_subtask_status",
    "get_qa_subtasks_result",
    "verify_all_subtasks_complete",
    # Criteria & status
    "load_implementation_plan",
    "save_implementation_plan",
    "get_qa_signoff_status",
    "is_qa_approved",
    "is_qa_rejected",
    "is_fixes_applied",
    "get_qa_iteration_count",
    "should_run_qa",
    "should_run_fixes",
    "print_qa_status",
    # Report & tracking
    "get_iteration_history",
    "record_iteration",
    "has_recurring_issues",
    "get_recurring_issue_summary",
    "escalate_to_human",
    "create_manual_test_plan",
    "check_test_discovery",
    "is_no_test_project",
    "_normalize_issue_key",
    "_issue_similarity",
    # Agent sessions
    "run_qa_agent_session",
    "load_qa_fixer_prompt",
    "run_qa_fixer_session",
]
