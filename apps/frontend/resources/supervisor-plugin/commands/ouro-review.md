---
name: review
description: Review changes in an Ouro spec worktree before merging
allowed-tools: Bash(git:*), Bash(cat:*), Bash(ls:*)
args: spec-id
---

# Review Ouro Spec

## Your role
You are REVIEWING Ouro's work. You do NOT implement or modify.

## Arguments
Spec ID to review: {{args}}

## Spec information

Feature description:
!`cat .ouro/specs/{{args}}*/implementation_plan.json 2>/dev/null | jq -r '.feature' || echo "Spec not found"`

Completion status:
!`cat .ouro/specs/{{args}}*/implementation_plan.json 2>/dev/null | jq '{status, completed: [.phases[].subtasks[] | select(.status == "completed")] | length, total: [.phases[].subtasks[]] | length}'`

## Changes to review

Files changed vs main:
!`git diff main...ouro/{{args}} --stat 2>/dev/null | tail -20 || echo "Cannot diff - worktree may not exist"`

Commits in this spec:
!`git log main..ouro/{{args}} --oneline 2>/dev/null | head -20 || echo "Cannot get log"`

## Build progress

!`cat .ouro/specs/{{args}}*/build-progress.txt 2>/dev/null | tail -30 || echo "No build progress"`

## Your task

1. Summarize what this spec implements
2. List the key files changed
3. Note any potential issues (large diffs, many files, sensitive areas)
4. Recommend whether to merge or request changes

Do NOT modify any files. Only review and report.
