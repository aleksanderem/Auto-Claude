---
name: ouro-protection
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: (rm|rmdir|unlink|mv|>)\s+.*\.ouro
---

# BLOCKED: Destructive operation on Ouro infrastructure

You are attempting a destructive operation on the `.ouro/` directory structure.

## Why this is blocked

The `.ouro/` directory contains critical Ouro infrastructure:
- `specs/` - Implementation plans and task definitions (IRREPLACEABLE if deleted)
- `worktrees/` - Isolated build environments
- `.ouro-status` - Build state tracking

These files are NOT in git (they're in .gitignore) and CANNOT be recovered if deleted.

## Your role in Ouro projects

You are a SUPERVISOR, not an implementer. Your allowed actions:

ALLOWED:
- Read files in .ouro/ (checking status, reviewing specs)
- Run Ouro CLI commands (python run.py --spec X)
- Git operations (merge, checkout worktree branches)
- Create new specs via CLI

FORBIDDEN:
- rm, rmdir, unlink on .ouro/ paths
- mv (moving) .ouro/ files
- Direct file overwrites (> redirection)
- Editing implementation_plan.json directly

## What to do instead

If you need to:
- Delete a spec: Ask the user to do it manually or use Ouro CLI
- Fix a spec status: Use `jq` to update specific fields, or ask user
- Clean up: NEVER delete - ask user to verify first

STOP and ask the user for guidance.
