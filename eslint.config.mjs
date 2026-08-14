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
    // Tests in these packages synchronize on conditions, not on durations.
    //
    // `await new Promise((r) => setTimeout(r, N))` cannot say what it is
    // waiting for, so it cannot notice when the thing it was waiting for stops
    // happening. Two tests in this repo passed for years with half their
    // subject dead, because the sleep only ever proved that time had passed.
    //
    // Reach for, in order:
    //   - `waitUntil(predicate, description)` from `@brains/test-utils`, when
    //     waiting for work to finish;
    //   - a deferred the test resolves, when the point is ordering rather than
    //     duration;
    //   - `jest.useFakeTimers` or `setSystemTime`, when elapsed time genuinely
    //     is the behaviour under test.
    //
    // A real duration still has a home: modelling how long a mocked operation
    // takes, or letting a window pass before asserting something did *not*
    // happen. Those use `Bun.sleep(ms)` behind a named helper — `pastIdleActorTtl()`
    // in ai-service is the worked example — so the call site states its reason
    // instead of leaving a bare number.
    //
    // Scoped to the packages Phase 5 has migrated. Add a package here as its
    // migration lands, rather than enabling the rule repo-wide and suppressing
    // it in the places that have not been done yet.
    files: [
      "plugins/directory-sync/test/**/*.ts",
      "shell/job-queue/test/**/*.ts",
      "shell/ai-service/test/**/*.ts",
      "interfaces/a2a/test/**/*.ts",
      "interfaces/chat/test/**/*.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
          message:
            "Do not synchronize on a sleep. Use waitUntil() for work, a deferred for ordering, or fake timers for elapsed-time behaviour. If a real duration is genuinely needed, use Bun.sleep(ms) behind a named helper that says why.",
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
