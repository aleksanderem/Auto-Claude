---
name: merge
description: Merge a completed Ouro spec worktree to main
allowed-tools: Bash(git:*)
args: spec-id
---

# Merge Ouro Spec

## Your role
You are merging completed Ouro work. You review but do NOT implement.

## Arguments
Spec ID to merge: {{args}}

## Pre-merge checks

Current branch: !`git branch --show-current`

Worktree status:
!`git worktree list | grep "{{args}}" || echo "No worktree found for {{args}}"`

Spec status:
!`cat .ouro/specs/{{args}}*/implementation_plan.json 2>/dev/null | jq '{status, feature, completed: [.phases[].subtasks[] | select(.status == "completed")] | length, total: [.phases[].subtasks[]] | length}' || echo "Spec not found"`

## Your task

1. Verify the spec is complete (status: "done" or "human_review" with all subtasks completed)

2. If complete, merge using:
   ```bash
   git merge --no-edit ouro/{{args}}
   ```

3. If there are conflicts, help resolve them but do NOT add new implementation code.

4. After merge, push if the user wants:
   ```bash
   git push
   ```

IMPORTANT: You are MERGING existing work, not implementing new features.
