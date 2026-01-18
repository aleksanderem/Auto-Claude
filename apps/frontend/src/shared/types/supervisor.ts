/**
 * Supervisor Plugin types for Claude Code integration
 *
 * The supervisor plugin forces Claude Code into a supervisor role,
 * preventing it from implementing tasks directly and protecting
 * the .ouro/ infrastructure directory.
 */

/**
 * Status of the supervisor plugin installation for a project
 */
export interface SupervisorPluginStatus {
  /** Whether the plugin is fully installed */
  installed: boolean;
  /** Hookify rules present in .claude/hooks/ */
  hookifyRulesPresent: boolean;
  /** Slash commands present in .claude/commands/ */
  commandsPresent: boolean;
  /** CLAUDE.md contains the supervisor section */
  claudeMdSectionPresent: boolean;
  /** Details about what files are present */
  details?: {
    hooks: string[];
    commands: string[];
  };
}

/**
 * Result of installing or uninstalling the supervisor plugin
 */
export interface SupervisorPluginResult {
  success: boolean;
  message?: string;
  filesCreated?: string[];
  filesRemoved?: string[];
}

/**
 * Configuration options for supervisor plugin installation
 */
export interface SupervisorPluginInstallOptions {
  /** Include the CLAUDE.md section (adds supervisor role instructions to project) */
  includeClaudeMdSection?: boolean;
}
