import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// The Cloudflare plugin runs the Worker alongside the client in dev/build.
// Keep it out of vitest so tests stay pure Node.
export default defineConfig({
  plugins: [preact(), ...(process.env.VITEST ? [] : [cloudflare()])],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
