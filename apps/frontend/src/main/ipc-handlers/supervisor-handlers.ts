/**
 * Supervisor Plugin IPC Handlers
 *
 * Handles supervisor plugin installation and management:
 * - Getting plugin status for a project
 * - Installing plugin files (hooks, commands)
 * - Uninstalling plugin files
 * - Managing CLAUDE.md supervisor section
 */

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  SupervisorPluginStatus,
  SupervisorPluginResult,
  SupervisorPluginInstallOptions
} from '../../shared/types/supervisor';
import type { IPCResult } from '../../shared/types/common';
import { logger } from '../app-logger';

// Plugin file names (rebranded to Ouro)
const HOOK_FILES = [
  'hookify.ouro-protection.local.md',
  'hookify.ouro-file-protection.local.md'
];

const COMMAND_FILES = [
  'ouro-status.md',
  'ouro-run.md',
  'ouro-create.md',
  'ouro-review.md',
  'ouro-merge.md',
  'ouro-help.md'
];

// Legacy file names (for cleanup during uninstall)
const LEGACY_HOOK_FILES = [
  'hookify.auto-claude-protection.local.md',
  'hookify.auto-claude-file-protection.local.md'
];

const LEGACY_COMMAND_FILES = [
  'ac-status.md',
  'ac-run.md',
  'ac-create.md',
  'ac-review.md',
  'ac-merge.md',
  'ac-help.md'
];

const CLAUDE_MD_SECTION_FILE = 'ouro_supervisor.md';

// Markers for CLAUDE.md section
const CLAUDE_MD_START_MARKER = '<!-- OURO_SUPERVISOR_START -->';
const CLAUDE_MD_END_MARKER = '<!-- OURO_SUPERVISOR_END -->';

/**
 * Get the path to bundled plugin resources
 */
function getPluginResourcesPath(): string {
  // In development, resources are at apps/frontend/resources/
  // In production, they're in the app.asar/resources/ or extraResources
  const isDev = !app.isPackaged;

  if (isDev) {
    // Development: app.getAppPath() returns the frontend app directory
    // e.g., /Users/.../Auto-Claude/apps/frontend
    return path.join(app.getAppPath(), 'resources', 'supervisor-plugin');
  } else {
    // Production: use extraResources (configured in electron-builder)
    return path.join(process.resourcesPath, 'supervisor-plugin');
  }
}

/**
 * Check if supervisor plugin is installed for a project
 */
async function getPluginStatus(projectPath: string): Promise<SupervisorPluginStatus> {
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const commandsDir = path.join(claudeDir, 'commands');
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');

  // Check hooks
  const presentHooks: string[] = [];
  for (const hookFile of HOOK_FILES) {
    const hookPath = path.join(hooksDir, hookFile);
    if (fs.existsSync(hookPath)) {
      presentHooks.push(hookFile);
    }
  }

  // Check commands
  const presentCommands: string[] = [];
  for (const cmdFile of COMMAND_FILES) {
    const cmdPath = path.join(commandsDir, cmdFile);
    if (fs.existsSync(cmdPath)) {
      presentCommands.push(cmdFile);
    }
  }

  // Check CLAUDE.md for supervisor section
  let claudeMdSectionPresent = false;
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    claudeMdSectionPresent = content.includes(CLAUDE_MD_START_MARKER);
  }

  const hookifyRulesPresent = presentHooks.length === HOOK_FILES.length;
  const commandsPresent = presentCommands.length === COMMAND_FILES.length;
  const installed = hookifyRulesPresent && commandsPresent;

  return {
    installed,
    hookifyRulesPresent,
    commandsPresent,
    claudeMdSectionPresent,
    details: {
      hooks: presentHooks,
      commands: presentCommands
    }
  };
}

/**
 * Install supervisor plugin to a project
 */
