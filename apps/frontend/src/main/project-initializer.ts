import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getToolPath } from './cli-tool-manager';

/**
 * Debug logging - only logs when DEBUG=true or in development mode
 */
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debug(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    if (data) {
      console.warn(`[ProjectInitializer] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.warn(`[ProjectInitializer] ${message}`);
    }
  }
}

/**
 * Git status information for a project
 */
export interface GitStatus {
  isGitRepo: boolean;
  hasCommits: boolean;
  currentBranch: string | null;
  error?: string;
}

/**
 * Check if a directory is a git repository and has at least one commit
 */
export function checkGitStatus(projectPath: string): GitStatus {
  const git = getToolPath('git');

  try {
    // Check if it's a git repository
    execFileSync(git, ['rev-parse', '--git-dir'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return {
      isGitRepo: false,
      hasCommits: false,
      currentBranch: null,
      error: 'Not a git repository. Please run "git init" to initialize git.'
    };
  }

  // Check if there are any commits
  let hasCommits = false;
  try {
    execFileSync(git, ['rev-parse', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    hasCommits = true;
  } catch {
    // No commits yet
    hasCommits = false;
  }

  // Get current branch
  let currentBranch: string | null = null;
  try {
    currentBranch = execFileSync(git, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    // Branch detection failed
  }

  if (!hasCommits) {
    return {
      isGitRepo: true,
      hasCommits: false,
      currentBranch,
      error: 'Git repository has no commits. Please make an initial commit first.'
    };
  }

  return {
    isGitRepo: true,
    hasCommits: true,
    currentBranch
  };
}

/**
 * Initialize git in a project directory and create an initial commit.
 * This is a user-friendly way to set up git for non-technical users.
 */
export function initializeGit(projectPath: string): InitializationResult {
  debug('initializeGit called', { projectPath });

  // Check current git status
  const status = checkGitStatus(projectPath);
  const git = getToolPath('git');

  try {
    // Step 1: Initialize git if needed
    if (!status.isGitRepo) {
      debug('Initializing git repository');
      execFileSync(git, ['init'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000 // 30 second timeout
      });
    }

    // Step 1.5: Ensure git user is configured (required for commits)
    try {
      execFileSync(git, ['config', 'user.name'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      });
    } catch {
      // No user.name configured, set a default
      debug('Setting default git user.name');
      execFileSync(git, ['config', 'user.name', 'Ouro'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      });
    }

    try {
      execFileSync(git, ['config', 'user.email'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      });
    } catch {
      // No user.email configured, set a default
      debug('Setting default git user.email');
      execFileSync(git, ['config', 'user.email', 'ouro@local'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      });
    }

    // Step 2: Check if there are files to commit
    const statusOutput = execFileSync(git, ['status', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }).trim();

    // Step 3: If there are untracked/modified files, add and commit them
    if (statusOutput || !status.hasCommits) {
      debug('Adding files and creating initial commit');

      // Add all files (with timeout for large projects)
      execFileSync(git, ['add', '-A'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000, // 60 second timeout for large projects
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large projects
      });

      // Create initial commit
      execFileSync(git, ['commit', '-m', 'Initial commit', '--allow-empty'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000 // 30 second timeout
      });
    }

    debug('Git initialization complete');
    return { success: true };
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : 'Unknown error during git initialization';

    // Check for timeout specifically
    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timed out')) {
      errorMessage = 'Git operation timed out. The project may be too large or git is hung. Try initializing git manually.';
    }

    debug('Git initialization failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Entries to add to .gitignore when initializing a project
 */
const GITIGNORE_ENTRIES = ['.ouro/'];

/**
 * Ensure entries exist in the project's .gitignore file.
 * Creates .gitignore if it doesn't exist.
 */
function ensureGitignoreEntries(projectPath: string, entries: string[]): void {
  const gitignorePath = path.join(projectPath, '.gitignore');

  let content = '';
  let existingLines: string[] = [];
  let fileExists = false;

  // Try to read existing content - use try-catch to avoid TOCTOU race condition
  try {
    content = readFileSync(gitignorePath, 'utf-8');
    existingLines = content.split('\n').map(line => line.trim());
    fileExists = true;
  } catch (error) {
    // File doesn't exist yet, that's fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // Find entries that need to be added
  const entriesToAdd: string[] = [];
  for (const entry of entries) {
    const entryNormalized = entry.replace(/\/$/, ''); // Remove trailing slash for comparison
    const alreadyExists = existingLines.some(line => {
      const lineNormalized = line.replace(/\/$/, '');
      return lineNormalized === entry || lineNormalized === entryNormalized;
    });

    if (!alreadyExists) {
      entriesToAdd.push(entry);
    }
  }

  if (entriesToAdd.length === 0) {
    debug('All gitignore entries already exist');
    return;
  }

  // Build the content to write
  if (fileExists) {
    // Append to existing file
    let appendContent = '';
    // Ensure file ends with newline before adding our entries
    if (content && !content.endsWith('\n')) {
      appendContent += '\n';
    }
    appendContent += '\n# Ouro data directory\n';
    for (const entry of entriesToAdd) {
      appendContent += entry + '\n';
    }
    appendFileSync(gitignorePath, appendContent);
  } else {
    // Create new file
    writeFileSync(gitignorePath, '# Ouro data directory\n' + entriesToAdd.join('\n') + '\n');
  }

  debug('Added entries to .gitignore', { entries: entriesToAdd });
}

/**
 * Data directories created in .ouro for each project
 */
const DATA_DIRECTORIES = [
  'specs',
  'ideation',
  'insights',
  'roadmap'
];

/**
 * Result of initialization operation
 */
export interface InitializationResult {
  success: boolean;
  error?: string;
}

/**
 * Check if the project has a local backend source directory
 * This indicates it's the development project itself
 */
export function hasLocalSource(projectPath: string): boolean {
  const localSourcePath = path.join(projectPath, 'apps', 'backend');
  // Use runners/spec_runner.py as marker - ensures valid backend
  const markerFile = path.join(localSourcePath, 'runners', 'spec_runner.py');
  return existsSync(localSourcePath) && existsSync(markerFile);
}

/**
 * Get the local source path for a project (if it exists)
 */
export function getLocalSourcePath(projectPath: string): string | null {
  const localSourcePath = path.join(projectPath, 'apps', 'backend');
  if (hasLocalSource(projectPath)) {
    return localSourcePath;
  }
  return null;
}

/**
 * Check if project is initialized (has .ouro or legacy .auto-claude directory)
 */
export function isInitialized(projectPath: string): boolean {
  const ouroPath = path.join(projectPath, '.ouro');
  const legacyPath = path.join(projectPath, '.auto-claude');
  return existsSync(ouroPath) || existsSync(legacyPath);
}

/**
 * Initialize Ouro data directory in a project.
 *
 * Creates .ouro/ with data directories (specs, ideation, insights, roadmap).
 * The framework code runs from the source repo - only data is stored here.
 *
 * Requires:
 * - Project directory must exist
 * - Project must be a git repository with at least one commit
 */
export function initializeProject(projectPath: string): InitializationResult {
  debug('initializeProject called', { projectPath });

  // Validate project path exists
  if (!existsSync(projectPath)) {
    debug('Project path does not exist', { projectPath });
    return {
      success: false,
      error: `Project directory not found: ${projectPath}`
    };
  }

  // Check git status - Ouro requires git for worktree-based builds
  const gitStatus = checkGitStatus(projectPath);
  if (!gitStatus.isGitRepo || !gitStatus.hasCommits) {
    debug('Git check failed', { gitStatus });
    return {
      success: false,
      error: gitStatus.error || 'Git repository required. Ouro uses git worktrees for isolated builds.'
    };
  }

  // Check if already initialized (new .ouro or legacy .auto-claude)
  const ouroPath = path.join(projectPath, '.ouro');
  const legacyPath = path.join(projectPath, '.auto-claude');

  if (existsSync(ouroPath)) {
    debug('Already initialized - .ouro exists');
    return {
      success: false,
      error: 'Project already has Ouro initialized (.ouro exists)'
    };
  }

  if (existsSync(legacyPath)) {
    debug('Legacy .auto-claude exists - migration required');
    return {
      success: false,
      error: 'Project has legacy .auto-claude directory. Please run migration first.'
    };
  }

  try {
    debug('Creating .ouro data directory', { ouroPath });

    // Create the .ouro directory
    mkdirSync(ouroPath, { recursive: true });

    // Create data directories
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(ouroPath, dataDir);
      debug('Creating data directory', { dataDir, dirPath });
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(path.join(dirPath, '.gitkeep'), '');
    }

    // Update .gitignore to exclude .ouro/
    ensureGitignoreEntries(projectPath, GITIGNORE_ENTRIES);

    debug('Initialization complete');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during initialization';
    debug('Initialization failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Ensure all data directories exist in .ouro (or legacy .auto-claude).
 * Useful if new directories are added in future versions.
 */
export function ensureDataDirectories(projectPath: string): InitializationResult {
  // Check new .ouro path first, fall back to legacy .auto-claude
  const ouroPath = path.join(projectPath, '.ouro');
  const legacyPath = path.join(projectPath, '.auto-claude');
  const dotAutoBuildPath = existsSync(ouroPath) ? ouroPath : legacyPath;

  if (!existsSync(dotAutoBuildPath)) {
    return {
      success: false,
      error: 'Project not initialized. Run initialize first.'
    };
  }

  try {
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(dotAutoBuildPath, dataDir);
      if (!existsSync(dirPath)) {
        debug('Creating missing data directory', { dataDir, dirPath });
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(path.join(dirPath, '.gitkeep'), '');
      }
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get the Ouro folder path for a project.
 *
 * Checks for new .ouro/ first, falls back to legacy .auto-claude/ for backwards compatibility.
 * Returns the relative path (e.g., '.ouro' or '.auto-claude').
 */
export function getAutoBuildPath(projectPath: string): string | null {
  const ouroPath = path.join(projectPath, '.ouro');
  const legacyPath = path.join(projectPath, '.auto-claude');

  debug('getAutoBuildPath called', { projectPath, ouroPath, legacyPath });

  // Prefer new .ouro path
  if (existsSync(ouroPath)) {
    debug('Returning .ouro (new installation)');
    return '.ouro';
  }

  // Fall back to legacy .auto-claude for backwards compatibility
  if (existsSync(legacyPath)) {
    debug('Returning .auto-claude (legacy installation)');
    return '.auto-claude';
  }

  debug('No .ouro or .auto-claude folder found - project not initialized');
  return null;
}
