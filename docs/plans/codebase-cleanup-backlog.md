# Codebase cleanup backlog

## Status

Reference backlog. These findings came out of the shell-layer
refactoring audit (2026-06-10, shipped as the shell-cleanup work) but
fall outside any active plan. Each is small enough that it doesn't
warrant its own plan yet; recorded here so they don't evaporate.
Findings that grow an owner move into a real plan and get removed from
this list.

## Findings

### CSS-as-string monoliths

- `interfaces/web-chat/src/chat-page.ts` — 1,981 lines, ~1,600 of them
  one CSS string literal embedded in TypeScript.
- `plugins/dashboard/src/render/styles/components.ts` — 1,122 lines of
  component CSS packed into a single template-string export.

Both make styling unmaintainable and undiffable. Extract to dedicated
style modules (or the shared theme/ui packages) next time either
surface gets real styling work.

### `@brains/utils` grab-bag split

Long-known: the package mixes zod re-export, Logger, ID generation,
markdown, YAML, and progress reporting. It needs a deliberate split,
not more bandages. Related context: `npm-package-boundaries.md` already
decided not to publish it as the SDK.

### tsconfig inheritance drift

`plugins/directory-sync/tsconfig.json` and `brains/relay/tsconfig.json`
extend `../../tsconfig.json` directly instead of
`@brains/typescript-config/base.json` like every other package. Note
`base.json` itself extends the root config and only adds
`baseUrl`/`paths`, so the behavioral drift is just the missing path
aliases — but the package-name indirection is the convention. Two-line
fix plus a `@brains/typescript-config` devDependency in each; ride
along with any commit touching those packages.
