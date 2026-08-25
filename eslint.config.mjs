import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architectural guard rails that are enforced by the linter:
 *
 *  1. The raw Prisma client may only be imported inside `lib/db`, the worker
 *     bootstrap, seeds and tests. Everything else goes through the
 *     ActorContext aware repositories so that authorization cannot be skipped.
 *  2. `process.env` may only be read in `lib/config/env.ts` and in build or
 *     script entry points. Application code uses the validated `env` object.
 *  3. `console` is reserved for scripts. Application code uses the structured
 *     logger so that redaction is always applied.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist-worker/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "node_modules/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/client",
              message:
                "Import repositories from @/lib/db/repositories instead. Direct Prisma access bypasses ActorContext authorization.",
            },
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message:
                "Use the shared client from lib/db/client.ts inside lib/db only. Types and enums may be imported freely.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            "Read configuration from @/lib/config/env instead of process.env so that every variable is validated.",
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Read configuration from @/lib/config/env instead of process.env so that every variable is validated.",
        },
      ],
    },
  },
  {
    files: [
      "lib/db/**/*.ts",
      "workers/**/*.ts",
      "prisma/**/*.ts",
      "scripts/**/*.ts",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "e2e/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["lib/**/*.ts"],
    ignores: ["lib/auth/**/*.ts", "lib/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/client",
              message:
                "Import repositories from @/lib/db/repositories instead. Direct Prisma access bypasses ActorContext authorization.",
            },
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message:
                "Use the shared client from lib/db/client.ts inside lib/db only. Types and enums may be imported freely.",
            },
            {
              name: "next",
              message:
                "Domain logic in lib/** must not import Next.js. Keep framework adapters in app/** or lib/auth.",
            },
          ],
          patterns: [
            {
              group: ["next/*", "next/dist/*", "@/app", "@/app/*"],
              message:
                "Domain logic in lib/** must not import Next.js or app/**. Keep framework adapters in app/** or lib/auth.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "lib/config/env.ts",
      "next.config.ts",
      "vitest.config.ts",
      "playwright.config.ts",
      "prisma/**/*.ts",
      "scripts/**/*.ts",
      "workers/**/*.ts",
      "tests/**/*.ts",
      "e2e/**/*.ts",
      "instrumentation.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
