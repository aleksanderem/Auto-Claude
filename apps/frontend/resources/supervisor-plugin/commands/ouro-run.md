---
name: run
description: Run a specific Ouro spec via CLI
allowed-tools: Bash(python:*), Bash(cd:*)
args: spec-id
---

# Run Ouro Spec

## Your role
You are launching an Ouro build. You do NOT implement the work yourself.

## Arguments
Spec ID to run: {{args}}

## Pre-flight checks

Current directory: !`pwd`

Check if Ouro CLI exists:
!`ls /Users/alex/projects/Ouro/apps/backend/run.py 2>/dev/null && echo "CLI found" || echo "CLI not found"`

Check if spec exists:
!`ls .ouro/specs/{{args}}*/implementation_plan.json 2>/dev/null | head -1 || echo "Spec not found"`

## Your task

1. If spec exists and CLI is available, run:
   ```bash
   cd /Users/alex/projects/Ouro/apps/backend && python run.py --spec {{args}} --project-dir "$(pwd)" --force --auto-continue
   ```

2. If spec doesn't exist, inform the user and suggest using `/ouro-create` instead.

3. After launching, explain that Ouro will run in the background and how to monitor progress.

IMPORTANT: You are LAUNCHING Ouro, not doing the implementation work yourself.
