/**
 * GrepAI Preload API
 *
 * Exposes GrepAI operations to the renderer process.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type {
  GrepAIConfig,
  GrepAIStatus,
  GrepAISearchResult,
  GrepAISearchOptions,
  GrepAIInitOptions,
} from '../../../shared/types/grepai';
import type { IPCResult } from '../../../shared/types/common';

/**
 * GrepAI API interface
 */
export interface GrepAIAPI {
  /** Check if grepai CLI is installed */
  grepaiCheckInstalled: () => Promise<IPCResult<{ installed: boolean; path: string | null }>>;

  /** Initialize grepai for a project */
  grepaiInit: (projectPath: string, options: GrepAIInitOptions) => Promise<IPCResult<void>>;

  /** Start watch daemon for a project */
  grepaiStartWatch: (projectPath: string) => Promise<IPCResult<void>>;

  /** Stop watch daemon */
  grepaiStopWatch: () => Promise<IPCResult<void>>;

  /** Get current status */
  grepaiGetStatus: (projectPath?: string) => Promise<IPCResult<GrepAIStatus>>;

  /** Run semantic search */
  grepaiSearch: (
    projectPath: string,
    query: string,
    options?: GrepAISearchOptions
  ) => Promise<IPCResult<GrepAISearchResult[]>>;

  /** Load project config */
  grepaiGetConfig: (projectPath: string) => Promise<IPCResult<GrepAIConfig>>;

  /** Save project config */
  grepaiSaveConfig: (projectPath: string, config: GrepAIConfig) => Promise<IPCResult<void>>;

  /** Subscribe to status changes */
  onGrepaiStatusChanged: (callback: (status: GrepAIStatus) => void) => () => void;

  /** Subscribe to index progress updates */
  onGrepaiIndexProgress: (callback: (progress: number) => void) => () => void;
}

/**
 * Create the GrepAI API
 */
export function createGrepAIAPI(): GrepAIAPI {
  return {
    grepaiCheckInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.GREPAI_CHECK_INSTALLED),

    grepaiInit: (projectPath, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_INIT, projectPath, options),

    grepaiStartWatch: (projectPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_START_WATCH, projectPath),

    grepaiStopWatch: () => ipcRenderer.invoke(IPC_CHANNELS.GREPAI_STOP_WATCH),

    grepaiGetStatus: (projectPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_GET_STATUS, projectPath),

    grepaiSearch: (projectPath, query, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_SEARCH, projectPath, query, options),

    grepaiGetConfig: (projectPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_GET_CONFIG, projectPath),

    grepaiSaveConfig: (projectPath, config) =>
      ipcRenderer.invoke(IPC_CHANNELS.GREPAI_SAVE_CONFIG, projectPath, config),

    onGrepaiStatusChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: GrepAIStatus) => {
        callback(status);
      };
      ipcRenderer.on(IPC_CHANNELS.GREPAI_STATUS_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.GREPAI_STATUS_CHANGED, handler);
      };
    },

    onGrepaiIndexProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: number) => {
        callback(progress);
      };
      ipcRenderer.on(IPC_CHANNELS.GREPAI_INDEX_PROGRESS, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.GREPAI_INDEX_PROGRESS, handler);
      };
    },
  };
}
