import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { InsightsConfig } from './insights/config';
import { detectRateLimit, createSDKRateLimitInfo } from './rate-limit-detector';
import type { ImageAttachment } from '../shared/types';

// Reuse InsightsConfig for path resolution and environment setup
const config = new InsightsConfig();

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
 * Manager message for history
 */
interface ManagerHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Service for Project Manager AI chat
 *
 * This service provides an AI-powered Project Manager that:
 * - Uses Claude Opus 4.5 for advanced reasoning
 * - Has access to codebase research tools (Read, Glob, Grep)
 * - Helps break down stories into tasks
 * - Monitors agent progress
 */
export class ManagerService extends EventEmitter {
  private activeSessions: Map<string, ChildProcess> = new Map();
  private conversationHistory: Map<string, ManagerHistoryMessage[]> = new Map();
  private projectPaths: Map<string, string> = new Map();

  constructor() {
    super();
  }

  /**
   * Get the path to the manager history file for a project
   * Uses .ouro directory, with fallback to legacy .auto-claude for backwards compatibility
   */
  private getHistoryFilePath(projectPath: string): string {
    const ouroDir = path.join(projectPath, '.ouro');
    const legacyDir = path.join(projectPath, '.auto-claude');

    // Check if legacy directory has the history file (backwards compatibility)
    const legacyHistoryPath = path.join(legacyDir, 'manager-history.json');
    if (existsSync(legacyHistoryPath) && !existsSync(path.join(ouroDir, 'manager-history.json'))) {
      return legacyHistoryPath;
    }

    return path.join(ouroDir, 'manager-history.json');
  }

  /**
   * Load conversation history from file
   */
  private loadHistoryFromFile(projectId: string, projectPath: string): ManagerHistoryMessage[] {
    const historyFile = this.getHistoryFilePath(projectPath);
    if (!existsSync(historyFile)) {
      return [];
    }
    try {
      const data = readFileSync(historyFile, 'utf-8');
      const history = JSON.parse(data);
      console.log(`[Manager] Loaded ${history.length} messages from history file`);
      return history;
    } catch (err) {
      console.error('[Manager] Failed to load history file:', err);
      return [];
    }
  }

  /**
   * Save conversation history to file
   */
  private saveHistoryToFile(projectId: string, history: ManagerHistoryMessage[]): void {
    const projectPath = this.projectPaths.get(projectId);
    if (!projectPath) {
      console.warn('[Manager] No project path for saving history');
      return;
    }
    const ouroDir = path.join(projectPath, '.ouro');
    const historyFile = this.getHistoryFilePath(projectPath);
    try {
      // Ensure .ouro directory exists
      if (!existsSync(ouroDir)) {
        mkdirSync(ouroDir, { recursive: true });
      }
      writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
      console.log(`[Manager] Saved ${history.length} messages to history file`);
    } catch (err) {
      console.error('[Manager] Failed to save history file:', err);
    }
  }

  /**
   * Check if a session is currently active
   */
  isSessionActive(projectId: string): boolean {
    return this.activeSessions.has(projectId);
  }

  /**
   * Cancel an active session
   */
  cancelSession(projectId: string): boolean {
    const existingProcess = this.activeSessions.get(projectId);
    if (!existingProcess) return false;

    existingProcess.kill();
    this.activeSessions.delete(projectId);
    return true;
  }

  /**
   * Clear conversation history for a project (memory + file)
   */
  clearHistory(projectId: string): void {
    this.conversationHistory.delete(projectId);
    // Also delete the file
    const projectPath = this.projectPaths.get(projectId);
    if (projectPath) {
      const historyFile = this.getHistoryFilePath(projectPath);
      if (existsSync(historyFile)) {
        try {
          unlinkSync(historyFile);
          console.log('[Manager] Deleted history file');
        } catch (err) {
          console.error('[Manager] Failed to delete history file:', err);
        }
      }
    }
  }

  /**
   * Get conversation history for a project
   */
  getHistory(projectId: string): ManagerHistoryMessage[] {
    return this.conversationHistory.get(projectId) || [];
  }

  /**
   * Send a message to the Project Manager
   */
  async sendMessage(projectId: string, projectPath: string, message: string, images?: ImageAttachment[]): Promise<void> {
    // Cancel any existing session
    this.cancelSession(projectId);

    // Store projectPath for history persistence
    this.projectPaths.set(projectId, projectPath);

    const autoBuildSource = config.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      this.emit('stream-chunk', {
        type: 'error',
        error: 'Ouro source not found'
      } as ManagerStreamChunk);
      return;
    }

    const runnerPath = path.join(autoBuildSource, 'runners', 'manager_runner.py');
    if (!existsSync(runnerPath)) {
      this.emit('stream-chunk', {
        type: 'error',
        error: 'manager_runner.py not found in ouro directory'
      } as ManagerStreamChunk);
      return;
    }

    // Get conversation history - load from file if not in memory
    let history = this.conversationHistory.get(projectId);
    if (!history) {
      history = this.loadHistoryFromFile(projectId, projectPath);
      this.conversationHistory.set(projectId, history);
    }

    // Add user message to history
    history.push({ role: 'user', content: message });
    this.conversationHistory.set(projectId, history);

    // Emit thinking status
    this.emit('stream-chunk', {
      type: 'text',
      content: ''  // Empty content signals thinking started
    } as ManagerStreamChunk);

