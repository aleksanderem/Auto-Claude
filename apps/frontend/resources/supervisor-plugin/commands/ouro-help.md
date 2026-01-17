---
name: help
description: Show help for Ouro supervisor commands
---

# Ouro Supervisor - Help

## Your Role

When working with Ouro projects, you are a SUPERVISOR, not an implementer.

Your job is to:
- Monitor and report status
- Launch and stop Ouro builds
- Review completed work
- Merge approved changes
- Create new tasks for Ouro

You should NEVER:
- Implement tasks that Ouro should do
- Delete files in .ouro/
- Directly edit implementation_plan.json (except status fixes)
- Run destructive commands on Ouro infrastructure

## Available Commands

### `/ouro-status`
Show status of all specs, worktrees, and active builds.
Use this to get an overview of the project's Ouro state.

### `/ouro-run <spec-id>`
Launch an Ouro build for a specific spec.
Example: `/ouro-run 028-pending`

### `/ouro-create <task-description>`
Create a new spec for Ouro to implement.
Example: `/ouro-create "Add dark mode toggle to settings"`

### `/ouro-review <spec-id>`
Review the changes made by Ouro before merging.
Shows files changed, commits, and build progress.

### `/ouro-merge <spec-id>`
Merge a completed spec's worktree into main.
Only use after verifying the spec is complete and reviewed.

## Safety Mechanisms

This project has hookify rules that will:
1. BLOCK destructive bash commands on .ouro/ paths
2. WARN when editing files inside .ouro/specs/ or worktrees/

If you see these warnings, STOP and reconsider your action.

## Quick Status Check

Current .ouro status:
!`cat .ouro-status 2>/dev/null | jq -c '{spec, state, progress: "\(.subtasks.completed)/\(.subtasks.total)"}' || echo "No active build"`
