# Knip Cleanup Plan

## Overview

Results from running [knip](https://knip.dev/) against the monorepo. Triaged into actionable items and false positives. Run `bunx knip` to verify current state before starting.

## Phase 1: Delete Dead Files (8 files)

Low risk — these files are not imported anywhere.

### chat-repl handlers (5 files)

Superseded by `shell/plugins/message-interface/` progress handler and newer components.

- [ ] `interfaces/chat-repl/src/components/StatusBar.tsx` — replaced by StatusBarWithProgress
- [ ] `interfaces/chat-repl/src/handlers/index.ts` — barrel for unused handlers below
- [ ] `interfaces/chat-repl/src/handlers/message.ts` — unused MessageHandlers class
- [ ] `interfaces/chat-repl/src/handlers/progress.ts` — duplicate of shell/plugins progress handler
- [ ] `interfaces/chat-repl/src/types.ts` — empty file (only a comment)

### mcp plugin events

- [ ] `interfaces/mcp/src/handlers/plugin-events.ts` — `setupSystemEventListeners`, `handleToolRegistration`, `handleResourceRegistration` are defined but never called; only `setupJobProgressListener` is imported from this directory

### Duplicate definitions

- [ ] `shared/utils/src/formatters/formatters/default-query.ts` — duplicate of `default-query-response.ts` which is the one actually exported and used
- [ ] `shell/plugins/src/types/slots.ts` — `SlotRegistration` defined here but never imported; site-builder defines its own in `ui-slot-registry.ts`

**Verification:** After deleting, run `bun run typecheck` and `bun test` to confirm nothing breaks.

## Phase 2: Remove Unused Dependencies (24 deps)

Remove from `dependencies` in each package.json, then run `bun install` to update lockfile.

### Apps (config-driven, no source files importing these)

- [ ] `apps/collective-brain/package.json` — remove `@brains/ranger`
- [ ] `apps/mylittlephoney/package.json` — remove `@brains/rover`, `@brains/site-mylittlephoney`
- [ ] `apps/professional-brain/package.json` — remove `@brains/rover`
- [ ] `apps/team-brain/package.json` — remove `@brains/relay`

### Entities

- [ ] `entities/blog/package.json` — remove `@brains/ai-evaluation`, `@brains/identity-service`
- [ ] `entities/decks/package.json` — remove `@brains/ai-evaluation`
- [ ] `entities/newsletter/package.json` — remove `@brains/job-queue`, `@brains/templates`
- [ ] `entities/note/package.json` — remove `@brains/entity-service`, `@brains/job-queue`, `@brains/templates`
- [ ] `entities/portfolio/package.json` — remove `@brains/entity-service`, `@brains/job-queue`
- [ ] `entities/topics/package.json` — remove `@brains/ai-evaluation`

### Plugins

- [ ] `plugins/directory-sync/package.json` — remove `gray-matter`
- [ ] `plugins/hackmd/package.json` — remove `@brains/plugins`
- [ ] `plugins/notion/package.json` — remove `@brains/plugins`
- [ ] `plugins/site-builder/package.json` — remove `@brains/identity-service`, `@tailwindcss/cli`

### Shared / Shell

- [ ] `shared/theme-rizom/package.json` — remove `@brains/theme-base`
- [ ] `shell/ai-evaluation/package.json` — remove `@brains/core`
- [ ] `shell/app/package.json` — remove `@brains/ai-service`, `@brains/mcp`

### Sites

- [ ] `sites/ranger/package.json` — remove `lucide-preact`

**Verification:** After removing, run `bun install`, `bun run typecheck`, and `bun test`.

## Phase 3: Knip Configuration (optional)

Add a `knip.json` to suppress known false positives so future runs are cleaner.

False positives to exclude:

- `docs/examples/**` — standalone example code
- `scripts/*.js` — build scripts invoked via CLI, not imported
- `interfaces/webserver/src/standalone-server.ts` — child process entry point
- `plugins/dashboard/src/templates/dashboard/hydration.tsx` — build-time compiled
- Implicit devDependencies: `@brains/eslint-config`, `bun-types`, `@brains/typescript-config` (used by tooling, not imported)

## Not Addressed

Knip also reports 89 unused devDependencies and 336 unlisted dependencies. These are mostly false positives from how the monorepo shares tooling config (`eslint-config`, `bun-types`, `typescript`) and re-exports types across workspace packages. A knip config (Phase 3) would suppress most of these.

## e18e (blocked)

e18e CLI crashes on bun workspace lockfiles. Issue filed: [43081j/lockparse#40](https://github.com/43081j/lockparse/issues/40). Revisit once fixed — will surface module replacement suggestions (e.g., lighter alternatives to heavy deps).
