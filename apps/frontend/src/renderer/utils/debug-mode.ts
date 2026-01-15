/**
 * Debug Mode Utilities for Renderer Process
 *
 * Provides conditional enabling of debug features for CPU/performance investigation.
 * Uses Vite's import.meta.env for environment variables in the renderer process.
 *
 * Enable debug mode by setting environment variable (must be prefixed with VITE_):
 *   VITE_DEBUG_CPU_INVESTIGATION=true
 *
 * Add to apps/frontend/.env file:
 *   VITE_DEBUG_CPU_INVESTIGATION=true
 *
 * Debug features enabled in renderer:
 * - Health check disabled on startup (prevents initial API call overhead)
 * - Console logging for project changes
 *
 * @see CLAUDE.md section "Debug Mode for CPU Investigation"
 */

/**
 * Check if CPU investigation debug mode is enabled in renderer
 */
export function isDebugCpuModeEnabled(): boolean {
  return import.meta.env.VITE_DEBUG_CPU_INVESTIGATION === 'true';
}

/**
 * Log a debug message only when debug mode is enabled
 */
export function debugCpuLog(message: string, ...args: unknown[]): void {
  if (isDebugCpuModeEnabled()) {
    console.warn(`[DEBUG_CPU] ${message}`, ...args);
  }
}

/**
 * Debug mode feature flags for renderer - all disabled by default
 */
export const debugModeFeatures = {
  /** Disable health check on startup */
  get disableHealthCheck(): boolean {
    return isDebugCpuModeEnabled();
  },

  /** Enable verbose project change logging */
  get enableProjectChangeLogging(): boolean {
    return isDebugCpuModeEnabled();
  },
};
