import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Sentry configuration embedded at build time.
 */
const sentryDefines = {
  '__SENTRY_DSN__': JSON.stringify(process.env.SENTRY_DSN || ''),
  '__SENTRY_TRACES_SAMPLE_RATE__': JSON.stringify(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  '__SENTRY_PROFILES_SAMPLE_RATE__': JSON.stringify(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
};

export default defineConfig({
  main: {
    define: sentryDefines,
    plugins: [externalizeDepsPlugin({
      // Bundle these packages into the main process (they won't be in node_modules in packaged app)
      exclude: [
        'uuid',
        'chokidar',
        'kuzu',
        'electron-updater',
        '@electron-toolkit/utils',
        // Sentry and its transitive dependencies
        '@sentry/electron',
        '@sentry/core',
        '@sentry/node',
        '@sentry/utils',
        '@opentelemetry/instrumentation',
        'debug',
        'ms',
        // Additional packages used in main process that need bundling
        'dotenv',
        'electron-log',
        'minimatch',
        'proper-lockfile',
        'semver',
        'zod',
        '@anthropic-ai/sdk'
      ]
    })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        // Only node-pty needs to be external (native module rebuilt by electron-builder)
        external: ['@lydell/node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@features': resolve(__dirname, 'src/renderer/features'),
        '@components': resolve(__dirname, 'src/renderer/shared/components'),
        '@hooks': resolve(__dirname, 'src/renderer/shared/hooks'),
        '@lib': resolve(__dirname, 'src/renderer/shared/lib')
      }
    },
    server: {
      watch: {
        // Ignore directories to prevent HMR conflicts during merge operations
        // Using absolute paths and broader patterns
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.worktrees/**',
          // Support both old (.auto-claude) and new (.ouro) directory names
          '**/.auto-claude/**',
          '**/.ouro/**',
          '**/out/**',
          // Ignore the parent autonomous-coding directory's worktrees
          resolve(__dirname, '../.worktrees/**'),
          resolve(__dirname, '../.auto-claude/**'),
          resolve(__dirname, '../.ouro/**'),
        ]
      }
    }
  }
});
