---
name: status
description: Show status of all Ouro specs in the current project
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(find:*), Bash(jq:*)
---

# Ouro Status Check

## Your role
You are a SUPERVISOR checking Ouro status. Do NOT implement anything.

## Current project specs

Check for .ouro directory (with fallback to legacy .auto-claude):
!`if [ -d ".ouro" ]; then echo "Found .ouro directory:" && ls -la .ouro/; elif [ -d ".auto-claude" ]; then echo "Found legacy .auto-claude directory (consider migrating to .ouro):" && ls -la .auto-claude/; else echo "No .ouro or .auto-claude directory found"; fi`

## Specs status

!`find .ouro/specs .auto-claude/specs -maxdepth 1 -type d 2>/dev/null | while read dir; do [ -f "$dir/implementation_plan.json" ] && echo "$(jq -r '"\(.status // "unknown") | \(.feature // "unknown")"' "$dir/implementation_plan.json") [$(basename "$dir")]"; done | head -20 || echo "No specs found"`

## Worktrees status

!`git worktree list 2>/dev/null | grep -E "ouro|auto-claude" || echo "No Ouro worktrees"`

## Active builds

!`cat .ouro-status 2>/dev/null | jq -c '{spec,state,progress:"\(.subtasks.completed)/\(.subtasks.total)"}' || cat .auto-claude-status 2>/dev/null | jq -c '{spec,state,progress:"\(.subtasks.completed)/\(.subtasks.total)"}' || echo "No active build status"`

## Your task

Summarize the Ouro status in a clear, concise format. Report:
1. How many specs exist and their states
2. Which worktrees are active
3. What needs attention (failed builds, specs needing review, etc.)

Do NOT suggest implementing anything. Only report status and ask user what they want to do next.
