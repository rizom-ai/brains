import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

/*
 * `no-restricted-syntax` entries are shared rather than written per block.
 *
 * Flat config replaces a rule's options when a later block sets the same rule —
 * it does not merge them. Two blocks below both restrict syntax in test files,
 * and for a while the second silently switched the first off wherever their
 * file lists overlapped: the cast ban was inert in every package covered by the
 * sleep ban, including two layers this branch had already declared locked.
 *
 * Composing the entries from these constants makes that impossible to
 * reintroduce, because a block that wants one restriction has to name the
 * others it keeps.
 */
const NO_UNSAFE_TEST_CAST = {
  selector: "TSAsExpression > TSAsExpression > TSUnknownKeyword.typeAnnotation",
  message:
    "Do not use `as unknown as` in a test. Use a @brains/test-utils factory, an honest narrow type, or narrow the parameter of the code under test.",
};

/**
 * Packages whose test suites hold no type assertions. See the config block
 * that consumes this for why the migration is per-package.
 */
const TEST_CAST_FREE_PACKAGES = [
  "entities/agent-discovery",
  "entities/assessment",
  "entities/blog",
  "entities/conversation-memory",
  "entities/image",
  "entities/link",
  "entities/note",
  "entities/portfolio",
  "entities/social-media",
  "entities/topics",
  "entities/wishlist",
  "interfaces/a2a",
  "interfaces/chat-repl",
  "interfaces/mcp",
  "packages/brains-ops",
  "packages/build-tools",
  "plugins/admin",
  "plugins/analytics",
  "plugins/atproto",
  "plugins/atproto-registry",
  "plugins/content-pipeline",
  "plugins/dashboard",
  "plugins/email-workflows",
  "plugins/newsletter",
  "plugins/obsidian-vault",
  "plugins/playbooks",
  "plugins/profile",
  "plugins/site-content",
  "plugins/stock-photo",
  "shared/atproto-contracts",
  "shared/console-theme",
  "shared/content-formatters",
  "shared/http-signatures",
  "shared/media-page-composer",
  "shared/site-composition",
  "shared/site-engine",
  "shared/theme-default",
  "shared/theme-rizom-ai",
  "shell/ai-evaluation",
  "shell/auth-service",
  "shell/content-service",
  "shell/entity-service",
  "shell/job-queue",
  "shell/mcp-service",
  "shell/messaging-service",
  "shell/recurring-checks",
  "sites/rizom-ai",
];

const NO_SLEEP_SYNCHRONIZATION = {
  selector:
    "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
  message:
    "Do not synchronize on a sleep. Use waitUntil() for work, a deferred for ordering, or fake timers for elapsed-time behaviour. If a real duration is genuinely needed, use Bun.sleep(ms) behind a named helper that says why.",
};

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
    // Test files in the layers Phase 6 has cleared.
    //
    // A cast on an inline mock does the same damage as one in a shared factory,
    // just locally: it asserts a shape instead of checking it, so the mock goes
    // stale silently while the test keeps passing. Every cast removed from
    // these layers was hiding something — a handler declared to take no
    // argument where the real one is passed a message, a provider asserting a
    // return shape its contract does not promise, a private method reached
    // through the class.
    //
    // Reach for, in order: a shared factory from `@brains/test-utils`, an
    // honest narrow type (`Pick<...>` or a local interface), or narrowing the
    // parameter of the code under test when it asks for more than it uses.
    //
    // Enabled per layer as each one reaches zero, so the layers already done
    // cannot regress while the rest are outstanding. Add a layer here when its
    // count hits zero — `shell` remains.
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", NO_UNSAFE_TEST_CAST],
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
      // Both entries: this block's files are test files, so the cast ban
      // applies to them too and would otherwise be replaced by this one.
      "no-restricted-syntax": [
        "error",
        NO_UNSAFE_TEST_CAST,
        NO_SLEEP_SYNCHRONIZATION,
      ],
    },
  },
  {
    // Type assertions are banned in shipped source.
    //
    // `as T` asserts a shape instead of checking it: the compiler stops
    // looking and the claim is never tested at runtime. Removing ~185 of them
    // from this repo turned up real defects each time — an svg+xml laundered
    // into an ImageFormat, a `<select>` value asserted into a role, deploy
    // errors read as `success: undefined`, entity sorts on metadata fields
    // that were stripped before they ever reached the database.
    //
    // Reach for, in order: a Zod schema parsed at the boundary, a type
    // predicate that actually inspects the value, or fixing the upstream type
    // so the assertion has nothing to correct.
    //
    // An assertion that genuinely cannot be removed stays, with a disable
    // naming why — `eslint-comments/require-description` makes the reason
    // mandatory, and an unused directive is a warning, which `--max-warnings 0`
    // turns into a failure. So an exemption left behind after its cast is
    // gone breaks the build instead of accumulating.
    //
    // `as const` is not an assertion in this sense and is not reported.
    //
    // Tests hold ~600 assertions and are being migrated package by package
    // after shipped source reaches zero. Delete an entry from `ignores` as its
    // package lands, so the packages already done cannot regress while the
    // rest are outstanding.
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "**/test/**",
      "**/*.test.{ts,tsx}",
      "shared/test-utils/**",
      "**/scripts/**",
    ],
    plugins: { "eslint-comments": eslintComments },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "eslint-comments/require-description": [
        "error",
        { ignore: ["eslint-enable"] },
      ],
    },
  },
  {
    // Test suites that have reached zero type assertions.
    //
    // The ban above exempts tests while ~600 of them are migrated. This block
    // re-enables it per package as each one lands, so a package already done
    // cannot regress while the rest are outstanding. Add an entry when a
    // package hits zero; the list only grows.
    // Both patterns: some packages keep their tests beside the source they
    // cover rather than under `test/`, and a list that named only `test/`
    // silently locked nothing in those.
    files: TEST_CAST_FREE_PACKAGES.flatMap((pkg) => [
      `${pkg}/test/**/*.{ts,tsx}`,
      `${pkg}/src/**/*.test.{ts,tsx}`,
    ]),
    plugins: { "eslint-comments": eslintComments },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "eslint-comments/require-description": [
        "error",
        { ignore: ["eslint-enable"] },
      ],
    },
  },
  {
    // Repository-root scripts.
    //
    // `bun scripts/lint.mjs` drives turbo, and turbo only visits workspace
    // packages, so nothing linted this directory at all. That included the
    // guard tests — the wiring inventory, the architecture check, the
    // deprecation verifier — which exist to protect every other package.
    //
    // These files run under Bun with Node globals available; the shared config
    // already lists them in `allowDefaultProject` but never declared what they
    // may reference, so every `process` read them as undefined.
    files: ["scripts/**/*.{ts,mjs,cjs,js}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        Bun: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
      },
    },
  },
  {
    // CommonJS by necessity: this one is loaded through NODE_OPTIONS
    // --require, which cannot take an ES module.
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "writable",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
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
