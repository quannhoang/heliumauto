// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: {
    timeout: 10000, // 10 seconds for all expect() calls
  },
});