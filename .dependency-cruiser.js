/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make code hard to maintain and can cause runtime issues",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Orphaned files are unused and should be removed",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$", // dot files
          "\\.d\\.ts$", // TypeScript declaration files
          "(^|/)tsconfig\\.json$", // TypeScript config
          "(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$", // Build configs
        ],
      },
      to: {},
    },
    {
      name: "no-plugin-to-plugin-imports",
      severity: "error",
      comment:
        "Plugins should not import from other plugins - use shell packages instead",
      from: {
        path: "^plugins/([^/]+)/",
        pathNot: "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow integration tests
      },
      to: {
        path: "^plugins/(?!$1/)",
      },
    },
    {
      name: "no-interface-to-interface-imports",
      severity: "error",
      comment:
        "Interfaces should not import from other interfaces - use shell packages instead",
      from: {
        path: "^interfaces/([^/]+)/",
      },
      to: {
        path: "^interfaces/(?!$1/)",
      },
    },
    {
      name: "no-app-to-app-imports",
      severity: "error",
      comment: "Apps should not import from other apps",
      from: {
        path: "^apps/([^/]+)/",
      },
      to: {
        path: "^apps/(?!$1/)",
      },
    },
    {
      name: "plugins-can-only-import-shell-and-shared",
      severity: "error",
      comment: "Plugins can only import from shell/* and shared/* packages",
      from: {
        path: "^plugins/",
      },
      to: {
        path: "^((?!shell/|shared/|plugins/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "interfaces-can-only-import-shell-and-shared",
      severity: "error",
      comment: "Interfaces can only import from shell/* and shared/* packages",
      from: {
        path: "^interfaces/",
      },
      to: {
        path: "^((?!shell/|shared/|interfaces/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "not-to-deprecated",
      severity: "warn",
      comment: "Avoid using deprecated packages",
      from: {},
      to: {
        dependencyTypes: ["deprecated"],
      },
    },
    {
      name: "no-test-to-non-test",
      severity: "error",
      comment: "Test files should not be imported by non-test files",
      from: {
        pathNot: "\\.(test|spec)\\.(ts|tsx|js|jsx)$",
      },
      to: {
        path: "\\.(test|spec)\\.(ts|tsx|js|jsx)$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)",
      },
      archi: {
        collapsePattern: "^(shell|plugins|interfaces|shared|apps)/[^/]+",
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
