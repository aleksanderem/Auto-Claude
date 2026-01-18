/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_CPU_INVESTIGATION?: string;
  // Add other VITE_ environment variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
