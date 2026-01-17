import type { ImageAttachment } from '../../../shared/types';

/**
 * Mock implementation for Project Manager operations
 */

export const managerMock = {
  sendManagerMessage: (_projectId: string, _message: string, _images?: ImageAttachment[]) => {
    console.warn('[Browser Mock] sendManagerMessage called');
  },

  onManagerStreamChunk: () => () => {}
};
