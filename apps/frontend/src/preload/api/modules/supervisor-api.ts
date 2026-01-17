/**
 * Supervisor Plugin API
 *
 * Exposes supervisor plugin management functionality to the renderer.
 * Allows checking, installing, and uninstalling the supervisor plugin
 * that forces Claude Code into supervisor mode.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type { IPCResult } from '../../../shared/types/common';
import type {
  SupervisorPluginStatus,
  SupervisorPluginResult,
  SupervisorPluginInstallOptions
} from '../../../shared/types/supervisor';

export interface SupervisorAPI {
  /** Get supervisor plugin status for a project */
  getSupervisorStatus: (projectPath: string) => Promise<IPCResult<SupervisorPluginStatus>>;
  /** Install supervisor plugin to a project */
  installSupervisor: (projectPath: string, options?: SupervisorPluginInstallOptions) => Promise<IPCResult<SupervisorPluginResult>>;
  /** Uninstall supervisor plugin from a project */
  uninstallSupervisor: (projectPath: string) => Promise<IPCResult<SupervisorPluginResult>>;
  /** Update CLAUDE.md supervisor section only */
  updateSupervisorClaudeMd: (projectPath: string, enable: boolean) => Promise<IPCResult<SupervisorPluginResult>>;
}

export function createSupervisorAPI(): SupervisorAPI {
  return {
    getSupervisorStatus: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUPERVISOR_GET_STATUS, projectPath),

    installSupervisor: (projectPath: string, options?: SupervisorPluginInstallOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUPERVISOR_INSTALL, projectPath, options),

    uninstallSupervisor: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUPERVISOR_UNINSTALL, projectPath),

    updateSupervisorClaudeMd: (projectPath: string, enable: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUPERVISOR_UPDATE_CLAUDE_MD, projectPath, enable),
  };
}
