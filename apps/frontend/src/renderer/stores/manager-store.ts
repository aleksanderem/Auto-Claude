/**
 * Manager Store
 * Handles state for the Project Manager chat sidebar
 * Uses Claude Opus 4.5 with comprehensive Auto-Claude knowledge
 */

import { create } from 'zustand';
import type { Task, ImageAttachment } from '../../shared/types';

export interface ManagerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: ImageAttachment[];
  toolsUsed?: Array<{
    name: string;
    input?: string;
    timestamp: Date;
  }>;
}

export interface ManagerChatStatus {
  phase: 'idle' | 'thinking' | 'streaming' | 'error';
  message: string;
  error?: string;
}

interface ToolUsage {
  name: string;
  input?: string;
}

interface ManagerState {
  // Data
  messages: ManagerMessage[];
  status: ManagerChatStatus;
  streamingContent: string;
  currentTool: ToolUsage | null;
  toolsUsed: Array<{ name: string; input?: string; timestamp: Date }>;
  isOpen: boolean;

  // Actions
  setMessages: (messages: ManagerMessage[]) => void;
  addMessage: (message: ManagerMessage) => void;
  setStatus: (status: ManagerChatStatus) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentTool: (tool: ToolUsage | null) => void;
  addToolUsage: (tool: ToolUsage) => void;
  clearToolsUsed: () => void;
  finalizeStreamingMessage: () => void;
  clearMessages: () => void;
  setOpen: (open: boolean) => void;
}

const initialStatus: ManagerChatStatus = {
  phase: 'idle',
  message: ''
};

export const useManagerStore = create<ManagerState>((set) => ({
  // Initial state
  messages: [],
  status: initialStatus,
  streamingContent: '',
  currentTool: null,
  toolsUsed: [],
  isOpen: false,

  // Actions
  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  setStatus: (status) => set({ status }),

  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content
    })),

  clearStreamingContent: () => set({ streamingContent: '' }),

  setCurrentTool: (tool) => set({ currentTool: tool }),

  addToolUsage: (tool) =>
    set((state) => ({
      toolsUsed: [
        ...state.toolsUsed,
        {
          name: tool.name,
          input: tool.input,
          timestamp: new Date()
        }
      ]
    })),

  clearToolsUsed: () => set({ toolsUsed: [] }),

  finalizeStreamingMessage: () =>
    set((state) => {
      const content = state.streamingContent;
      const toolsUsed = state.toolsUsed.length > 0 ? [...state.toolsUsed] : undefined;

      if (!content) {
        return { streamingContent: '', toolsUsed: [], currentTool: null };
      }

      const newMessage: ManagerMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolsUsed
      };

      return {
        messages: [...state.messages, newMessage],
        streamingContent: '',
        toolsUsed: [],
        currentTool: null,
        status: { phase: 'idle', message: '' }
      };
    }),

  clearMessages: () => set({ messages: [], streamingContent: '', toolsUsed: [], currentTool: null }),

  setOpen: (open) => set({ isOpen: open })
}));

// ============ Actions ============

/**
 * Send a message to the Project Manager
 */
export function sendManagerMessage(projectId: string, message: string, images?: ImageAttachment[]): void {
  const store = useManagerStore.getState();

  // Add user message
  const userMessage: ManagerMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: message,
    timestamp: new Date(),
    images: images && images.length > 0 ? images : undefined
  };
  store.addMessage(userMessage);

  // Clear state and set thinking
  store.clearStreamingContent();
  store.clearToolsUsed();
  store.setStatus({
    phase: 'thinking',
    message: 'Processing your message...'
  });

  // Send to main process (with safety check)
  if (!window.electronAPI?.sendManagerMessage) {
    console.warn('[Manager] sendManagerMessage not available');
    store.setStatus({
      phase: 'error',
      message: 'Manager API not available',
      error: 'Manager API not available'
    });
    return;
  }

  window.electronAPI.sendManagerMessage(projectId, message, images);
}

/**
 * Set up IPC listeners for manager events
 */
export function setupManagerListeners(): () => void {
  const store = useManagerStore.getState();

  // Stream chunk handler
  const handleStreamChunk = (chunk: {
    type: 'text' | 'tool_start' | 'tool_end' | 'done' | 'error';
    content?: string;
    toolName?: string;
    toolInput?: string;
    error?: string;
  }) => {
    const state = useManagerStore.getState();

    switch (chunk.type) {
      case 'text':
        if (chunk.content) {
          state.appendStreamingContent(chunk.content);
          if (state.status.phase !== 'streaming') {
            state.setStatus({ phase: 'streaming', message: '' });
          }
        }
        break;

      case 'tool_start':
        state.setCurrentTool({
          name: chunk.toolName || 'Unknown',
          input: chunk.toolInput
        });
        break;

      case 'tool_end':
        if (chunk.toolName) {
          state.addToolUsage({
            name: chunk.toolName,
            input: chunk.toolInput
          });
        }
        state.setCurrentTool(null);
        break;

      case 'done':
        state.finalizeStreamingMessage();
        break;

      case 'error':
        state.setStatus({
          phase: 'error',
          message: chunk.error || 'An error occurred',
          error: chunk.error
        });
        state.clearStreamingContent();
        state.clearToolsUsed();
        state.setCurrentTool(null);
        break;
    }
  };

  // Register listener (with safety check)
  if (!window.electronAPI?.onManagerStreamChunk) {
    console.warn('[Manager] onManagerStreamChunk not available');
    return () => {};
  }

  const cleanup = window.electronAPI.onManagerStreamChunk(handleStreamChunk);

  return cleanup;
}

/**
 * Clear the manager chat history
 */
export function clearManagerChat(): void {
  useManagerStore.getState().clearMessages();
}

/**
 * Cancel the active manager session
 */
export function cancelManagerSession(projectId: string): void {
  const store = useManagerStore.getState();

  // Call cancel on main process
  if (!window.electronAPI?.cancelManagerSession) {
    console.warn('[Manager] cancelManagerSession not available');
    return;
  }

  window.electronAPI.cancelManagerSession(projectId);

  // Reset local state
  store.setStatus({ phase: 'idle', message: '' });
  store.clearStreamingContent();
  store.clearToolsUsed();
  store.setCurrentTool(null);
}
