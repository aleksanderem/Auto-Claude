#!/usr/bin/env python3
"""
Manager Runner - Project Manager AI chat using Claude Opus 4.5

This script provides an AI-powered Project Manager that:
- Accepts user stories and breaks them into tasks
- Performs initial research on the codebase
- Monitors agent progress and provides guidance
- Has full MCP tool access for research
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env file with centralized error handling
from cli.utils import import_dotenv

load_dotenv = import_dotenv()

env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

try:
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False
    ClaudeAgentOptions = None
    ClaudeSDKClient = None

from core.auth import ensure_claude_code_oauth_token, get_auth_token
from debug import (
    debug,
    debug_detailed,
    debug_error,
    debug_section,
    debug_success,
)


def load_project_context(project_dir: str) -> str:
    """Load comprehensive project context for the Manager."""
    context_parts = []

    # Load project index
    # Check .ouro first, fallback to .auto-claude for backwards compatibility
    index_path = Path(project_dir) / ".ouro" / "project_index.json"
    if not index_path.exists():
        legacy_path = Path(project_dir) / ".auto-claude" / "project_index.json"
        if legacy_path.exists():
            index_path = legacy_path
    if index_path.exists():
        try:
            with open(index_path) as f:
                index = json.load(f)
            summary = {
                "project_root": index.get("project_root", ""),
                "project_type": index.get("project_type", "unknown"),
                "services": list(index.get("services", {}).keys()),
                "infrastructure": index.get("infrastructure", {}),
            }
            context_parts.append(
                f"## Project Structure\n```json\n{json.dumps(summary, indent=2)}\n```"
            )
        except Exception:
            pass

    # Load existing tasks/specs with status
    # Check .ouro first, fallback to .auto-claude for backwards compatibility
    specs_path = Path(project_dir) / ".ouro" / "specs"
    if not specs_path.exists():
        legacy_path = Path(project_dir) / ".auto-claude" / "specs"
        if legacy_path.exists():
            specs_path = legacy_path
    if specs_path.exists():
        try:
            task_summaries = []
            for spec_dir in sorted(specs_path.iterdir()):
                if spec_dir.is_dir():
                    plan_path = spec_dir / "implementation_plan.json"
                    if plan_path.exists():
                        with open(plan_path) as f:
                            plan = json.load(f)
                        task_summaries.append(
                            {
                                "spec": spec_dir.name,
                                "status": plan.get("status", "unknown"),
                                "feature": plan.get("feature", spec_dir.name),
                            }
                        )
            if task_summaries:
                context_parts.append(
                    f"## Current Tasks\n```json\n{json.dumps(task_summaries, indent=2)}\n```"
                )
        except Exception:
            pass

    # Load roadmap if available
    # Check .ouro first, fallback to .auto-claude for backwards compatibility
    roadmap_path = Path(project_dir) / ".ouro" / "roadmap" / "roadmap.json"
    if not roadmap_path.exists():
        legacy_path = Path(project_dir) / ".auto-claude" / "roadmap" / "roadmap.json"
        if legacy_path.exists():
            roadmap_path = legacy_path
    if roadmap_path.exists():
        try:
            with open(roadmap_path) as f:
                roadmap = json.load(f)
            features = roadmap.get("features", [])
            feature_summary = [
                {"title": f.get("title", ""), "status": f.get("status", "")}
                for f in features[:5]
            ]
            context_parts.append(
                f"## Roadmap Features\n```json\n{json.dumps(feature_summary, indent=2)}\n```"
            )
        except Exception:
            pass

    return (
        "\n\n".join(context_parts)
        if context_parts
        else "No project context available yet."
    )


def build_system_prompt(project_dir: str, auto_claude_source: str | None = None) -> str:
    """Build the system prompt for the Project Manager."""
    context = load_project_context(project_dir)

    return f"""# Project Manager

You are the Project Manager - the layer between the user and the autonomous development system.

**Hierarchy:** User <=> You (Manager) <=> Orchestrator (run.py) => Agents

## Your Role

You MANAGE, you don't EXECUTE. You:
- Talk to the user, understand their needs
- Break stories into specs (tasks)
- Tell the orchestrator what to run and when
- Monitor progress, report status
- Make strategic decisions about priorities

You DO NOT:
- Write code (Coder agent does that)
- Plan implementation details (Planner agent does that)
- Do QA (QA Reviewer does that)
- Fix bugs directly (QA Fixer does that)

When you create a spec - you hand it off. The orchestrator and agents take over.

## Project: `{project_dir}`

{context}

## Agents (managed by Orchestrator)

| Agent | Role |
|-------|------|
| Planner | Creates implementation plan with subtasks |
| Coder | Implements code, can spawn subagents |
| QA Reviewer | Validates against acceptance criteria |
| QA Fixer | Fixes issues in QA loop |

