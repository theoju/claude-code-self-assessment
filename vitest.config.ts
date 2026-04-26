import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": ROOT },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "scripts/__tests__/**/*.test.mjs",
      "app/**/__tests__/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "scripts/**/*.mjs",
        "app/lib/**/*.{ts,tsx}",
        "app/components/**/*.{ts,tsx}",
      ],
      exclude: [
        "scripts/__tests__/**",
        "scripts/__benchmarks__/**",
        "scripts/launchd/**",
        "scripts/setup.sh",
        "scripts/run-assessment.mjs",
        "scripts/run-coverage.mjs",
        "scripts/test/**",
        "app/lib/coverage.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 65,
        statements: 60,
      },
    },
    benchmark: {
      include: ["scripts/__benchmarks__/*.bench.mjs"],
      reporters: ["default"],
      outputJson: resolve(ROOT, "coverage", "bench.json"),
    },
  },
});
