/* global module */

/** Shell packages plugins never import; @brains/plugins serves them. */
const shellServicePackages = [
  "@brains/core",
  "@brains/job-queue",
  "@brains/identity-service",
  "@brains/entity-service",
  "@brains/content-service",
  "@brains/conversation-service",
  "@brains/messaging-service",
  "@brains/ai-service",
];

/** Shell packages the plugin context serves at runtime: auth, MCP tools, runtime state, templates. */
const contextServedPackages = [
  "@brains/auth-service",
  "@brains/mcp-service",
  "@brains/runtime-state",
  "@brains/templates",
];

const shellImportMessage =
  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.";

function shellImportBan(packages, extraPaths = []) {
  return [
    "error",
    {
      paths: [
        ...packages.map((name) => ({ name, message: shellImportMessage })),
        ...extraPaths,
      ],
      patterns: [
        {
          group: packages.map((name) => `${name}/*`),
          message: shellImportMessage,
        },
      ],
    },
  ];
}
/**
 * The plugin class bases. A package converted to a declarative definition
 * imports none of them: it declares what it is, and the runtime alone
 * carries those bases until they are removed.
 */
const pluginClassBases = [
  "BasePlugin",
  "EntityPlugin",
  "HookedPublicPlugin",
  "InterfacePlugin",
  "MessageInterfacePlugin",
  "PublicPlugin",
  "ServicePlugin",
];

/** Interface packages converted to declarative definitions. */
const convertedInterfacePackages = [
  "chat-repl",
  "email",
  "mcp",
  "a2a",
  "chat",
  "web-chat",
];

const classBaseBan = {
  name: "@brains/plugins",
  importNames: pluginClassBases,
  message:
    "A converted package is a declarative definition: declare it with @brains/sdk and reach first-party runtime capabilities through @brains/sdk/internal/*, never a plugin class base.",
};

/** Syntax banned everywhere; see each entry for why. */
const restrictedSyntax = [
  {
    // A synchronous spawn has to collect its child's exit itself, and when
    // it does not the process spins at 100% CPU with the child left
    // `<defunct>` — uninterruptible, because the loop never yields. Under
    // `bun test --parallel` that took whole runs down: a child holding
    // inherited stdio keeps the pipe the runner waits on for EOF.
    //
    // Restricted everywhere rather than in tests alone. The same spin in a
    // running Brain is worse than in a test, and the one production caller
    // was a bootstrap path that awaits just as well.
    selector:
      "CallExpression[callee.object.name='Bun'][callee.property.name='spawnSync']",
    message:
      "Use runProcess/runProcessOrThrow from @brains/utils/run-process: a synchronous spawn can leave a <defunct> child and spin the process.",
  },
  {
    selector:
      'ConditionalExpression[test.operator="instanceof"][test.right.name="Error"][consequent.property.name="message"]',
    message:
      "Use getErrorMessage(error, fallback?) from @brains/utils/error instead of an inline instanceof-Error ternary.",
  },
  {
    selector: 'JSXAttribute[name.name="class"]',
    message: "Use React-compatible className in TSX.",
  },
  {
    selector: 'JSXAttribute[name.name="for"]',
    message: "Use React-compatible htmlFor in TSX.",
  },
  {
    selector: 'JSXAttribute[name.name="srcset"]',
    message: "Use React-compatible srcSet in TSX.",
  },
  {
    selector: "JSXAttribute[name.name=/^on[a-z]/]",
    message:
      "React does not render lowercase string event handlers. Bind static interactions from the site shell instead.",
  },
  {
    selector:
      'JSXAttribute[name.name="style"][value.type="Literal"], JSXAttribute[name.name="style"] > JSXExpressionContainer > TemplateLiteral',
    message: "Use a React-compatible style object in TSX.",
  },
  {
    selector: "JSXAttribute[name.name=/^(fill|font|letter|stop|stroke|text)-/]",
    message: "Use React-compatible camelCase SVG attributes in TSX.",
  },
];

