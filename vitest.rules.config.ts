import { defineConfig } from 'vitest/config';

/**
 * Firestore security-rules tests. Separate from the main unit config because
 * they talk to the Firestore emulator and must not run in jsdom.
 *
 * Start the emulator first:
 *   firebase emulators:start --only firestore
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/firestore.rules.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
