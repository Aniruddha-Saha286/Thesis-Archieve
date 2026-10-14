import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ envDir: '.radar-test-env', plugins: [react()], test: { environment: 'jsdom', include: ['tests/**/*.test.jsx'], setupFiles: ['tests/setup.js'] } });