/**
 * Full read scope reaches every entity, restricted ones included. Production
 * code opts into it through internalFullScope(reason), whose call is the
 * audit record that the escalation was deliberate.
 */
const rawFullScope = {
  selector: 'Property[key.name="visibilityScope"][value.value="restricted"]',
  message:
    "Use internalFullScope(reason) from @brains/plugins for a deliberate full-scope read, or pass the caller's scope.",
};

/**
 * A raw `messaging.send` answers with whichever subscriber replies first and
 * leaves the reply untyped. Entities, plugins and interfaces send events with
 * `broadcast: true` and make every other cross-package call through a bus
 * contract.
 */
const busContractMessage =
  "Use context.messaging.request/command/gather with a bus contract (defineBusContract in @brains/contracts); a raw messaging.send is only for an event sent with broadcast: true.";
const messagingObject =
  ":matches([object.name='messaging'], [object.property.name='messaging'])";
const rawBusSend = [
  {
    selector: `MemberExpression[property.name='send']${messagingObject}:not(CallExpression:has(> ObjectExpression:has(> Property[key.name='broadcast'][value.value=true])) > .callee)`,
    message: busContractMessage,
  },
  {
    selector:
      "VariableDeclarator:matches([init.name='messaging'], [init.property.name='messaging']) > ObjectPattern > Property[key.name='send']",
    message: busContractMessage,
  },
];

/**
 * A type argument on a messaging subscription casts a payload nobody checked:
 * a malformed one is read as whatever fields it lacks. Entities, plugins and
 * interfaces subscribe through the event's typed channel, which validates the
 * payload and refuses a malformed one.
 */
