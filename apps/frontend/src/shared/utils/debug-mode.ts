/**
 * Debug Mode Utilities
 *
 * Provides conditional enabling of debug features for CPU/performance investigation.
 * These features were developed during debugging sessions and can be useful for
 * future investigations.
 *
 * Enable debug mode by setting environment variable:
 *   DEBUG_CPU_INVESTIGATION=true
 *
 * Or in development, add to .env file:
 *   DEBUG_CPU_INVESTIGATION=true
 *
 * Debug features enabled:
 * - Usage monitor disabled (prevents polling overhead)
 * - Task recovery service disabled (prevents auto-QA triggers)
 * - Health check disabled in renderer (prevents startup overhead)
 * - DevTools can be conditionally disabled (DISABLE_DEVTOOLS=true)
 * - IPC call loop detection (warns if TASK_LIST called >10 times)
 * - Terminal data event rate logging (tracks PTY output frequency)
 *
 * @see CLAUDE.md section "Debug Mode for CPU Investigation"
 */

/**
 * Check if CPU investigation debug mode is enabled
 */
export function isDebugCpuModeEnabled(): boolean {
  return process.env.DEBUG_CPU_INVESTIGATION === 'true';
}

/**
 * Check if DevTools should be disabled (separate from debug mode)
 */
export function isDevToolsDisabled(): boolean {
  return process.env.DISABLE_DEVTOOLS === 'true';
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
 * Debug mode feature flags - all disabled by default, enabled when DEBUG_CPU_INVESTIGATION=true
 */
export const debugModeFeatures = {
  /** Disable usage monitor polling */
  get disableUsageMonitor(): boolean {
    return isDebugCpuModeEnabled();
  },

  /** Disable task recovery service (prevents auto-QA) */
  get disableTaskRecovery(): boolean {
    return isDebugCpuModeEnabled();
  },

  /** Disable health check in renderer */
  get disableHealthCheck(): boolean {
    return isDebugCpuModeEnabled();
  },

  /** Enable IPC call loop detection */
  get enableIpcLoopDetection(): boolean {
    return isDebugCpuModeEnabled();
  },

  /** Enable terminal data event rate logging */
  get enableTerminalDataLogging(): boolean {
    return isDebugCpuModeEnabled();
  },
};
