# Plan: Shell layer cleanup

## Status

Proposed. Trigger: a refactoring audit of `shell/` (2026-06-10) found a
handful of god-classes and scattered responsibilities that make the
shell's worst packages hard to test and risky to extend. This plan
sequences the cleanup as independently mergeable slices.

## Context

Verified hotspots (line counts checked against this tree):

- `shell/auth-service/src/auth-service.ts` — 1,501 lines. The stores
  underneath it (`passkey-store`, `session-store`, `refresh-token-store`,
  `auth-code-store`, `key-store`, `client-store`) are already cleanly
  extracted; the `AuthService` class itself is the problem. It is at
  once an HTTP router (`handleRequest`), the OAuth token endpoint
  (authorization-code grant, refresh grant, revoke, client
  registration), the WebAuthn registration/authentication handler, the
  setup-token lifecycle, and the page renderer for login/setup/authorize.
  One test file covers all of it.
- `shell/ai-service/src/agent-service.ts` — 799 lines. Bundles
  conversation message building, tool invocation, attachment handling,
  and XState orchestration; imports from conversation-service,
  entity-service, identity-service, and mcp-service.
- `shell/app/src/brain-resolver.ts` — 848 lines. Plugin resolution,
  capability merging, preset handling, and config composition in one
  factory.
- `shell/entity-service/src/types.ts` — 711 lines. A "types" file that
  also contains behavior: `normalizeContentVisibility`,
  `getVisibleContentVisibilities`, `isVisibleWithinScope`,
  `permissionToVisibilityScope`, `canWriteVisibility` live next to the
  base entity schemas.
- `shell/core/src/initialization/` — bootstrap logic spread across
  eight files (`shellInitializer`, `shellBootloader`, `service-factory`,
  `service-singletons`, `service-config`, `identity-agent-services`,
  `job-services`, `shell-registration`) with no single place where the
  startup order is visible. `shell.ts` (531 lines) fans out to every
  shell service.
- `shell/core/src/system/entity-create-tool.ts` — 539 lines (and
  `entity-update-tool.ts`, `entity-mutation-tools.ts` nearby). Entity
  domain logic — validation, confirmation flows, cover-image prompts —
  lives inside MCP tool builders in core instead of in entity-service.

Test coverage is inverted relative to risk: entity-service has a broad
suite, while auth-service (security-critical) has one test file.

## Non-goals

Covered by other plans or out of scope here — do not fold them in:

- **`shell/plugins` facade split** (`index.ts` re-export hub,
  `message-interface-plugin.ts`). Owned by `npm-package-boundaries.md`
  and `plugin-contracts-consolidation.md`; doing it here would collide.
- **Env declaration/reading moves** — `env-handling.md`.
- **Provider lazy-loading and `IAIProvider` extraction** in ai-service —
  `memory-reduction.md` and `embedding-service.md`. Phase 5 below stays
  off `provider-clients.ts` for that reason.
- **job-queue worker/batch-manager unification** — real but lower
  value; revisit after this plan lands.
- Anything outside `shell/` (interface CSS monoliths, entity-package
  base classes, atproto-contracts barrel exports).

## Phasing

Each phase is a thin slice: it lands green (`bun run typecheck`,
`bun test`) and merges to main on its own. Tests are written or
extended **before** the code moves in every phase.

### Phase 1 — entity-service: split `types.ts` (walking skeleton)

Smallest slice first to set the pattern.

1. Add direct unit tests for the five visibility/permission functions
   if the existing suite doesn't already pin their behavior.
2. Move them to `shell/entity-service/src/visibility.ts`. Keep
   re-exports from `types.ts` so call sites don't churn in this phase.
3. `types.ts` keeps schemas and type declarations only.

Acceptance: typecheck + entity-service suite clean; `types.ts` contains
no function bodies beyond schema definitions.

### Phase 2 — auth-service: characterize, then decompose

Tests first, emphatically — this is the security-sensitive package
with the thinnest coverage.

1. Extend `test/auth-service.test.ts` (or split into focused files)
   to characterize current behavior: token endpoint grants
   (authorization-code, refresh, revoke), authorize page + approval
   token consumption/expiry, WebAuthn registration and authentication
   round-trips, setup-token lifecycle including email delivery
   recording. No production changes in this step; merge it alone.
