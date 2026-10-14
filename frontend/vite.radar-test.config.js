import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Fixture preview never reads the application's real environment files.
export default defineConfig({ envDir: '.radar-test-env', plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 5178, strictPort: true } });
