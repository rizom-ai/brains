/* global module */
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
      // Enforce import pattern for entities, plugins, and interfaces - shell packages must go through @brains/plugins
      // Note: This applies to top-level entities/*, plugins/*, and interfaces/*, NOT shell/plugins (the plugins package itself)
      files: [
        "**/entities/**/*.ts",
        "**/plugins/**/*.ts",
        "**/interfaces/**/*.ts",
      ],
      excludedFiles: ["**/shell/plugins/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@brains/core",
                message:
                  "Import from @brains/plugins instead. Shell internals should not be imported by entity, plugin, or interface packages.",
              },
              {
                name: "@brains/job-queue",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/identity-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/entity-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/content-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/conversation-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/messaging-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/ai-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
            ],
            patterns: [
              {
                group: [
                  "@brains/core/*",
                  "@brains/job-queue/*",
                  "@brains/identity-service/*",
                  "@brains/entity-service/*",
                  "@brains/content-service/*",
                  "@brains/conversation-service/*",
                  "@brains/messaging-service/*",
                  "@brains/ai-service/*",
                ],
                message:
                  "Import from @brains/plugins instead. Shell internals should not be imported by entity, plugin, or interface packages.",
              },
            ],
          },
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
    "no-restricted-syntax": [
      "error",
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
        selector:
          "JSXAttribute[name.name=/^(fill|font|letter|stop|stroke|text)-/]",
        message: "Use React-compatible camelCase SVG attributes in TSX.",
      },
    ],
  },
};
