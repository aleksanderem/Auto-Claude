import path from 'path';
import { existsSync } from 'fs';

export const INSIGHTS_DIR = '.ouro/insights';
export const LEGACY_INSIGHTS_DIR = '.auto-claude/insights';
const SESSIONS_DIR = 'sessions';
const CURRENT_SESSION_FILE = 'current_session.json';

/**
 * Path utilities for insights service
 * Provides consistent path resolution for sessions and insights data
 */
export class InsightsPaths {
  /**
   * Get insights directory path for a project
   * Checks new .ouro path first, falls back to legacy .auto-claude path if it exists
   */
  getInsightsDir(projectPath: string): string {
    const newPath = path.join(projectPath, INSIGHTS_DIR);
    const legacyPath = path.join(projectPath, LEGACY_INSIGHTS_DIR);

    // If new path exists, use it
    if (existsSync(newPath)) {
      return newPath;
    }

    // If legacy path exists and new path doesn't, use legacy for backwards compatibility
    if (existsSync(legacyPath)) {
      return legacyPath;
    }

    // Default to new path for new projects
    return newPath;
  }

  /**
   * Get sessions directory path for a project
   */
  getSessionsDir(projectPath: string): string {
    return path.join(this.getInsightsDir(projectPath), SESSIONS_DIR);
  }

  /**
   * Get session file path for a specific session
   */
  getSessionPath(projectPath: string, sessionId: string): string {
    return path.join(this.getSessionsDir(projectPath), `${sessionId}.json`);
  }

  /**
   * Get current session pointer file path
   */
  getCurrentSessionPath(projectPath: string): string {
    return path.join(this.getInsightsDir(projectPath), CURRENT_SESSION_FILE);
  }

  /**
   * Get old session path for migration
   */
  getOldSessionPath(projectPath: string): string {
    return path.join(this.getInsightsDir(projectPath), 'session.json');
  }
}
