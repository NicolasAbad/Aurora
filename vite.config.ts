/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Rule 11: dev tooling (sim/, time-warp) is env-gated out of production builds.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __DEV_TOOLS__: JSON.stringify(mode !== 'production'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
}));
