# Plan: Restore TypeScript architecture enforcement

## Status

Implemented. `bun run arch:check` now validates the repository TypeScript/JavaScript graph, asserts source coverage, and runs in dedicated core-and-site CI.

## Corrected root cause

Dependency-cruiser 17 does recursively expand directories when a supported parser is available. The repository-wide graph disappeared when the root moved to TypeScript 7: dependency-cruiser 17 supports TypeScript versions below 7, while the TypeScript 7 package no longer exposes the classic compiler API. Dependency-cruiser consequently marked `.ts` and `.tsx` unavailable during directory discovery.

Passing explicit TypeScript files was not a sufficient workaround. Unsupported files appeared in the module inventory while their local imports remained unresolved, so a selected-versus-cruised file count could still false-green. The restored check therefore asserts the parser version and known resolved dependency edges as well as module presence.

## Implemented architecture

### Git-owned source inventory

`scripts/architecture-check.ts` obtains tracked and non-ignored local files with `git ls-files --cached --others --exclude-standard`. The pure selector includes authored `ts`, `tsx`, `mts`, `cts`, `js`, `jsx`, `mjs`, and `cjs` files, sorts and deduplicates them, and ignores files missing from the working tree.

Reviewed exclusions are centralized in `scripts/architecture-source-inventory.ts`:

- generated deploy-script copies in `packages/brain-cli/templates/deploy/scripts/`;
- generated deploy-script copies in `packages/brains-ops/templates/rover-pilot/deploy/scripts/`; and
- standalone packed/external-consumer graphs under `packages/brain-cli/test/fixtures/`, which have dedicated package tests.

Ignored local tools, `.direnv`, `node_modules`, and generated `dist` files cannot become initial sources.

### One TypeScript-capable graph

The Bun/TypeScript inventory driver sends the complete selected list over stdin to one bounded Node 24 worker. The worker calls dependency-cruiser's supported programmatic API exactly once, avoiding shell glob differences, argument-length limits, and split cycle analysis.

A scoped Node resolution hook maps dependency-cruiser's compiler lookup to the existing `typescript-legacy` package. Repository builds and typechecks continue to use TypeScript 7. The worker fails unless dependency-cruiser major 17 loads a TypeScript 6 compiler.

### Checked coverage and exit behavior

Coverage requires:

- every selected source to appear in the returned module inventory;
- reviewed exclusions to remain outside the graph;
- one known resolved dependency edge from each of `shell`, `shared`, `plugins`, `entities`, `interfaces`, `sites`, and `packages`;
- no `.direnv` or `dist` source module; and
- zero unexplained unresolved imports.

The summary reports selected, cruised, excluded, unresolved, and unresolved-local counts to stderr. Reporter output remains clean on stdout for JSON and DOT consumers.

Dependency-cruiser's JSON, DOT, and text reporters return zero even when the graph contains errors. The worker therefore derives the command status from the raw `summary.error` plus coverage failures instead of trusting reporter exit codes. The default `err` reporter remains the human-facing check output.

### Shared check and graph commands

- `bun run arch:check` validates and prints rule violations.
- `bun scripts/architecture-check.ts --reporter json` emits the complete JSON graph.
- `bun scripts/architecture-check.ts --reporter text` emits dependency edges.
- `bun run arch:graph` sends the same inventory and configuration through the DOT reporter and Graphviz.
- `bun run arch:test` pins selector, sentinel, reporter, and TypeScript compatibility behavior.

### Enforced rules

The restored graph keeps the documented existing boundaries and adds explicit failure for unresolved imports. Obsolete `apps/` and `layouts/` rules were removed, reporter collapse roots now match the current workspace families, and package export resolution includes `bun` and `types` conditions.

The entities family now has the same boundary posture as plugins and interfaces: entity packages may import only `shell/*` and `shared/*` (plus builtins), and never other entity packages outside their own tests. Both rules were verified to fire with injected entity-to-plugin and entity-to-entity probes.

The only new builtin exception is exact: Admin and CMS build scripts may import Node's `module` builtin for `createRequire`. Their other imports remain under the normal plugin boundary rule.

## Real graph cleanup

Enabling the supported parser exposed circular and forbidden imports that the old command had hidden. They were resolved without a baseline allowlist:

- CLI command result types no longer import through `run-command`.
- Media renderer browser contracts and entity mutation-admission contracts now live in dependency-neutral modules.
- Shell plugin runtime app-info, generation, handler, and AI contracts were separated from context implementations.
- Message-interface output types no longer import through the package barrel.
- Rizom site composition imports its base directly rather than through its own index.
- Dashboard widget primitives and component contracts moved to `@brains/ui-library`, removing plugin-to-plugin and entity-to-plugin UI coupling.
- Style-guide parsing/formatting contracts moved to `@brains/contracts`; Newsletter no longer imports the style-guide entity package.
- The well-known singleton lookups moved next to their contracts: `fetchStyleGuide`/`fetchVoiceGuidance` live in `@brains/contracts` and `fetchSiteInfo` (with the site-info body schema) in `@brains/site-composition`, both against minimal structural entity readers. Blog, decks, image, portfolio, social-media, and newsletter consume them from there, and the entity packages re-export for compatibility.
- Site build staging/completed payloads moved to `@brains/contracts` beside `SITE_CHANNELS`, removing blog's import from the site-builder plugin.
- Onboarding imports lifecycle starter contracts from `@brains/contracts`, not the Playbooks plugin.
- Generated package copies and standalone consumer fixtures received reviewed source-inventory exclusions.
- A stale unused web-chat collapsible component was removed.

The complete selected graph has zero errors, zero warnings, and zero unresolved imports.

## CI

`.github/workflows/architecture-ci.yml` is a dedicated architecture gate. It triggers for source files, package manifests, TypeScript configs, dependency-cruiser configuration, the architecture driver, the lockfile, and the workflow itself across both core and site roots. It runs:

1. `bun run arch:test`
2. `bun run arch:check`

This avoids the site exclusions in Core CI and keeps local and CI behavior identical without prebuilt output or a warm Turbo cache.

## Acceptance criteria

1. Every selected source appears in one dependency graph or a reviewed exclusion. **Met.**
2. Coverage includes shell, shared, plugins, entities, interfaces, sites, and packages. **Met through resolved structural sentinels.**
3. Local ignored files cannot alter output. **Met through Git selection and explicit graph assertions.**
4. Circular, forbidden, and unresolved dependencies fail the command. **Met through rules and raw-summary exit handling.**
5. Check and graph commands use identical inventory and configuration. **Met through the shared driver.**
6. CI covers both core and site changes. **Met through dedicated workflow paths.**
7. Documentation no longer claims unproven enforcement. **Met in the architecture overview and package-boundary plan.**

## Non-goals retained

- Replacing dependency-cruiser.
- Enforcing future npm publication boundaries before the package-boundary proof lands.
- Cruising third-party dependency source.
- Committing generated dependency graphs.
