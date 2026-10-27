import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Scoped data access (D-25): only src/server/db talks to the database. Everything else
    // imports the data-access layer from "@/server/db". Tests may reach the internals.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/db/**", "src/test/**", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db/*", "**/server/db/*"],
              message: 'Import the data-access layer from "@/server/db" instead (D-25).',
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "better-sqlite3"],
              message: "Database access belongs in src/server/db (D-25).",
            },
          ],
        },
      ],
    },
  },
  // Turns off the formatting rules that Prettier handles. Keep last.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "data/**",
    "next-env.d.ts",
    // Claude Code worktrees: other checkouts of this repository, with their own build output.
    ".claude/**",
  ]),
]);

export default eslintConfig;
