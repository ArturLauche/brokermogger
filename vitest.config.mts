import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Must run before React is imported. A leftover NODE_ENV=production (for
// example after `next build`) loads react-dom's production build, which has
// no React.act and breaks every component test. Object.assign avoids the
// readonly NODE_ENV typing from @types/node.
Object.assign(process.env, { NODE_ENV: "test" });

/**
 * Three test projects:
 *   unit         domain logic and isolated local CLI checks; no database or network
 *   components   React Testing Library against jsdom
 *   integration  real PostgreSQL from docker compose (TEST_DATABASE_URL)
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    passWithNoTests: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.setup.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/components.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/integration.global.ts"],
          setupFiles: ["tests/setup/integration.setup.ts"],
          // Integration tests share one database and truncate between files.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
