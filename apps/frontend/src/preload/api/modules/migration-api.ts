/**
 * Migration API
 *
 * Exposes legacy migration functionality to the renderer.
 * Handles .auto-claude → .ouro directory migration.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type { IPCResult } from '../../../shared/types/common';
import type { LegacyCheckResult, MigrationResult } from '../../../shared/types/migration';

export interface MigrationAPI {
  /** Check if project has legacy .auto-claude directory */
  checkLegacy: (projectPath: string) => Promise<IPCResult<LegacyCheckResult>>;
  /** Execute migration from .auto-claude to .ouro */
  executeMigration: (projectPath: string) => Promise<IPCResult<MigrationResult>>;
}

export function createMigrationAPI(): MigrationAPI {
  return {
    checkLegacy: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MIGRATION_CHECK_LEGACY, projectPath),

    executeMigration: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MIGRATION_EXECUTE, projectPath)
  };
}
