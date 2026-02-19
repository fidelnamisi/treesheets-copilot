
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    retries: 0,
    workers: 1, // Electron allows only one window/instance usually for testing context
    use: {
        trace: 'on-first-retry',
    },
});
