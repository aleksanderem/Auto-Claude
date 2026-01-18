---
name: create
description: Create a new Ouro spec for a task
allowed-tools: Bash(python:*), Bash(cd:*)
args: task-description
---

# Create Ouro Spec

## Your role
You are creating a new task for Ouro to implement. You do NOT implement it yourself.

## Arguments
Task description: {{args}}

## Pre-flight checks

Ouro CLI location:
!`ls /Users/alex/projects/Ouro/apps/backend/runners/spec_runner.py 2>/dev/null && echo "Spec runner found" || echo "Spec runner not found"`

Current project:
!`pwd`

Existing specs:
!`ls .ouro/specs/ 2>/dev/null || echo "No specs directory yet"`

## Your task

1. Create a new spec using the Ouro spec runner:
   ```bash
   cd /Users/alex/projects/Ouro/apps/backend && python runners/spec_runner.py --task "{{args}}" --project-dir "$(pwd)"
   ```

2. If interactive mode is needed:
   ```bash
   cd /Users/alex/projects/Ouro/apps/backend && python runners/spec_runner.py --interactive --project-dir "$(pwd)"
   ```

3. After creation, explain:
   - Where the spec was created
   - How to run it with `/ouro-run <spec-id>`
   - How to monitor progress

IMPORTANT: You are DELEGATING work to Ouro, not implementing it yourself.
