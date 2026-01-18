/**
 * GrepAI Service
 *
 * Manages the GrepAI semantic code search daemon lifecycle.
 * Handles initialization, watch daemon, search operations, and configuration.
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  GrepAIConfig,
  GrepAIStatus,
  GrepAISearchResult,
  GrepAISearchOptions,
  GrepAIInitOptions,
} from '../shared/types/grepai';
import {
  DEFAULT_GREPAI_CONFIG,
  DEFAULT_GREPAI_STATUS,
} from '../shared/types/grepai';

/**
 * GrepAI Service - Manages semantic code search daemon
 *
 * Events emitted:
 * - 'status-changed': GrepAI daemon status changed
 * - 'index-progress': Index progress update (0-100)
 * - 'error': Error occurred
 */
export class GrepAIService extends EventEmitter {
  private currentProjectPath: string | null = null;
  private status: GrepAIStatus = { ...DEFAULT_GREPAI_STATUS };
  private grepaiPath: string | null = null;

  constructor() {
    super();
    // Check if grepai is installed on startup
    this.checkInstallation();
  }

  /**
   * Check if grepai CLI is installed
   * Uses spawn to avoid shell injection vulnerabilities
   */
  async checkInstallation(): Promise<boolean> {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'where' : 'which';
    const args = ['grepai'];

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });

      let stdout = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('error', () => {
        this.grepaiPath = null;
        this.status.installed = false;
        console.log('[GrepAIService] ⚠️ grepai CLI not installed');
        resolve(false);
      });

      proc.on('exit', (code) => {
        if (code === 0 && stdout.trim()) {
          this.grepaiPath = stdout.split('\n')[0].trim();
          this.status.installed = true;
          console.log('[GrepAIService] ✅ grepai CLI found at:', this.grepaiPath);
          resolve(true);
        } else {
          this.grepaiPath = null;
          this.status.installed = false;
          console.log('[GrepAIService] ⚠️ grepai CLI not installed');
          resolve(false);
        }
      });
    });
  }

  /**
   * Get the current grepai path
   */
  getGrepaiPath(): string | null {
    return this.grepaiPath;
  }

  /**
   * Initialize grepai for a project
   */
  async initializeProject(
    projectPath: string,
    options: GrepAIInitOptions
  ): Promise<void> {
    if (!this.status.installed || !this.grepaiPath) {
      throw new Error('grepai CLI is not installed');
    }

    console.log('[GrepAIService] Initializing grepai for:', projectPath);

    // Build init command arguments
    const args = ['init', '--provider', options.provider, '--model', options.model];

    // Add provider-specific options
    if (options.provider === 'ollama' && options.providerOptions?.ollamaBaseUrl) {
      args.push('--ollama-url', options.providerOptions.ollamaBaseUrl);
    }

    // Build environment
    const env: Record<string, string | undefined> = { ...process.env };

    if (options.provider === 'openai' && options.providerOptions?.apiKey) {
      env.OPENAI_API_KEY = options.providerOptions.apiKey;
    }
    if (options.provider === 'gemini' && options.providerOptions?.apiKey) {
      env.GEMINI_API_KEY = options.providerOptions.apiKey;
      env.GOOGLE_API_KEY = options.providerOptions.apiKey;
    }

    // Run grepai init
    await this.runCommand(args, projectPath, env);

    this.status.initialized = true;
    this.emitStatusChanged();
  }

  /**
   * Check if a project has grepai initialized
   */
  isProjectInitialized(projectPath: string): boolean {
    return existsSync(join(projectPath, '.grepai'));
  }

  /**
   * Check if a background watch daemon is already running
   */
  async checkWatchStatus(projectPath: string): Promise<{ running: boolean; pid?: number }> {
    if (!this.grepaiPath) {
      return { running: false };
    }

    return new Promise((resolve) => {
      const proc = spawn(this.grepaiPath!, ['watch', '--status'], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });

      let stdout = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0 && stdout.includes('running')) {
          // Parse PID from output like "PID: 43883"
          const pidMatch = stdout.match(/PID:\s*(\d+)/);
          const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;
          resolve({ running: true, pid });
        } else {
          resolve({ running: false });
        }
      });

      proc.on('error', () => {
        resolve({ running: false });
      });
    });
  }

  /**
   * Start the watch daemon for a project
   */
  async startWatch(projectPath: string): Promise<void> {
    if (!this.status.installed || !this.grepaiPath) {
      throw new Error('grepai CLI is not installed');
    }

    // Check if watch is already running
    const watchStatus = await this.checkWatchStatus(projectPath);
    if (watchStatus.running) {
      console.log('[GrepAIService] ✅ Watch daemon already running (PID:', watchStatus.pid, ')');
      this.status.watching = true;
      this.status.initialized = this.isProjectInitialized(projectPath);
      this.currentProjectPath = projectPath;
      this.emitStatusChanged();
      return;
    }

    // Stop any existing daemon first (that we spawned)
    await this.stopWatch();

    console.log('[GrepAIService] 🚀 Starting watch daemon for:', projectPath);

    // Load project config for environment variables
    const config = this.loadConfig(projectPath);

    // Build environment
    const env: Record<string, string | undefined> = {
      ...process.env,
    };

    if (config.embeddingProvider === 'openai' && config.openaiApiKey) {
      env.OPENAI_API_KEY = config.openaiApiKey;
    }
    if (config.embeddingProvider === 'gemini' && config.geminiApiKey) {
      env.GEMINI_API_KEY = config.geminiApiKey;
      env.GOOGLE_API_KEY = config.geminiApiKey;
    }
    if (config.ollamaBaseUrl) {
      env.OLLAMA_HOST = config.ollamaBaseUrl;
    }

    // Filter out undefined values
    const cleanEnv: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    // Start watch daemon in background mode using grepai's native --background flag
    try {
      await this.runCommand(['watch', '--background'], projectPath, cleanEnv);
      console.log('[GrepAIService] ✅ Background watch daemon started');

      this.currentProjectPath = projectPath;
      this.status.watching = true;
      this.status.initialized = this.isProjectInitialized(projectPath);
      this.emitStatusChanged();
    } catch (error) {
      console.error('[GrepAIService] Failed to start watch daemon:', error);
      throw error;
    }
  }

  /**
   * Stop the watch daemon
   */
  async stopWatch(): Promise<void> {
    if (!this.currentProjectPath || !this.grepaiPath) {
      return;
    }

    // Check if watch is running first
    const watchStatus = await this.checkWatchStatus(this.currentProjectPath);
    if (!watchStatus.running) {
      console.log('[GrepAIService] Watch daemon not running');
      this.status.watching = false;
      this.emitStatusChanged();
      return;
    }

    console.log('[GrepAIService] 🛑 Stopping watch daemon');

    try {
      await this.runCommand(['watch', '--stop'], this.currentProjectPath);
      console.log('[GrepAIService] ✅ Watch daemon stopped');
      this.status.watching = false;
      this.emitStatusChanged();
    } catch (error) {
      console.error('[GrepAIService] Failed to stop watch daemon:', error);
      // Try to update status anyway
      const newStatus = await this.checkWatchStatus(this.currentProjectPath);
      this.status.watching = newStatus.running;
      this.emitStatusChanged();
    }
  }

  /**
   * Get the current status
   */
  getStatus(): GrepAIStatus {
    return {
      ...this.status,
      initialized: this.currentProjectPath
        ? this.isProjectInitialized(this.currentProjectPath)
        : false,
    };
  }

  /**
   * Refresh status by checking actual watch daemon state
   */
  async refreshStatus(projectPath: string): Promise<GrepAIStatus> {
    const watchStatus = await this.checkWatchStatus(projectPath);
    this.status.watching = watchStatus.running;
    this.status.initialized = this.isProjectInitialized(projectPath);
    this.currentProjectPath = projectPath;
    return this.getStatus();
  }

  /**
   * Run a semantic search
   */
  async search(
    projectPath: string,
    query: string,
    options: GrepAISearchOptions = {}
  ): Promise<GrepAISearchResult[]> {
    if (!this.status.installed || !this.grepaiPath) {
      throw new Error('grepai CLI is not installed');
    }

    // Build search command
    const args = ['search', query, '--json', '--compact'];

    if (options.limit) {
      args.push('-n', String(options.limit));
    }

    if (options.include?.length) {
      for (const pattern of options.include) {
        args.push('--include', pattern);
      }
    }

    if (options.exclude?.length) {
      for (const pattern of options.exclude) {
        args.push('--exclude', pattern);
      }
    }

    const output = await this.runCommand(args, projectPath);

    try {
      return JSON.parse(output) as GrepAISearchResult[];
    } catch {
      console.error('[GrepAIService] Failed to parse search results:', output);
      return [];
    }
  }

  /**
   * Load project grepai config
   */
  loadConfig(projectPath: string): GrepAIConfig {
    const configPath = join(projectPath, '.ouro', 'grepai-config.json');

    if (!existsSync(configPath)) {
      return { ...DEFAULT_GREPAI_CONFIG };
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as Partial<GrepAIConfig>;
      return { ...DEFAULT_GREPAI_CONFIG, ...config };
    } catch (error) {
      console.error('[GrepAIService] Failed to load config:', error);
      return { ...DEFAULT_GREPAI_CONFIG };
    }
  }

  /**
   * Save project grepai config
   */
  saveConfig(projectPath: string, config: GrepAIConfig): void {
    const ouroDir = join(projectPath, '.ouro');
    const configPath = join(ouroDir, 'grepai-config.json');

    // Ensure .ouro directory exists
    if (!existsSync(ouroDir)) {
      mkdirSync(ouroDir, { recursive: true });
    }

    // Don't save API keys in plain text - they should come from env vars
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { openaiApiKey, geminiApiKey, ...safeConfig } = config;

    writeFileSync(configPath, JSON.stringify(safeConfig, null, 2));
    console.log('[GrepAIService] Config saved to:', configPath);
  }

  /**
   * Cleanup on app quit
   */
  async cleanup(): Promise<void> {
    console.log('[GrepAIService] Cleaning up...');
    await this.stopWatch();
  }

  /**
   * Run a grepai command and return output
   * Uses spawn to avoid shell injection vulnerabilities
   */
  private async runCommand(
    args: string[],
    cwd: string,
    extraEnv: Record<string, string | undefined> = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.grepaiPath) {
        reject(new Error('grepai path not set'));
        return;
      }

      const env: Record<string, string | undefined> = {
        ...process.env,
        ...extraEnv,
      };

      // Filter out undefined values
      const cleanEnv: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          cleanEnv[key] = value;
        }
      }

      const proc = spawn(this.grepaiPath, args, {
        cwd,
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`grepai exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Emit status changed event
   */
  private emitStatusChanged(): void {
    this.emit('status-changed', this.getStatus());
  }
}

// Singleton instance
let grepaiServiceInstance: GrepAIService | null = null;

/**
 * Get the GrepAI service singleton
 */
export function getGrepAIService(): GrepAIService {
  if (!grepaiServiceInstance) {
    grepaiServiceInstance = new GrepAIService();
  }
  return grepaiServiceInstance;
}
