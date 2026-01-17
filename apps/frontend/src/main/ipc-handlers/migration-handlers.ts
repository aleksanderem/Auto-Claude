/**
 * Legacy Migration IPC Handlers
 *
 * Handles migration from .auto-claude to .ouro directory structure:
 * - Checking for legacy directories
 * - Executing the migration (rename + gitignore update)
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { LegacyCheckResult, MigrationResult } from '../../shared/types/migration';
import type { IPCResult } from '../../shared/types/common';
import { logger } from '../app-logger';
import { projectStore } from '../project-store';

const LEGACY_DIR = '.auto-claude';
const NEW_DIR = '.ouro';

/**
 * Check if project has legacy .auto-claude directory
 */
async function checkLegacyDirectory(projectPath: string): Promise<LegacyCheckResult> {
  const legacyPath = path.join(projectPath, LEGACY_DIR);
  const newPath = path.join(projectPath, NEW_DIR);

  const hasLegacy = fs.existsSync(legacyPath);
  const hasNew = fs.existsSync(newPath);

  return {
    hasLegacy,
    hasNew,
    legacyPath: hasLegacy ? legacyPath : null
  };
}

/**
 * Execute migration from .auto-claude to .ouro
 */
async function executeMigration(projectPath: string): Promise<MigrationResult> {
  const legacyPath = path.join(projectPath, LEGACY_DIR);
  const newPath = path.join(projectPath, NEW_DIR);

  // Safety checks
  if (!fs.existsSync(legacyPath)) {
    return {
      success: false,
      message: `Legacy directory ${LEGACY_DIR} not found`
    };
  }

  if (fs.existsSync(newPath)) {
    return {
      success: false,
      message: `${NEW_DIR} directory already exists - cannot overwrite`
    };
  }

  try {
    // 1. Rename directory
    logger.info(`[Migration] Renaming ${legacyPath} to ${newPath}`);
    await fs.promises.rename(legacyPath, newPath);

    // 2. Update .gitignore if it exists
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        let gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');

        // Replace .auto-claude/ with .ouro/
        if (gitignoreContent.includes('.auto-claude/')) {
          gitignoreContent = gitignoreContent.replace(/\.auto-claude\//g, '.ouro/');
          await fs.promises.writeFile(gitignorePath, gitignoreContent, 'utf-8');
          logger.info('[Migration] Updated .gitignore');
        }

        // Also handle .auto-claude without trailing slash
        if (gitignoreContent.includes('.auto-claude') && !gitignoreContent.includes('.ouro')) {
          gitignoreContent = gitignoreContent.replace(/\.auto-claude(?!\/)/g, '.ouro');
          await fs.promises.writeFile(gitignorePath, gitignoreContent, 'utf-8');
        }
      } catch (gitignoreError) {
        logger.warn('[Migration] Could not update .gitignore:', gitignoreError);
        // Non-fatal, continue
      }
    }

    // 3. Update project in store
    const projects = projectStore.getProjects();
    const project = projects.find(p => p.path === projectPath);
    if (project) {
      projectStore.updateAutoBuildPath(project.id, NEW_DIR);
      logger.info(`[Migration] Updated project ${project.id} autoBuildPath to ${NEW_DIR}`);
    }

    logger.info('[Migration] Migration completed successfully');
    return {
      success: true,
      message: 'Migration completed successfully',
      newPath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Migration] Migration failed:', error);
    return {
      success: false,
      message: `Migration failed: ${errorMessage}`
    };
  }
}

/**
 * Register migration IPC handlers
 */
export function registerMigrationHandlers(): void {
  // Check for legacy directory
  ipcMain.handle(
    IPC_CHANNELS.MIGRATION_CHECK_LEGACY,
    async (_, projectPath: string): Promise<IPCResult<LegacyCheckResult>> => {
      try {
        const result = await checkLegacyDirectory(projectPath);
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[Migration] Failed to check legacy directory:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Execute migration
  ipcMain.handle(
    IPC_CHANNELS.MIGRATION_EXECUTE,
    async (_, projectPath: string): Promise<IPCResult<MigrationResult>> => {
      try {
        const result = await executeMigration(projectPath);
        return {
          success: result.success,
          data: result,
          error: result.success ? undefined : result.message
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[Migration] Failed to execute migration:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  logger.info('[Migration] IPC handlers registered');
}
