import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { projectStore } from '../project-store';
import { managerService } from '../manager-service';
import { safeSendToRenderer } from './utils';
import type { ImageAttachment } from '../../shared/types';

/**
 * Register all Project Manager-related IPC handlers
 */
export function registerManagerHandlers(getMainWindow: () => BrowserWindow | null): void {
  // ============================================
  // Manager Operations
  // ============================================

  ipcMain.on(
    IPC_CHANNELS.MANAGER_SEND_MESSAGE,
    async (_, projectId: string, message: string, images?: ImageAttachment[]) => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        safeSendToRenderer(
          getMainWindow,
          IPC_CHANNELS.MANAGER_STREAM_CHUNK,
          {
            type: 'error',
            error: 'Project not found'
          }
        );
        return;
      }

      try {
        await managerService.sendMessage(projectId, project.path, message, images);
      } catch (error) {
        console.error('[Manager IPC] Error in sendMessage:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        safeSendToRenderer(
          getMainWindow,
          IPC_CHANNELS.MANAGER_STREAM_CHUNK,
          {
            type: 'error',
            error: `Failed to send message: ${errorMessage}`
          }
        );
      }
    }
  );

  // Cancel active manager session
  ipcMain.on(IPC_CHANNELS.MANAGER_CANCEL, (_, projectId: string) => {
    const cancelled = managerService.cancelSession(projectId);
    if (cancelled) {
      console.log('[Manager IPC] Session cancelled for project:', projectId);
      safeSendToRenderer(
        getMainWindow,
        IPC_CHANNELS.MANAGER_STREAM_CHUNK,
        {
          type: 'error',
          error: 'Session cancelled by user'
        }
      );
    }
  });

  // ============================================
  // Manager Event Forwarding (Service -> Renderer)
  // ============================================

  // Forward streaming chunks to renderer
  managerService.on('stream-chunk', (chunk: unknown) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.MANAGER_STREAM_CHUNK, chunk);
  });

  // Forward SDK rate limit events to renderer
  managerService.on('sdk-rate-limit', (rateLimitInfo: unknown) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
  });
}
