# Health Check Code Quality Improvements

Issues identified by automated code review (qodo-code-review) on PR #5.
These are pre-existing issues in `settings-handlers.ts`, not introduced by the CPU spike fix.

## High Priority

- [ ] **Cross-platform venv path** - Windows uses `.venv\Scripts\python.exe`, not `.venv/bin/python`
  - File: `apps/frontend/src/main/ipc-handlers/settings-handlers.ts` line 452-453
  - Fix:
    ```typescript
    const venvPythonPath = process.platform === 'win32'
      ? path.join(sourcePath, '.venv', 'Scripts', 'python.exe')
      : path.join(sourcePath, '.venv', 'bin', 'python');
    ```

## Medium Priority

- [ ] **Add health check timeout** - Python process can hang indefinitely, needs 30s timeout with kill
  - File: `apps/frontend/src/main/ipc-handlers/settings-handlers.ts` line 514-523
  - Fix: Add `setTimeout` to kill process after 30s

- [ ] **Raw errors exposed** - stderr and parseError sent directly to renderer, may expose sensitive info
  - File: `apps/frontend/src/main/ipc-handlers/settings-handlers.ts` line 554-575
  - Fix: Sanitize error messages before sending to renderer

## Low Priority

- [ ] **Improve Git root detection** - Replace fragile `../..` path with recursive `.git` directory search
  - File: `apps/frontend/src/main/ipc-handlers/settings-handlers.ts` line 419-425

- [ ] **Exclude .env existence from health** - Don't fail health check if `.env` file doesn't exist
  - File: `apps/backend/health_check.py` line 247

- [ ] **Fix env var mismatch detection** - Empty string from .env should equal None from runtime
  - File: `apps/backend/health_check.py` line 232-241

## Reference

- PR #5 automated review comments
- Original detection: qodo-code-review bot
- Date: 2026-01-15
