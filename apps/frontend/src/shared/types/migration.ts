/**
 * Migration types for legacy .auto-claude to .ouro directory migration
 */

/**
 * Result of checking for legacy directory
 */
export interface LegacyCheckResult {
  /** True if .auto-claude directory exists */
  hasLegacy: boolean;
  /** True if .ouro directory exists */
  hasNew: boolean;
  /** Full path to legacy directory if it exists */
  legacyPath: string | null;
}

/**
 * Result of executing migration
 */
export interface MigrationResult {
  /** Whether migration succeeded */
  success: boolean;
  /** Human-readable message */
  message?: string;
  /** New .ouro path after migration */
  newPath?: string;
}
