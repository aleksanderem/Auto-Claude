# GrepAI Semantic Code Search

GrepAI enables semantic search of codebases by intent rather than exact text matching.

## When to Use GrepAI

Use GrepAI when you need to find code by what it DOES, not by its name:

- "Where is user authentication handled?"
- "Find the error handling logic for API requests"
- "What code manages database connections?"
- "How are file uploads processed?"

## When to Use Standard Grep/Glob

Use standard tools for exact matches:

- Specific function names: `Grep "func NewIndexer"`
- Import statements: `Grep "import.*cobra"`
- File patterns: `Glob "**/*.go"`

## Commands

### Semantic Search
```bash
grepai search "your query" --json --compact
```

Options:
- `--json --compact` - Machine-readable output format
- `-n 10` - Limit results (default: 10)
- `--include "*.py"` - Filter by file pattern
- `--exclude "tests/*"` - Exclude patterns

### Call Graph Analysis
```bash
# Find what calls a function
grepai trace callers "FunctionName"

# Find what a function calls
grepai trace callees "FunctionName"

# Full call graph with depth
grepai trace graph "FunctionName" --depth 3
```

## Best Practices

1. **Describe intent, not code**: Search for "user authentication flow" not "HandleLogin"
2. **Be specific**: "database connection pooling" is better than "database"
3. **Use natural language**: GrepAI understands English descriptions
4. **Combine with Grep**: Use GrepAI to find relevant files, then Grep for exact symbols

## Examples

Instead of:
```bash
grep -r "authenticate" .
```

Use:
```bash
grepai search "user authentication and session management" --json --compact
```

Instead of:
```bash
grep -r "error" . | grep -i "handler"
```

Use:
```bash
grepai search "error handling middleware" --json --compact
```

## Availability

GrepAI is available when:
1. The `grepai` CLI is installed
2. The project has been initialized with `grepai init`
3. The watch daemon is running (`grepai watch`)

If GrepAI is unavailable, fall back to standard Grep/Glob tools.
