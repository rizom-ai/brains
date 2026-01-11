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
  },
  overrides: [
    {
      // Enforce import pattern for plugins and interfaces - shell packages must go through @brains/plugins
      // Note: This applies to plugins/* and interfaces/*, NOT shell/plugins (the plugins package itself)
      files: ["**/plugins/**/*.ts", "**/interfaces/**/*.ts"],
      excludedFiles: ["**/shell/plugins/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@brains/datasource",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/job-queue",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/profile-service",
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
                name: "@brains/permission-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/render-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/identity-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
              },
              {
                name: "@brains/ai-service",
                message:
                  "Import from @brains/plugins instead. Shell packages should be accessed through the plugins package.",
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
    // "@typescript-eslint/no-unnecessary-type-assertion": "error", // Requires type info
    "@typescript-eslint/prefer-nullish-coalescing": "warn",
    "@typescript-eslint/prefer-optional-chain": "warn",
    "@typescript-eslint/ban-ts-comment": [
      "warn",
      {
        "ts-ignore": "allow-with-description",
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
    "@typescript-eslint/consistent-type-imports": "warn",
    "@typescript-eslint/no-unnecessary-condition": "warn",
    "no-return-await": "off",
    "@typescript-eslint/return-await": "error",

    // Type Consistency Rules for Personal Brain Architecture
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/no-duplicate-type-constituents": "error",
    "@typescript-eslint/no-redundant-type-constituents": "off",
  },
};
