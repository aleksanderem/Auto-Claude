---
name: ouro-file-protection
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.ouro/(specs|worktrees)/.*\.(json|txt)$
---

# WARNING: Editing Ouro infrastructure file

You are about to edit a file inside `.ouro/specs/` or `.ouro/worktrees/`.

## Before proceeding, verify:

1. Is this a READ operation? Reading is fine.
2. Is this a STATUS UPDATE? Allowed if you're fixing status fields (e.g., "human_review" -> "done")
3. Is this IMPLEMENTATION WORK? STOP - Ouro should do this, not you.

## Safe edits (allowed with caution):
- Updating `status` field in implementation_plan.json
- Fixing `.ouro-status` state values
- Adding notes to build-progress.txt

## Unsafe edits (should not do):
- Changing subtask content or descriptions
- Modifying file lists or verification criteria
- Rewriting implementation plans

## Remember your role

You are SUPERVISING Ouro, not replacing it. If the user asks you to "fix" something in a spec:
1. First check if Ouro CLI can do it
2. If manual edit needed, make MINIMAL changes
3. Document what you changed and why

If unsure, ASK THE USER before proceeding.