async function installPlugin(
  projectPath: string,
  options: SupervisorPluginInstallOptions = {}
): Promise<SupervisorPluginResult> {
  const resourcesPath = getPluginResourcesPath();
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const commandsDir = path.join(claudeDir, 'commands');

  const filesCreated: string[] = [];
  const filesRemoved: string[] = [];

  try {
    // Ensure directories exist
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    // Clean up legacy hook files before installing new ones
    for (const legacyHook of LEGACY_HOOK_FILES) {
      const legacyPath = path.join(hooksDir, legacyHook);
      if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
        filesRemoved.push(legacyPath);
        logger.info(`Removed legacy hook: ${legacyHook}`);
      }
    }

    // Clean up legacy command files before installing new ones
    for (const legacyCmd of LEGACY_COMMAND_FILES) {
      const legacyPath = path.join(commandsDir, legacyCmd);
      if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
        filesRemoved.push(legacyPath);
        logger.info(`Removed legacy command: ${legacyCmd}`);
      }
    }

    // Copy hook files
    for (const hookFile of HOOK_FILES) {
      const srcPath = path.join(resourcesPath, 'hooks', hookFile);
      const destPath = path.join(hooksDir, hookFile);

      if (!fs.existsSync(srcPath)) {
        logger.warn(`Hook file not found: ${srcPath}`);
        continue;
      }

      fs.copyFileSync(srcPath, destPath);
      filesCreated.push(destPath);
      logger.info(`Copied hook: ${hookFile}`);
    }

    // Copy command files
    for (const cmdFile of COMMAND_FILES) {
      const srcPath = path.join(resourcesPath, 'commands', cmdFile);
      const destPath = path.join(commandsDir, cmdFile);

      if (!fs.existsSync(srcPath)) {
        logger.warn(`Command file not found: ${srcPath}`);
        continue;
      }

      fs.copyFileSync(srcPath, destPath);
      filesCreated.push(destPath);
      logger.info(`Copied command: ${cmdFile}`);
    }

    // Optionally add CLAUDE.md section
    if (options.includeClaudeMdSection) {
      const result = await updateClaudeMdSection(projectPath, true);
      if (result.success && result.filesCreated) {
        filesCreated.push(...result.filesCreated);
      }
    }

    const message = filesRemoved.length > 0
      ? `Supervisor plugin installed (${filesCreated.length} files created, ${filesRemoved.length} legacy files removed)`
      : `Supervisor plugin installed successfully (${filesCreated.length} files)`;

    return {
      success: true,
      message,
      filesCreated,
      filesRemoved
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to install supervisor plugin:', error);
    return {
      success: false,
      message: `Failed to install supervisor plugin: ${errorMessage}`
    };
  }
}

/**
 * Uninstall supervisor plugin from a project
 */
async function uninstallPlugin(projectPath: string): Promise<SupervisorPluginResult> {
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const commandsDir = path.join(claudeDir, 'commands');

  const filesRemoved: string[] = [];

  try {
    // Remove hook files (current + legacy)
    const allHookFiles = [...HOOK_FILES, ...LEGACY_HOOK_FILES];
    for (const hookFile of allHookFiles) {
      const filePath = path.join(hooksDir, hookFile);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        filesRemoved.push(filePath);
        logger.info(`Removed hook: ${hookFile}`);
      }
    }

    // Remove command files (current + legacy)
    const allCommandFiles = [...COMMAND_FILES, ...LEGACY_COMMAND_FILES];
    for (const cmdFile of allCommandFiles) {
      const filePath = path.join(commandsDir, cmdFile);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        filesRemoved.push(filePath);
        logger.info(`Removed command: ${cmdFile}`);
      }
    }

    // Remove CLAUDE.md section
    const claudeMdResult = await updateClaudeMdSection(projectPath, false);
    if (claudeMdResult.success && claudeMdResult.filesRemoved) {
      filesRemoved.push(...claudeMdResult.filesRemoved);
    }

    return {
      success: true,
      message: `Supervisor plugin uninstalled (${filesRemoved.length} files removed)`,
      filesRemoved
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to uninstall supervisor plugin:', error);
    return {
      success: false,
      message: `Failed to uninstall supervisor plugin: ${errorMessage}`
    };
  }
}

/**
 * Add or remove supervisor section from CLAUDE.md
 */