2. Extract three route-handler modules, each taking the stores they
   need via constructor/params:
   - `oauth-endpoints.ts` — authorize page/approval, token grants,
     revoke, client registration.
   - `webauthn-endpoints.ts` — registration + authentication
     options/verify.
   - `setup-flow.ts` — setup token state, setup page, email delivery.
   `AuthService` keeps composition, `handleRequest` dispatch,
   `verifyBearerToken`, and metadata endpoints.
3. Behavior must be unchanged — the phase-2.1 tests pass without
   modification (only import-path edits allowed).

Acceptance: `auth-service.ts` under ~400 lines; characterization suite
green and unmodified.

### Phase 3 — core: make bootstrap order explicit

1. Add/extend an initialization-order test (services come up in a
   deterministic, asserted sequence; shutdown reverses it).
2. Consolidate the eight `initialization/` files behind one
   orchestrator that names the sequence explicitly (create services →
   register templates → register entities → initialize plugins → start
   daemons), delegating to the existing helpers rather than rewriting
   them.
3. Reduce `shell.ts` to composition + lifecycle delegation.

Acceptance: a reader can answer "what starts before what" from one
file; core suite green.

### Phase 4 — move entity domain logic out of core's tool builders

`entity-create-tool.ts` / `entity-update-tool.ts` keep only MCP tool
shape (schema, name, description, wiring); validation, confirmation
construction, and cover-image prompt logic move to entity-service
behind a small API. Note: the recent "require confirmation for entity
creation" work (e25943b05) touched this area — rebase carefully and
re-run its tests.

Acceptance: tool files are thin adapters; moved logic has unit tests
in entity-service; existing core system-tool tests green.

### Phase 5 — ai-service: split `agent-service.ts`

Extract message building and tool invocation into collaborators
(`message-builder.ts`, `tool-invocation.ts`); `AgentService` keeps
orchestration and the XState machine boundary. Stay off
`provider-clients.ts` (owned by `embedding-service.md` /
`memory-reduction.md`). Tests for the extracted collaborators precede
the extraction.

Acceptance: `agent-service.ts` under ~400 lines; ai-service suite
green; no changes to provider wiring.

### Phase 6 (optional) — app: split `brain-resolver.ts`

Extract capability resolution and config composition into separate
modules. Decide after Phase 5 whether the remaining appetite justifies
it; drop this phase rather than rushing it.

## Related findings outside scope

The same audit surfaced these outside `shell/`. Recorded here so they
don't get lost; none belong in this plan's phases.

- **Plugin boilerplate + entity base classes** — five plugins carry
  240–794-line `plugin.ts` files repeating the same
  config-schema/refine/registration pattern (`plugins/cms` 794,
  `plugins/atproto` 599, `plugins/site-builder` 359,
  `plugins/dashboard` 276, `plugins/directory-sync` 240), and the 22
  `entities/` packages each reimplement adapters/handlers with no
  shared base. Both want a shared base in `@brains/plugins` — fold
  into `npm-package-boundaries.md`, which owns that public authoring
  surface.
- **CSS-as-string monoliths** —
  `interfaces/web-chat/src/chat-page.ts` (1,981 lines, ~1,600 of them
  one CSS string literal) and
  `plugins/dashboard/src/render/styles/components.ts` (1,122 lines).
  No existing plan; small standalone plan or direct work.
- **atproto-contracts barrel export** —
  `shared/atproto-contracts/src/index.ts` (817 lines) re-exports 200+
  zod schemas, the type-instantiation blowup `shared/utils` warns
  against in its own index. Belongs with `atproto-integration.md`.
- **tsconfig inheritance drift** — `plugins/directory-sync` and
  `brains/relay` extend `../../tsconfig.json` instead of
  `@brains/typescript-config`. Too trivial to plan; ride along with
  any nearby commit.
- **`@brains/utils` grab-bag** — long-known; needs a split plan of
  its own, not bandages.

## Risks

- **Auth regressions** — mitigated by the characterization-first rule
  in Phase 2; the extraction step is not allowed to touch the tests.
- **Plan collisions** — Phases 2 and 5 sit near `auth-runtime-db.md`
  and `embedding-service.md` territory. Both plans are proposed, not
  in flight; if either starts first, re-sequence rather than merging
  conflicting shapes.
- **Refactor sprawl** — each phase merges alone; if a phase stalls,
  everything before it is already landed value.