const castSubscription = {
  selector: `CallExpression[typeArguments] > MemberExpression.callee[property.name=/^(subscribe|observe|subscribeExecution)$/]${messagingObject}`,
  message:
    "Subscribe through the event's typed channel (defineChannel in @brains/contracts, e.g. publishCompletedChannel, or entityUpdatedChannel from @brains/plugins) instead of type arguments, which cast a payload nobody validated.",
};

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["node_modules/", "dist/", "*.config.*"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    projectService: {
      allowDefaultProject: [
        "*.js",
        "*.mjs",
        "*.cjs",
        "scripts/*.js",
        "scripts/*.mjs",
        "scripts/*.cjs",
        "shared/eslint-config/*.js",
        "packages/*/scripts/*.js",
        "packages/*/scripts/*.mjs",
        "packages/*/scripts/*.cjs",
        "sites/*/scripts/*.js",
        "sites/*/scripts/*.mjs",
        "sites/*/scripts/*.cjs",
      ],
    },
  },
  overrides: [
    {
      // Entities, plugins and interfaces reach shell packages through
      // @brains/plugins only. Not shell/plugins, the plugins package itself.
      files: [
        "**/entities/**/*.ts",
        "**/plugins/**/*.ts",
        "**/interfaces/**/*.ts",
      ],
      excludedFiles: ["**/shell/plugins/**/*.ts"],
      rules: {
        "no-restricted-imports": shellImportBan(shellServicePackages),
      },
    },
    {
      // Their production code also stays off the shell packages whose
      // capabilities the plugin context serves; tests may still build them.
      files: [
        "**/entities/*/src/**/*.ts",
        "**/entities/*/src/**/*.tsx",
        "**/plugins/*/src/**/*.ts",
        "**/plugins/*/src/**/*.tsx",
        "**/plugins/*/ui-react/src/**/*.ts",
        "**/plugins/*/ui-react/src/**/*.tsx",
        "**/interfaces/*/src/**/*.ts",
        "**/interfaces/*/src/**/*.tsx",
      ],
      excludedFiles: [
        "**/shell/plugins/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/src/test/**",
      ],
      rules: {
        "no-restricted-imports": shellImportBan([
          ...shellServicePackages,
          ...contextServedPackages,
        ]),
      },
    },
    {
      // A converted interface's production code also imports no plugin class
      // base. Restates the import restrictions above for these files.
      files: convertedInterfacePackages.flatMap((name) => [
        `**/interfaces/${name}/src/**/*.ts`,
        `**/interfaces/${name}/src/**/*.tsx`,
      ]),
      excludedFiles: ["**/*.test.ts", "**/*.test.tsx", "**/src/test/**"],
      rules: {
        "no-restricted-imports": shellImportBan(
          [...shellServicePackages, ...contextServedPackages],
          [classBaseBan],
        ),
      },
    },
    {
      files: ["**/src/**/*.ts", "**/src/**/*.tsx"],
      excludedFiles: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/src/test/**",
        "**/entity-service/src/internal-scope.ts",
      ],
      rules: {
        "no-restricted-syntax": ["error", ...restrictedSyntax, rawFullScope],
      },
    },
    {
      // Entity, plugin and interface production code sends no raw requests
      // and casts no subscription's payload. Listed last: it restates the
      // restrictions above for these files.
      files: [
        "**/entities/*/src/**/*.ts",
        "**/entities/*/src/**/*.tsx",
        "**/plugins/*/src/**/*.ts",
        "**/plugins/*/src/**/*.tsx",
        "**/interfaces/*/src/**/*.ts",
        "**/interfaces/*/src/**/*.tsx",
      ],
      excludedFiles: [
        "**/shell/plugins/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/src/test/**",
      ],
      rules: {
        "no-restricted-syntax": [
          "error",
          ...restrictedSyntax,
          rawFullScope,
          ...rawBusSend,
          castSubscription,
        ],
      },
    },
    {
      // Shared and shell production code that subscribes through a plugin
      // context's messaging casts no payload either. The message bus itself is
      // exempt: it is what the typed channels are built on. Restates the
      // `**/src/**` restrictions above for these files.
      files: [
        "**/shared/*/src/**/*.ts",
        "**/shared/*/src/**/*.tsx",
        "**/shell/*/src/**/*.ts",
        "**/shell/*/src/**/*.tsx",
      ],
      excludedFiles: [
        "**/shell/messaging-service/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/src/test/**",
        "**/entity-service/src/internal-scope.ts",
      ],
      rules: {
        "no-restricted-syntax": [
          "error",
          ...restrictedSyntax,
          rawFullScope,
          castSubscription,
        ],
      },
    },
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/explicit-module-boundary-types": "warn",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "warn",
    // `@ts-ignore` is banned outright: it suppresses whatever error happens to
    // be on the next line, and keeps suppressing after the error is gone.
    // `@ts-expect-error` says the same thing and fails once the code type-checks,
    // so it cannot outlive its reason. Every remaining use is a negative type
    // test — proving the compiler rejects a bad input — and each carries a
    // description saying which rejection it is pinning.
    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-ignore": true,
        "ts-expect-error": "allow-with-description",
        minimumDescriptionLength: 10,
      },
    ],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: {
          arguments: false,
          attributes: false,
          properties: false,
          returns: false,
          variables: false,
        },
      },
    ],
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-unnecessary-condition": "error",
    "no-return-await": "off",
    "@typescript-eslint/return-await": "error",

    // Type Consistency Rules for Personal Brain Architecture
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/no-duplicate-type-constituents": "error",
    "@typescript-eslint/no-redundant-type-constituents": "off",
    // ESLint 10 changed its recommended core rule set. Keep the ESLint 8
    // baseline strictness explicit, then opt into selected new core rules
    // through separate follow-up strictness slices.
    "no-inner-declarations": "error",
    "no-useless-assignment": "error",
    "preserve-caught-error": "error",
    "no-restricted-syntax": ["error", ...restrictedSyntax],
  },
};
