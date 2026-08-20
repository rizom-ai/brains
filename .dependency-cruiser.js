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
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "Unresolved imports hide dependencies and make boundary checks incomplete",
      from: {},
      to: {
        couldNotResolve: true,
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
          "(^|/)(babel|postcss|webpack|tailwind)\\.config\\.(js|cjs|mjs|ts|json)$", // Build configs
          "^shared/eslint-config/index\\.js$", // ESLint config entry
          "/dist/.*\\.(js|mjs)$", // Build output files
          "/test/fixtures/", // Test fixture files
          "hydration\\.js$", // Client-side hydration entry points
          "^docs/design/", // Design mockups; scripts are loaded by the sibling .html files
          "^scripts/dependency-cruiser-typescript-loader\\.mjs$", // Loaded through node:module.register by the compatibility preload
          "/test-apps/", // Dev fixture apps; src/site.ts is convention-loaded by shell/app
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
      name: "plugins-can-only-import-shell-and-shared",
      severity: "error",
      comment: "Plugins can only import from shell/* and shared/* packages",
      from: {
        path: "^plugins/",
        // Covered by the companion rule below with a wider builtin allowlist
        pathNot: [
          "^plugins/directory-sync/(test/|src/lib/content-remote-bootstrap\\.ts$)",
          "^plugins/studio/scripts/",
        ],
      },
      to: {
        path: "^((?!shell/|shared/|plugins/|packages/ui/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "plugins-git-bootstrap-can-use-process-builtins",
      severity: "error",
      comment:
        "directory-sync's git bootstrap and its git tests legitimately shell out " +
        "(child_process) and open sockets (net); otherwise same restrictions as " +
        "plugins-can-only-import-shell-and-shared",
      from: {
        path: "^plugins/directory-sync/(test/|src/lib/content-remote-bootstrap\\.ts$)",
      },
      to: {
        path: "^((?!shell/|shared/|plugins/|packages/ui/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url|child_process|net)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "plugin-build-scripts-can-use-module-builtin",
      severity: "error",
      comment:
        "Studio build scripts use createRequire from the module builtin; " +
        "otherwise they follow the standard plugin boundary",
      from: {
        path: "^plugins/studio/scripts/",
      },
      to: {
        path: "^((?!shell/|shared/|plugins/|packages/ui/|node_modules/).)*$",
        pathNot: ["^(bun:test|path|fs|fs/promises|crypto|os|url|module)$"],
      },
    },
    {
      name: "no-entity-to-entity-imports",
      severity: "error",
      comment:
        "Entity packages should not import from other entity packages - use shared packages instead",
      from: {
        path: "^entities/([^/]+)/",
        pathNot: "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow integration tests
      },
      to: {
        path: "^entities/(?!$1/)",
      },
    },
    {
      name: "entities-can-only-import-shell-and-shared",
      severity: "error",
      comment:
        "Entity packages can only import from shell/*, shared/*, and the public authoring surface (packages/brain-sdk). The SDK is the boundary this repo publishes as @rizom/brain/*, so an entity reaching for it is the shape the npm-package-boundaries plan is moving every package toward — five already import nothing else.",
      from: {
        path: "^entities/",
      },
      to: {
        path: "^((?!shell/|shared/|entities/|packages/brain-sdk/|packages/ui/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url|dns/promises)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "interfaces-can-only-import-shell-and-shared",
      severity: "error",
      comment: "Interfaces can only import from shell/* and shared/* packages",
      from: {
        path: "^interfaces/",
        // Covered by the companion rule below with a wider builtin allowlist
        pathNot: ["^interfaces/web-chat/scripts/"],
      },
      to: {
        path: "^((?!shell/|shared/|interfaces/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url|events|net|tls)$", // Allow Node.js/Bun builtins
        ],
      },
    },
    {
      name: "interface-build-scripts-can-use-module-builtin",
      severity: "error",
      comment:
        "web-chat's build scripts legitimately use createRequire from the module " +
        "builtin; otherwise same restrictions as " +
        "interfaces-can-only-import-shell-and-shared",
      from: {
        path: "^interfaces/web-chat/scripts/",
      },
      to: {
        path: "^((?!shell/|shared/|interfaces/|node_modules/).)*$",
        pathNot: [
          "\\.(test|spec)\\.(ts|tsx|js|jsx)$", // Allow test files
          "^(bun:test|path|fs|fs/promises|crypto|os|url|module)$", // Allow Node.js/Bun builtins
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
    exclude: {
      path: "(^|/)dist/",
    },
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      // Resolution-only config that mirrors the per-package `@/*` path aliases
      // (the root tsconfig.json has no paths, which made aliased imports
      // unresolvable and produced false layering violations).
      fileName: "tsconfig.depcruise.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["bun", "types", "import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)",
      },
      archi: {
        collapsePattern:
          "^(shell|shared|plugins|entities|interfaces|sites|packages)/[^/]+",
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