    // Get process environment
    const processEnv = await config.getProcessEnv();

    // Write conversation history to temp file
    const historyFile = path.join(
      os.tmpdir(),
      `manager-history-${projectId}-${Date.now()}.json`
    );

    let historyFileCreated = false;
    try {
      writeFileSync(historyFile, JSON.stringify(history), 'utf-8');
      historyFileCreated = true;
    } catch (err) {
      console.error('[Manager] Failed to write history file:', err);
      this.emit('stream-chunk', {
        type: 'error',
        error: 'Failed to write conversation history'
      } as ManagerStreamChunk);
      return;
    }

    // Write images to temp file if provided
    let imagesFile: string | null = null;
    let imagesFileCreated = false;
    if (images && images.length > 0) {
      imagesFile = path.join(
        os.tmpdir(),
        `manager-images-${projectId}-${Date.now()}.json`
      );
      try {
        writeFileSync(imagesFile, JSON.stringify(images), 'utf-8');
        imagesFileCreated = true;
      } catch (err) {
        console.error('[Manager] Failed to write images file:', err);
        // Continue without images - non-fatal error
      }
    }

    // Build command arguments
    const args = [
      runnerPath,
      '--project-dir', projectPath,
      '--message', message,
      '--history-file', historyFile
    ];

    // Add images file if created
    if (imagesFile && imagesFileCreated) {
      args.push('--images-file', imagesFile);
    }

    // Add auto-claude source for DEV mode
    if (autoBuildSource) {
      args.push('--auto-claude-source', autoBuildSource);
    }

    // Spawn Python process
    const pythonPath = config.getPythonPath();
    const proc = spawn(pythonPath, args, {
      cwd: autoBuildSource,
      env: processEnv
    });

    this.activeSessions.set(projectId, proc);

    let fullResponse = '';
    let allOutput = '';
    let stderrOutput = '';
    let currentTool: string | null = null;

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      allOutput = (allOutput + text).slice(-10000);

      // Process output lines
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('__TOOL_START__:')) {
          try {
            const toolJson = line.substring('__TOOL_START__:'.length);
            const toolData = JSON.parse(toolJson);
            currentTool = toolData.name;
            this.emit('stream-chunk', {
              type: 'tool_start',
              toolName: toolData.name,
              toolInput: toolData.input
            } as ManagerStreamChunk);
          } catch {
            // Ignore parse errors
          }
        } else if (line.startsWith('__TOOL_END__:')) {
          try {
            const toolJson = line.substring('__TOOL_END__:'.length);
            const toolData = JSON.parse(toolJson);
            this.emit('stream-chunk', {
              type: 'tool_end',
              toolName: toolData.name
            } as ManagerStreamChunk);
            currentTool = null;
          } catch {
            // Ignore parse errors
          }
        } else if (line.trim()) {
          fullResponse += line + '\n';
          this.emit('stream-chunk', {
            type: 'text',
            content: line + '\n'
          } as ManagerStreamChunk);
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      allOutput = (allOutput + text).slice(-10000);
      stderrOutput = (stderrOutput + text).slice(-2000);
      console.error('[Manager]', text);
    });

    proc.on('close', (code) => {
      this.activeSessions.delete(projectId);

      // Cleanup temp files
      if (historyFileCreated && existsSync(historyFile)) {
        try {
          unlinkSync(historyFile);
        } catch (cleanupErr) {
          console.error('[Manager] Failed to cleanup history file:', cleanupErr);
        }
      }
      if (imagesFile && imagesFileCreated && existsSync(imagesFile)) {
        try {
          unlinkSync(imagesFile);
        } catch (cleanupErr) {
          console.error('[Manager] Failed to cleanup images file:', cleanupErr);
        }
      }

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          console.warn('[Manager] Rate limit detected:', {
            projectId,
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType
          });

          const rateLimitInfo = createSDKRateLimitInfo('other', rateLimitDetection, {
            projectId
          });
          this.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        // Add assistant response to history
        if (fullResponse.trim()) {
          history.push({ role: 'assistant', content: fullResponse.trim() });
          this.conversationHistory.set(projectId, history);
          // Persist history to file
          this.saveHistoryToFile(projectId, history);
        }

        this.emit('stream-chunk', {
          type: 'done'
        } as ManagerStreamChunk);
      } else {
        const stderrSummary = stderrOutput.trim()
          ? `\n\nError: ${stderrOutput.slice(-500)}`
          : '';
        const error = `Process exited with code ${code}${stderrSummary}`;
        this.emit('stream-chunk', {
          type: 'error',
          error
        } as ManagerStreamChunk);
      }
    });

    proc.on('error', (err) => {
      this.activeSessions.delete(projectId);

      // Cleanup temp files
      if (historyFileCreated && existsSync(historyFile)) {
        try {
          unlinkSync(historyFile);
        } catch (cleanupErr) {
          console.error('[Manager] Failed to cleanup history file:', cleanupErr);
        }
      }
      if (imagesFile && imagesFileCreated && existsSync(imagesFile)) {
        try {
          unlinkSync(imagesFile);
        } catch (cleanupErr) {
          console.error('[Manager] Failed to cleanup images file:', cleanupErr);
        }
      }

      this.emit('stream-chunk', {
        type: 'error',
        error: err.message
      } as ManagerStreamChunk);
    });
  }
}

// Singleton instance
export const managerService = new ManagerService();
