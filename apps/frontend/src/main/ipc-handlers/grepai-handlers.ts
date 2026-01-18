/**
 * GrepAI IPC Handlers
 *
 * Handles IPC communication for GrepAI semantic code search operations.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc';
import { getGrepAIService } from '../grepai-service';
import type {
  GrepAIConfig,
  GrepAIStatus,
  GrepAISearchResult,
  GrepAISearchOptions,
  GrepAIInitOptions,
} from '../../shared/types/grepai';
import type { IPCResult } from '../../shared/types/common';

/**
 * Register GrepAI IPC handlers
 */
export function registerGrepAIHandlers(mainWindow: BrowserWindow | null): void {
  const grepaiService = getGrepAIService();

  // Forward status changes to renderer
  grepaiService.on('status-changed', (status: GrepAIStatus) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GREPAI_STATUS_CHANGED, status);
  });

  // Forward index progress to renderer
  grepaiService.on('index-progress', (progress: number) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GREPAI_INDEX_PROGRESS, progress);
  });

  /**
   * Check if grepai CLI is installed
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_CHECK_INSTALLED,
    async (): Promise<IPCResult<{ installed: boolean; path: string | null }>> => {
      try {
        const installed = await grepaiService.checkInstallation();
        return {
          success: true,
          data: {
            installed,
            path: grepaiService.getGrepaiPath(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Initialize grepai for a project
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_INIT,
    async (
      _event,
      projectPath: string,
      options: GrepAIInitOptions
    ): Promise<IPCResult<void>> => {
      try {
        await grepaiService.initializeProject(projectPath, options);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Start watch daemon for a project
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_START_WATCH,
    async (_event, projectPath: string): Promise<IPCResult<void>> => {
      try {
        await grepaiService.startWatch(projectPath);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Stop watch daemon
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_STOP_WATCH,
    async (): Promise<IPCResult<void>> => {
      try {
        await grepaiService.stopWatch();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Get current status
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_GET_STATUS,
    async (_event, projectPath?: string): Promise<IPCResult<GrepAIStatus>> => {
      try {
        // If projectPath provided, refresh status by checking actual daemon state
        if (projectPath) {
          const status = await grepaiService.refreshStatus(projectPath);
          return { success: true, data: status };
        }

        return { success: true, data: grepaiService.getStatus() };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Run semantic search
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_SEARCH,
    async (
      _event,
      projectPath: string,
      query: string,
      options?: GrepAISearchOptions
    ): Promise<IPCResult<GrepAISearchResult[]>> => {
      try {
        const results = await grepaiService.search(projectPath, query, options);
        return { success: true, data: results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Load project config
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_GET_CONFIG,
    async (_event, projectPath: string): Promise<IPCResult<GrepAIConfig>> => {
      try {
        const config = grepaiService.loadConfig(projectPath);
        return { success: true, data: config };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Save project config
   */
  ipcMain.handle(
    IPC_CHANNELS.GREPAI_SAVE_CONFIG,
    async (
      _event,
      projectPath: string,
      config: GrepAIConfig
    ): Promise<IPCResult<void>> => {
      try {
        grepaiService.saveConfig(projectPath, config);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  console.log('[GrepAI] IPC handlers registered');
}

/**
 * Cleanup GrepAI handlers
 */
export async function cleanupGrepAIHandlers(): Promise<void> {
  const grepaiService = getGrepAIService();
  await grepaiService.cleanup();
  console.log('[GrepAI] Handlers cleaned up');
}