You don't interfere with them. You start builds, monitor progress, decide what's next.

## Commands (from `{auto_claude_source or "apps/backend"}`)

```bash
# Create spec (hands off to spec agents)
python spec_runner.py --task "description"

# Start build (hands off to orchestrator)
python run.py --spec 001

# Check status
python run.py --list
python run.py --spec 001 --qa-status

# After completion
python run.py --spec 001 --review   # User reviews
python run.py --spec 001 --merge    # Merge to main
```

## Status Files (read-only for you!)

| What | Where |
|------|-------|
| All specs | `.ouro/specs/` |
| Spec status | `implementation_plan.json` → status field |
| QA results | `qa_report.md` |
| Issues | `QA_FIX_REQUEST.md` |

Read these ONLY to check status and report to user. Never modify or "fix" them.
If something looks wrong (empty phases, missing subtasks) - that's fine, just run the build and Planner will handle it.

## Your Workflow

1. User describes what they want
2. You clarify requirements, break into specs
3. Create specs: `python spec_runner.py --task "..."`
4. Start builds: `python run.py --spec XXX` - this runs the FULL pipeline (Planner → Coder → QA)
5. Monitor with: `python run.py --list` and reading status files
6. Report to user, help with reviews/merges

**IMPORTANT:** Don't manually analyze or fix implementation_plan.json, phases, subtasks etc.
That's Planner's job. Just run `python run.py --spec XXX` and the orchestrator handles everything.

## Git & GitHub

```bash
git status / git log / gh issue list / gh pr list
```

Use for: checking state, viewing issues/PRs. The orchestrator handles commits in worktrees.

## Tools

Read, Glob, Grep - for checking status.
Bash - ONLY for these commands:
- `python spec_runner.py --task "..."`
- `python run.py --spec XXX`
- `python run.py --list`
- `git status`, `gh issue list`, `gh pr list`

## CRITICAL: RESPOND TO USER REQUESTS ONLY

**Do EXACTLY what user asks. Nothing more, nothing less.**

User says "build spec 020" → run `python run.py --spec 020`. Done.
User says "create login feature" → run `python spec_runner.py --task "login feature"`. Done.
User says "what's the status?" → run `python run.py --list` and report. Done.

**DO NOT:**
- Analyze gaps ("specs 017-023 are missing") - user didn't ask
- Create specs user didn't request
- Chain multiple actions ("I'll create 5 specs then build them all")
- Make strategic decisions about what SHOULD be done
- Over-explain or over-analyze

**DO:**
- Execute the ONE thing user asked for
- Report the result
- Wait for next instruction

You are a COMMAND EXECUTOR, not a strategist. User is the strategist.

## SAFETY RULES

