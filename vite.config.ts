import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        // Demo and prod deploy from separate directories so a stale or
        // wrong-mode build in `dist` can't be published to the other target.
        outDir: env.VITE_BUILD_OUT_DIR || 'dist',
      },
      test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        include: ['src/**/*.test.{ts,tsx}'],
        // Rules tests need the Firestore emulator, so they are opt-in via
        // `npm run test:rules` rather than part of the default unit run.
        exclude: ['**/node_modules/**', '**/dist/**', 'src/test/firestore.rules.test.ts'],
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
