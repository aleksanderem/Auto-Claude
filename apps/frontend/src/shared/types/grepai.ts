/**
 * GrepAI Integration Types
 *
 * Type definitions for GrepAI semantic code search integration.
 * GrepAI enables AI agents to search code by intent rather than pattern matching.
 */

/**
 * Supported embedding providers for GrepAI
 */
export type GrepAIEmbeddingProvider = 'ollama' | 'openai' | 'gemini';

/**
 * Default embedding models per provider
 */
export const GREPAI_DEFAULT_MODELS: Record<GrepAIEmbeddingProvider, string> = {
  ollama: 'nomic-embed-text',
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
};

/**
 * Available models per provider
 */
export const GREPAI_AVAILABLE_MODELS: Record<GrepAIEmbeddingProvider, string[]> = {
  ollama: ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'],
  openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  gemini: ['text-embedding-004', 'embedding-001'],
};

/**
 * GrepAI configuration for a project
 * Stored in {project}/.ouro/grepai-config.json
 */
export interface GrepAIConfig {
  /** Whether GrepAI is enabled for this project */
  enabled: boolean;

  /** Start watch daemon automatically when project is opened */
  autoWatch: boolean;

  /** Embedding provider to use */
  embeddingProvider: GrepAIEmbeddingProvider;

  /** Embedding model name */
  embeddingModel: string;

  /** Ollama base URL (default: http://localhost:11434) */
  ollamaBaseUrl?: string;

  /** OpenAI API key (stored securely, not in plain config) */
  openaiApiKey?: string;

  /** Gemini API key (stored securely, not in plain config) */
  geminiApiKey?: string;
}

/**
 * Default GrepAI configuration
 */
export const DEFAULT_GREPAI_CONFIG: GrepAIConfig = {
  enabled: false,
  autoWatch: true,
  embeddingProvider: 'ollama',
  embeddingModel: 'nomic-embed-text',
  ollamaBaseUrl: 'http://localhost:11434',
};

/**
 * GrepAI daemon and index status
 */
export interface GrepAIStatus {
  /** Whether grepai CLI is installed on the system */
  installed: boolean;

  /** Whether project has .grepai folder (initialized) */
  initialized: boolean;

  /** Whether watch daemon is currently running */
  watching: boolean;

  /** Index progress percentage (0-100) during indexing */
  indexProgress?: number;

  /** Last time the index was updated */
  lastIndexed?: string;

  /** Number of files in the index */
  fileCount?: number;

  /** Any error message from the daemon */
  error?: string;
}

/**
 * Default GrepAI status (not installed)
 */
export const DEFAULT_GREPAI_STATUS: GrepAIStatus = {
  installed: false,
  initialized: false,
  watching: false,
};

/**
 * GrepAI search result item
 */
export interface GrepAISearchResult {
  /** File path relative to project root */
  file: string;

  /** Line number where the match starts */
  line: number;

  /** Code snippet containing the match */
  snippet: string;

  /** Relevance score (0-1) */
  score: number;

  /** Function or class name containing the match */
  symbol?: string;
}

/**
 * Search options for grepai search command
 */
export interface GrepAISearchOptions {
  /** Maximum number of results to return */
  limit?: number;

  /** File patterns to include (glob) */
  include?: string[];

  /** File patterns to exclude (glob) */
  exclude?: string[];

  /** Output format */
  format?: 'json' | 'compact' | 'text';
}

/**
 * Trace result for call graph analysis
 */
export interface GrepAITraceResult {
  /** The symbol being traced */
  symbol: string;

  /** Functions that call this symbol */
  callers?: GrepAITraceItem[];

  /** Functions called by this symbol */
  callees?: GrepAITraceItem[];
}

/**
 * Single item in trace results
 */
export interface GrepAITraceItem {
  /** Symbol name */
  name: string;

  /** File path */
  file: string;

  /** Line number */
  line: number;
}

/**
 * GrepAI initialization options
 */
export interface GrepAIInitOptions {
  /** Embedding provider */
  provider: GrepAIEmbeddingProvider;

  /** Embedding model */
  model: string;

  /** Provider-specific options */
  providerOptions?: {
    ollamaBaseUrl?: string;
    apiKey?: string;
  };
}
