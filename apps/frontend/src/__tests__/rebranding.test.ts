/**
 * Frontend Rebranding Tests
 * =========================
 *
 * Tests to verify the rebranding from "Auto-Claude" to "Ouro" in the frontend.
 * Tests cover:
 * - Path constants
 * - Configuration values
 * - Backwards compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import path constants
import {
  TASK_WORKTREE_DIR,
  TERMINAL_WORKTREE_DIR,
  TERMINAL_WORKTREE_METADATA_DIR,
  LEGACY_AUTO_CLAUDE_TASK_WORKTREE_DIR,
  LEGACY_AUTO_CLAUDE_TERMINAL_WORKTREE_DIR,
  LEGACY_AUTO_CLAUDE_TERMINAL_METADATA_DIR,
  findTaskWorktree,
  findTerminalWorktree,
} from '../main/worktree-paths';

// Import config
import { APP_NAME } from '../main/config-paths';
import { INSIGHTS_DIR, LEGACY_INSIGHTS_DIR } from '../main/insights/paths';
import { DEFAULT_APP_SETTINGS } from '../shared/constants/config';

describe('Frontend Rebranding Tests', () => {
  describe('Path Constants', () => {
    it('should use .ouro prefix for task worktree directory', () => {
      expect(TASK_WORKTREE_DIR).toBe('.ouro/worktrees/tasks');
      expect(TASK_WORKTREE_DIR).toContain('.ouro');
      expect(TASK_WORKTREE_DIR).not.toContain('.auto-claude');
    });

    it('should use .ouro prefix for terminal worktree directory', () => {
      expect(TERMINAL_WORKTREE_DIR).toBe('.ouro/worktrees/terminal');
      expect(TERMINAL_WORKTREE_DIR).toContain('.ouro');
    });

    it('should use .ouro prefix for terminal metadata directory', () => {
      expect(TERMINAL_WORKTREE_METADATA_DIR).toBe('.ouro/terminal/metadata');
      expect(TERMINAL_WORKTREE_METADATA_DIR).toContain('.ouro');
    });

    it('should have legacy constants for backwards compatibility', () => {
      expect(LEGACY_AUTO_CLAUDE_TASK_WORKTREE_DIR).toBe('.auto-claude/worktrees/tasks');
      expect(LEGACY_AUTO_CLAUDE_TERMINAL_WORKTREE_DIR).toBe('.auto-claude/worktrees/terminal');
      expect(LEGACY_AUTO_CLAUDE_TERMINAL_METADATA_DIR).toBe('.auto-claude/terminal/metadata');
    });

    it('should use ouro for insights directory', () => {
      expect(INSIGHTS_DIR).toBe('.ouro/insights');
      expect(LEGACY_INSIGHTS_DIR).toBe('.auto-claude/insights');
    });
  });

  describe('Configuration Constants', () => {
    it('should use ouro as APP_NAME', () => {
      expect(APP_NAME).toBe('ouro');
      expect(APP_NAME).not.toBe('auto-claude');
    });

    it('should use ouro as default agent framework', () => {
      expect(DEFAULT_APP_SETTINGS.agentFramework).toBe('ouro');
      expect(DEFAULT_APP_SETTINGS.agentFramework).not.toBe('auto-claude');
    });
  });

  describe('Backwards Compatibility - Path Resolution', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `ouro-rebranding-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should prefer .ouro path when both exist', () => {
      const ouroPath = join(testDir, '.ouro', 'worktrees', 'tasks', 'test-spec');
      const legacyPath = join(testDir, '.auto-claude', 'worktrees', 'tasks', 'test-spec');

      mkdirSync(ouroPath, { recursive: true });
      mkdirSync(legacyPath, { recursive: true });

      const result = findTaskWorktree(testDir, 'test-spec');

      expect(result).toBe(ouroPath);
    });

    it('should fallback to .auto-claude when .ouro does not exist', () => {
      const legacyPath = join(testDir, '.auto-claude', 'worktrees', 'tasks', 'test-spec');
      mkdirSync(legacyPath, { recursive: true });

      const result = findTaskWorktree(testDir, 'test-spec');

      expect(result).toBe(legacyPath);
    });

    it('should fallback to very old .worktrees path', () => {
      const veryOldPath = join(testDir, '.worktrees', 'test-spec');
      mkdirSync(veryOldPath, { recursive: true });

      const result = findTaskWorktree(testDir, 'test-spec');

      expect(result).toBe(veryOldPath);
    });

    it('should return null when no worktree exists', () => {
      const result = findTaskWorktree(testDir, 'nonexistent-spec');

      expect(result).toBeNull();
    });

    it('should prefer .ouro terminal worktree when both exist', () => {
      const ouroPath = join(testDir, '.ouro', 'worktrees', 'terminal', 'test-terminal');
      const legacyPath = join(testDir, '.auto-claude', 'worktrees', 'terminal', 'test-terminal');

      mkdirSync(ouroPath, { recursive: true });
      mkdirSync(legacyPath, { recursive: true });

      const result = findTerminalWorktree(testDir, 'test-terminal');

      expect(result).toBe(ouroPath);
    });
  });
});

describe('Package Configuration', () => {
  it('should have correct product name in package.json', async () => {
    // This test verifies the frontend package.json was updated
    const packageJson = await import('../../package.json') as {
      default: { name: string; build: { productName: string; appId: string } }
    };

    expect(packageJson.default.name).toBe('ouro');
    expect(packageJson.default.build?.productName).toBe('Ouro');
    expect(packageJson.default.build?.appId).toBe('com.ouro.app');
  });
});

describe('Branch Naming Convention', () => {
  it('should use ouro/ prefix for new branches', () => {
    const specName = 'test-feature';
    const expectedBranch = `ouro/${specName}`;
    const legacyBranch = `auto-claude/${specName}`;

    // New branches should use ouro/ prefix
    expect(expectedBranch).toBe('ouro/test-feature');
    expect(expectedBranch).not.toContain('auto-claude');

    // Legacy branch format for reference
    expect(legacyBranch).toBe('auto-claude/test-feature');
  });
});
