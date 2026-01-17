import { IPC_CHANNELS } from '../../../shared/constants';
import { createIpcListener, sendIpc, IpcListenerCleanup } from './ipc-utils';
import type { ImageAttachment } from '../../../shared/types';

/**
 * Stream chunk type for manager chat
 */
export interface ManagerStreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: string;
  error?: string;
}

/**
 * Manager API operations for Project Manager chat sidebar
 */
export interface ManagerAPI {
  // Operations
  sendManagerMessage: (projectId: string, message: string, images?: ImageAttachment[]) => void;
  cancelManagerSession: (projectId: string) => void;

  // Event Listeners
  onManagerStreamChunk: (
    callback: (chunk: ManagerStreamChunk) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the Manager API implementation
 */
export const createManagerAPI = (): ManagerAPI => ({
  // Operations
  sendManagerMessage: (projectId: string, message: string, images?: ImageAttachment[]): void =>
    sendIpc(IPC_CHANNELS.MANAGER_SEND_MESSAGE, projectId, message, images),

  cancelManagerSession: (projectId: string): void =>
    sendIpc(IPC_CHANNELS.MANAGER_CANCEL, projectId),

  // Event Listeners
  onManagerStreamChunk: (
    callback: (chunk: ManagerStreamChunk) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.MANAGER_STREAM_CHUNK, callback)
});