async function updateClaudeMdSection(
  projectPath: string,
  enable: boolean
): Promise<SupervisorPluginResult> {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const resourcesPath = getPluginResourcesPath();
  const sectionPath = path.join(resourcesPath, 'claude-md-section', CLAUDE_MD_SECTION_FILE);

  try {
    if (enable) {
      // Read the supervisor section content
      if (!fs.existsSync(sectionPath)) {
        return {
          success: false,
          message: `Supervisor section file not found: ${sectionPath}`
        };
      }

      const sectionContent = fs.readFileSync(sectionPath, 'utf-8');
      const wrappedSection = `\n${CLAUDE_MD_START_MARKER}\n${sectionContent}\n${CLAUDE_MD_END_MARKER}\n`;

      // Read or create CLAUDE.md
      let existingContent = '';
      if (fs.existsSync(claudeMdPath)) {
        existingContent = fs.readFileSync(claudeMdPath, 'utf-8');

        // Check if section already exists
        if (existingContent.includes(CLAUDE_MD_START_MARKER)) {
          return {
            success: true,
            message: 'Supervisor section already present in CLAUDE.md'
          };
        }
      }

      // Append section
      const newContent = existingContent + wrappedSection;
      fs.writeFileSync(claudeMdPath, newContent, 'utf-8');

      return {
        success: true,
        message: 'Supervisor section added to CLAUDE.md',
        filesCreated: [claudeMdPath]
      };
    } else {
      // Remove section from CLAUDE.md
      if (!fs.existsSync(claudeMdPath)) {
        return {
          success: true,
          message: 'CLAUDE.md does not exist, nothing to remove'
        };
      }

      let content = fs.readFileSync(claudeMdPath, 'utf-8');

      // Remove section between markers
      const startIndex = content.indexOf(CLAUDE_MD_START_MARKER);
      const endIndex = content.indexOf(CLAUDE_MD_END_MARKER);

      if (startIndex === -1) {
        return {
          success: true,
          message: 'Supervisor section not found in CLAUDE.md'
        };
      }

      // Remove the section including markers and surrounding newlines
      const beforeSection = content.substring(0, startIndex).replace(/\n+$/, '');
      const afterSection = content.substring(endIndex + CLAUDE_MD_END_MARKER.length).replace(/^\n+/, '');
      const newContent = beforeSection + (afterSection ? '\n' + afterSection : '');

      fs.writeFileSync(claudeMdPath, newContent, 'utf-8');

      return {
        success: true,
        message: 'Supervisor section removed from CLAUDE.md',
        filesRemoved: [claudeMdPath]
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update CLAUDE.md:', error);
    return {
      success: false,
      message: `Failed to update CLAUDE.md: ${errorMessage}`
    };
  }
}

/**
 * Register supervisor plugin IPC handlers
 */
export function registerSupervisorHandlers(): void {
  // Get supervisor plugin status
  ipcMain.handle(
    IPC_CHANNELS.SUPERVISOR_GET_STATUS,
    async (_, projectPath: string): Promise<IPCResult<SupervisorPluginStatus>> => {
      try {
        const status = await getPluginStatus(projectPath);
        return { success: true, data: status };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get supervisor status:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Install supervisor plugin
  ipcMain.handle(
    IPC_CHANNELS.SUPERVISOR_INSTALL,
    async (
      _,
      projectPath: string,
      options?: SupervisorPluginInstallOptions
    ): Promise<IPCResult<SupervisorPluginResult>> => {
      try {
        const result = await installPlugin(projectPath, options);
        return { success: result.success, data: result, error: result.success ? undefined : result.message };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to install supervisor plugin:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Uninstall supervisor plugin
  ipcMain.handle(
    IPC_CHANNELS.SUPERVISOR_UNINSTALL,
    async (_, projectPath: string): Promise<IPCResult<SupervisorPluginResult>> => {
      try {
        const result = await uninstallPlugin(projectPath);
        return { success: result.success, data: result, error: result.success ? undefined : result.message };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to uninstall supervisor plugin:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Update CLAUDE.md section only
  ipcMain.handle(
    IPC_CHANNELS.SUPERVISOR_UPDATE_CLAUDE_MD,
    async (_, projectPath: string, enable: boolean): Promise<IPCResult<SupervisorPluginResult>> => {
      try {
        const result = await updateClaudeMdSection(projectPath, enable);
        return { success: result.success, data: result, error: result.success ? undefined : result.message };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to update CLAUDE.md:', error);
        return { success: false, error: errorMessage };
      }
    }
  );

  logger.info('Supervisor plugin IPC handlers registered');
}
