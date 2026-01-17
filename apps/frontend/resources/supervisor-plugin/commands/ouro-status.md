---
name: status
description: Show status of all Ouro specs in the current project
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(find:*), Bash(jq:*)
---

# Ouro Status Check

## Your role
You are a SUPERVISOR checking Ouro status. Do NOT implement anything.

## Current project specs

Check for .ouro directory:
!`ls -la .ouro/ 2>/dev/null || echo "No .ouro directory found"`

## Specs status

!`for dir in .ouro/specs/*/; do
  if [ -d "$dir" ]; then
    spec=$(basename "$dir")
    status=$(cat "${dir}implementation_plan.json" 2>/dev/null | jq -r '.status // "unknown"')
    completed=$(cat "${dir}implementation_plan.json" 2>/dev/null | jq '[.phases[].subtasks[] | select(.status == "completed")] | length')
    total=$(cat "${dir}implementation_plan.json" 2>/dev/null | jq '[.phases[].subtasks[]] | length')
    feature=$(cat "${dir}implementation_plan.json" 2>/dev/null | jq -r '.feature // "unknown"')
    echo "[$status] $spec: $feature ($completed/$total subtasks)"
  fi
done 2>/dev/null || echo "No specs found"`

## Worktrees status

!`git worktree list 2>/dev/null | grep ouro || echo "No Ouro worktrees"`

## Active builds

!`cat .ouro-status 2>/dev/null | jq '{active_spec: .spec, state: .state, progress: "\(.subtasks.completed)/\(.subtasks.total)"}' || echo "No active build status"`

## Your task

Summarize the Ouro status in a clear, concise format. Report:
1. How many specs exist and their states
2. Which worktrees are active
3. What needs attention (failed builds, specs needing review, etc.)

Do NOT suggest implementing anything. Only report status and ask user what they want to do next.
