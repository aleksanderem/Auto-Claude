/**
 * GrepAI Mock
 *
 * Mock implementation for GrepAI semantic code search operations
 */

import type { GrepAIStatus } from '../../../shared/types/grepai';

const mockStatus: GrepAIStatus = {
  installed: false,
  initialized: false,
  watching: false,
};

export const grepaiMock = {
  grepaiCheckInstalled: async () => ({
    success: true,
    data: { installed: false, path: null }
  }),

  grepaiInit: async () => ({
    success: false,
    error: 'GrepAI not available in browser mode'
  }),

  grepaiStartWatch: async () => ({
    success: false,
    error: 'GrepAI not available in browser mode'
  }),

  grepaiStopWatch: async () => ({
    success: true
  }),

  grepaiGetStatus: async () => ({
    success: true,
    data: mockStatus
  }),

  grepaiSearch: async () => ({
    success: false,
    error: 'GrepAI not available in browser mode'
  }),

  grepaiGetConfig: async () => ({
    success: true,
    data: {
      enabled: false,
      autoWatch: true,
      embeddingProvider: 'ollama' as const,
      embeddingModel: 'nomic-embed-text',
      ollamaBaseUrl: 'http://localhost:11434',
    }
  }),

  grepaiSaveConfig: async () => ({
    success: false,
    error: 'GrepAI not available in browser mode'
  }),

  onGrepaiStatusChanged: () => () => {},
  onGrepaiIndexProgress: () => () => {},
};
