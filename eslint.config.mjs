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
    // Shared mock factories must stay assignable to the types they claim to
    // implement. `as unknown as` on a mock literal erases the only check that
    // would notice an interface gaining a member or changing a signature, so
    // the mock goes stale while every test using it still passes.
    //
    // Use `satisfies` on a fully populated literal, `PublicSurface<T>` plus a
    // single nominal cast for class types, or `genericSpy` where bun's mock()
    // has erased type parameters. Each of those names its reason; a bare
    // `as unknown as` does not.
    files: ["shared/test-utils/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > TSAsExpression > TSUnknownKeyword.typeAnnotation",
          message:
            "Do not use `as unknown as` in shared mocks — use `satisfies`, PublicSurface<T>, or genericSpy so interface drift fails to compile.",
        },
      ],
    },
  },
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
