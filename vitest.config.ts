import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode ?? "test", process.cwd(), ""),
    testTimeout: 30_000,
  },
}));
