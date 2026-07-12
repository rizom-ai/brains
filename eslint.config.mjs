import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "old-code-reference/**",
      "sample-code/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/.eslintrc.cjs",
      "**/*.boot.js",
      "**/*.canvas.js",
      "**/.turbo/**",
      "**/.cache/**",
      "**/*.tmp",
      "**/*.temp",
    ],
  },
  ...compat.config({
    extends: ["@brains/eslint-config"],
    parserOptions: {
      tsconfigRootDir: __dirname,
    },
  }),
  {
    // Vendored shadcn/ui and AI Elements primitives — kept in sync with the
    // upstream registry. Adding explicit return types here would diverge from
    // upstream and make future syncs painful.
    files: [
      "interfaces/web-chat/ui-react/src/ui/**/*.{ts,tsx}",
      "interfaces/web-chat/ui-react/src/ai-elements/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
];