🚫 **FORBIDDEN:**
- Taking initiative (creating/building things user didn't ask for)
- Analyzing code (QA agent does that)
- Suggesting code changes (Coder agent does that)
- Chaining multiple commands without being asked

✅ **ALLOWED:**
- Executing ONE command user requested
- Checking status with `python run.py --list`
- Reading files to answer user's question
- Reporting results concisely

---
**REMINDER: ONE action per user message. No initiative. No chaining. Execute → Report → Stop.**
"""


async def run_manager_query(
    project_dir: str,
    message: str,
    history: list,
    auto_claude_source: str | None = None,
    images: list | None = None,
) -> None:
    """Run the manager query using Claude SDK with Opus 4.5."""
    if not SDK_AVAILABLE:
        print("Claude SDK not available", file=sys.stderr)
        sys.exit(1)

    if not get_auth_token():
        print("No authentication token found", file=sys.stderr)
        sys.exit(1)

    # Ensure SDK can find the token
    ensure_claude_code_oauth_token()

    system_prompt = build_system_prompt(project_dir, auto_claude_source)
    project_path = Path(project_dir).resolve()

    # Build conversation context from history
    conversation_context = ""
    for msg in history[:-1]:  # Exclude the latest message
        role = "User" if msg.get("role") == "user" else "Assistant"
        conversation_context += f"\n{role}: {msg['content']}\n"

    # Build the full prompt with conversation history
    full_prompt = message
    if conversation_context.strip():
        full_prompt = f"""Previous conversation:
{conversation_context}

Current message: {message}"""

    # Build message content with images if provided
    # Format: [{"type": "image", "source": {"type": "base64", "media_type": "...", "data": "..."}}, {"type": "text", "text": "..."}]
    message_content = []
    if images:
        for img in images:
            if img.get("data") and img.get("mimeType"):
                message_content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img["mimeType"],
                            "data": img["data"],
                        },
                    }
                )
        debug(
            "manager_runner",
            "Added images to message",
            image_count=len(message_content),
        )

    # Add text content
    message_content.append({"type": "text", "text": full_prompt})

    # If we have structured content (images), we need to pass it differently
    # The SDK query method may need the full content array
    has_images = len(message_content) > 1

    debug(
        "manager_runner",
        "Using Claude Opus 4.5 for Project Manager",
        project_dir=project_dir,
    )

    try:
        # Create Claude SDK client with Opus 4.5 and research tools
        client = ClaudeSDKClient(
            options=ClaudeAgentOptions(
                model="claude-opus-4-5-20251101",  # Opus 4.5
                system_prompt=system_prompt,
                allowed_tools=[
                    "Read",
                    "Glob",
                    "Grep",
                    "Bash",
                ],
                max_turns=5,  # Limit chaining - one task at a time
                cwd=str(project_path),
            )
        )

        # Use async context manager pattern
        async with client:
            # Send the query - use structured content if we have images
            if has_images:
                await client.query(message_content)
            else:
                await client.query(full_prompt)

            # Stream the response
            response_text = ""
            current_tool = None

            async for msg in client.receive_response():
                msg_type = type(msg).__name__
                debug_detailed("manager_runner", "Received message", msg_type=msg_type)

                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__
                        if block_type == "TextBlock" and hasattr(block, "text"):
                            text = block.text
                            # Print text with newline for proper parsing
                            print(text, flush=True)
                            response_text += text
                        elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                            # Emit tool start marker for UI feedback
                            tool_name = block.name
                            tool_input = ""

                            if hasattr(block, "input") and block.input:
                                inp = block.input
                                if isinstance(inp, dict):
                                    if "pattern" in inp:
                                        tool_input = f"pattern: {inp['pattern']}"
                                    elif "file_path" in inp:
                                        fp = inp["file_path"]
                                        if len(fp) > 50:
                                            fp = "..." + fp[-47:]
                                        tool_input = fp
                                    elif "path" in inp:
                                        tool_input = inp["path"]

                            current_tool = tool_name
                            print(
                                f"__TOOL_START__:{json.dumps({'name': tool_name, 'input': tool_input})}",
                                flush=True,
                            )

                elif msg_type == "ToolResult":
                    if current_tool:
                        print(
                            f"__TOOL_END__:{json.dumps({'name': current_tool})}",
                            flush=True,
                        )
                        current_tool = None

            # Ensure we have a newline at the end
            if response_text and not response_text.endswith("\n"):
                print()

            debug(
                "manager_runner",
                "Response complete",
                response_length=len(response_text),
            )

    except Exception as e:
        print(f"Error using Claude SDK: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Project Manager AI Chat Runner")
    parser.add_argument("--project-dir", required=True, help="Project directory path")
    parser.add_argument("--message", required=True, help="User message")
    parser.add_argument("--history", default="[]", help="JSON conversation history")
    parser.add_argument(
        "--history-file", help="Path to JSON file containing conversation history"
    )
    parser.add_argument(
        "--images-file", help="Path to JSON file containing images (base64)"
    )
    parser.add_argument(
        "--auto-claude-source",
        help="Path to Ouro source (DEV mode, legacy flag name for backwards compatibility)",
    )
    args = parser.parse_args()

    debug_section("manager_runner", "Starting Project Manager Chat")

    project_dir = args.project_dir
    user_message = args.message
    auto_claude_source = args.auto_claude_source  # Legacy name, refers to Ouro source

    debug(
        "manager_runner",
        "Arguments",
        project_dir=project_dir,
        message_length=len(user_message),
        auto_claude_source=auto_claude_source,
    )

    # Load history from file if provided, otherwise parse inline JSON
    try:
        if args.history_file:
            debug("manager_runner", "Loading history from file", file=args.history_file)
            with open(args.history_file, encoding="utf-8") as f:
                history = json.load(f)
            debug_detailed(
                "manager_runner",
                "Loaded history from file",
                history_length=len(history),
            )
        else:
            history = json.loads(args.history)
            debug_detailed(
                "manager_runner", "Parsed inline history", history_length=len(history)
            )
    except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
        debug_error("manager_runner", f"Failed to load history: {e}")
        history = []

    # Load images from file if provided
    images = []
    if args.images_file:
        try:
            debug("manager_runner", "Loading images from file", file=args.images_file)
            with open(args.images_file, encoding="utf-8") as f:
                images = json.load(f)
            debug_detailed(
                "manager_runner",
                "Loaded images from file",
                image_count=len(images),
            )
        except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
            debug_error("manager_runner", f"Failed to load images: {e}")
            images = []

    # Run the async SDK function
    debug("manager_runner", "Running SDK query")
    asyncio.run(
        run_manager_query(
            project_dir, user_message, history, auto_claude_source, images
        )
    )
    debug_success("manager_runner", "Query completed")


if __name__ == "__main__":
    main()
