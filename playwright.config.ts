import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  use: { baseURL: process.env.DONNA_BASE_URL ?? 'http://localhost:3000' },
  reporter: 'list'
});
