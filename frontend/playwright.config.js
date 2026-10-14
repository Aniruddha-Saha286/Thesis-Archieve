import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 30000, use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium', channel: 'msedge', trace: 'off' }, webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.radar-test.config.js', url: 'http://127.0.0.1:5178', reuseExistingServer: false }, reporter: 'list' });
