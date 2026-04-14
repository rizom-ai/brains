# Plan: harden link create/capture end-to-end

## Status

Proposed.

## Why this plan exists

We surfaced several link-specific issues that look separate on the surface but are really one pipeline problem:

1. **Core owns link-specific create logic**
   `system_create` in `shell/core/src/system/tools.ts` contains a large inline `entityType === "link"` branch.
2. **Handler name mismatch**
   Core enqueues `link-capture`, while plugin-scoped registration can produce `link:link-capture`, causing:
   - `No handler registered for job type: link-capture`
3. **Link capture depends on caller context**
   The capture job metadata needs interface/user/channel information, but the current abstraction discussion initially did not pass that through.
4. **Long links can fail during embedding**
   Captured link entities can enqueue embeddings with content that exceeds provider limits (`8192` token error).
5. **Coverage is pointed at the wrong seams**
   Existing link evals mostly verify “agent called `system_create` with `entityType: link`”, but do not verify the full create → capture → persist → embed pipeline.

These should be treated as one hardening effort, not as unrelated fixes.

## Goals

- Keep `system_create` generic.
- Move link-specific create/capture behavior into the link plugin.
- Preserve current UX:
  - full link markdown can direct-create
  - raw/prompt URL capture routes to async link capture
  - missing URL returns a sync error
- Make `link-capture` a stable public job name without leaking plugin-scoped internals into core.
- Prevent oversized link content from breaking embedding jobs.
- Add coverage at the exact seams that failed us.

## Non-goals

- Redesign all entity generation job naming.
- Change the user-facing `system_create` tool surface.
- Solve all embedding-strategy questions for every entity type at once.
- Do a large link-plugin rewrite beyond the create/capture path.

## Current problems in more detail

### 1) Core is doing plugin work

Today `system_create` knows too much about links:

- parse full markdown/frontmatter
- detect URL-only input
- decide whether to direct-create or enqueue capture
- build capture metadata

That is plugin-owned behavior and should not live in shell core.

### 2) Public job name vs plugin-scoped registration got mixed together

We have two distinct concepts:

- **public workflow name**: `link-capture`
- **plugin-scoped generation route**: `link:generation`

The bug came from accidentally treating plugin registration scoping as something core should know about. It should not.

The stable rule should be:

- core may enqueue the public link workflow name only if that workflow is part of the stable link contract
- the link plugin itself must register any aliases required to satisfy that contract
- core must never enqueue plugin-private names like `link:link-capture`

### 3) Embedding is using the wrong payload size for links

`LinkCaptureJobHandler` creates a link entity through `entityService.createEntity()`. That automatically enqueues a `shell:embedding` job unless the entity type is marked non-embeddable.

For large captured pages, the stored markdown can be much too large for the embedding provider, causing failures after the link was otherwise captured successfully.

This is a separate downstream problem from create routing, but it belongs in the same plan because it breaks the same user workflow.

### 4) Our tests did not cover the broken seam

Current coverage is useful but incomplete:

- `shell/core/test/system/entity-create.test.ts` covers current observable behavior from the core side
- link eval fixtures in `entities/link/evals/test-cases/` mostly assert that the agent called `system_create`
- link plugin eval handler `extractContent` tests extraction, not create/capture dispatch

What is missing:

- a test that the link plugin registers the stable `link-capture` alias
- a test that `system_create` → link create interception preserves routing metadata
- a test that oversized captured links do not fail the overall workflow due to embedding overflow

## Architecture target

### Principle 1: generic core, plugin-owned link behavior

The long-term state should be:

- `system_create` normalizes inputs and delegates to an entity create interceptor when one exists
- `LinkPlugin` owns:
  - direct-create parsing
  - URL extraction
  - link-capture enqueue behavior
  - link-specific sync errors
- generic core handles all other entity types uniformly

This matches `docs/plans/plugin-owned-create-handlers.md`, but this plan adds the link-specific operational issues that doc does not cover fully.

### Principle 2: stable public alias registered by the plugin

The link plugin should register:

- `link:generation` via the normal entity generation path
- `link-capture` as an explicit public alias owned by the plugin

That alias registration must happen in the plugin, not in core.

### Principle 3: embed a bounded link representation

Links should not send arbitrary full-page markdown into the embedding model.

Preferred long-term behavior:

- define a bounded embedding text for links, built from high-signal fields:
  - title
  - description
  - url/domain
  - keywords
  - truncated summary/body
- embed that bounded text, not the full raw markdown body

If that is too much for the first landing, a temporary safety step is acceptable:

- either truncate before embedding, or
- mark `link` as `embeddable: false` until bounded embedding text exists

The bounded embedding text approach is the desired end state.

## Proposed workstreams

### Workstream A — stabilize current production path

Purpose: stop the active failures with the smallest correct change.

Changes:

1. **Register `link-capture` explicitly in `LinkPlugin`**
   - plugin owns the alias
   - core continues to enqueue `link-capture`
   - do not teach core about plugin-scoped job names
2. **Keep `link:generation` registered as-is**
   - preserves existing entity-generation convention
3. **Add a focused plugin registration test**
   - assert both `link:generation` and `link-capture` are registered
4. **Add a focused system create regression test**
   - assert URL-based link create still enqueues `link-capture`

Success criteria:

- no more `No handler registered for job type: link-capture`
- no new link knowledge added to `system`

### Workstream B — move link create logic into the plugin

Purpose: remove link-specific behavior from `tools.ts`.

Changes:

1. Implement the generic create-interceptor framework from `docs/plans/plugin-owned-create-handlers.md`
2. Ensure the interceptor receives execution context:
   - `interfaceType`
   - `userId`
   - `channelId`
   - `channelName`
3. Implement `LinkPlugin.interceptCreate()`
   - parse full markdown/frontmatter for direct create
   - extract URL from content/prompt/title
   - enqueue `link-capture` directly from the plugin when needed
   - return current sync errors when URL is missing or direct create content is invalid
4. Move link helpers out of `tools.ts` into `entities/link/src/lib/`

Success criteria:

- `shell/core/src/system/tools.ts` contains no `entityType === "link"` branch
- link create behavior is unchanged from the user’s point of view
- routing metadata is preserved through the plugin-owned path

### Workstream C — make link embeddings safe

Purpose: stop post-capture failures from oversized embedding payloads.

Options:

#### Option C1 — temporary safety switch

Set `link` to `embeddable: false`.

Pros:

- smallest operational fix
- immediately stops embedding failures

Cons:

- links disappear from semantic/vector search

#### Option C2 — bounded embedding text for links (preferred)

Add a link-specific embedding projection.

Example shape:

```text
Title: ...
URL: ...
Domain: ...
Description: ...
Keywords: ...
Summary: <truncated>
```

Requirements:

- hard cap by character or token budget before calling embedding API
- deterministic truncation
- preserve high-signal metadata first

Pros:

- keeps links searchable
- fixes the real cause

Cons:

- requires a small extension to the embedding path

Recommendation:

- if production is currently noisy, land **C1 immediately**
- then implement **C2** as the durable fix

### Workstream D — fix coverage at the right seam

Purpose: catch the next regression before release.

Add tests/evals for:

1. **Link plugin registration**
   - verifies `link-capture` alias exists
2. **Core create integration**
   - `system_create` with URL enqueues `link-capture`
   - metadata includes interface/user/channel values
3. **Plugin interceptor behavior**
   - full markdown direct-create
   - raw URL capture
   - invalid direct content
   - no-URL prompt/content failure
4. **Embedding safety**
   - oversized fetched content does not produce embedding API length failure
5. **Eval coverage**
   - keep existing “agent called `system_create`” evals
   - add at least one deeper regression that validates the resulting workflow, not just the tool call

## Recommended implementation order

### Phase 1 — stop the broken path

1. Register `link-capture` alias in `LinkPlugin`
2. Add registration + regression tests for alias and enqueue path
3. Decide temporary embedding safety action:
   - yes/no: disable link embeddings immediately?

### Phase 2 — move ownership to the plugin

4. Land the generic create-interceptor plumbing
5. Implement `LinkPlugin.interceptCreate()`
6. Remove the inline link branch from `system_create`
7. Keep `link-capture` alias registration in the plugin

### Phase 3 — fix durable embedding behavior

8. Implement bounded embedding text for links, or temporary `embeddable: false` if not already done
9. Add regression test for oversized captured content

### Phase 4 — tighten release confidence

10. Add eval/test coverage for the actual create → capture → persist path
11. Optionally add a package-level smoke check so published dist behavior matches source behavior

## Files likely touched

### Phase 1

- `entities/link/src/plugin.ts`
- `entities/link/test/plugin.test.ts`
- `shell/core/test/system/entity-create.test.ts`

### Phase 2

- `docs/plans/plugin-owned-create-handlers.md`
- `shell/entity-service/src/types.ts`
- `shell/entity-service/src/entityRegistry.ts`
- `shell/entity-service/src/index.ts`
- `shell/plugins/src/entity/context.ts`
- `shell/plugins/src/entity/entity-plugin.ts`
- `shell/plugins/src/index.ts` or equivalent re-export surface
- `entities/link/src/plugin.ts`
- `entities/link/src/lib/*`
- `shell/core/src/system/tools.ts`

### Phase 3

Likely one of:

- `entities/link/src/handlers/capture-handler.ts`
- `entities/link/src/lib/*`
- `shell/entity-service/src/*` if embedding projection becomes a shared entity-service capability
- possibly `entities/link/src/plugin.ts` if a temporary `embeddable: false` config lands first

## Open design questions

### 1) Where should bounded embedding text live?

Two plausible homes:

- **link package** exposes `getEmbeddingText(link)`
- **entity-service/plugin framework** gains a generic per-entity embedding projection hook

Recommendation:

- if only `link` needs it right now, a link-local implementation is acceptable
- if we expect more entities to need compact embedding text soon, add a framework hook once, cleanly

### 2) Should `link-capture` remain a public stable job name long-term?

Recommendation: yes.

Reason:

- it represents a real workflow distinct from generic generation
- it keeps the link package free to preserve compatibility while internal architecture evolves

### 3) Should links be embeddable by default after bounded embedding text exists?

Recommendation: yes, if the bounded representation is deterministic and comfortably under provider limits.

## Verification

- URL-based link create succeeds end-to-end
- raw URL content still routes to capture
- full link markdown still direct-creates
- invalid direct link content still fails synchronously with the current message
- plugin registers `link-capture` explicitly
- core contains no plugin-scoped job names for link
- no embedding API length failures for captured links
- existing link evals still pass
- new deeper regression coverage passes

## Relationship to other plans

- `docs/plans/plugin-owned-create-handlers.md`
  - remains the shared framework plan
  - this document is the link-focused integration plan that bundles routing, aliasing, embedding safety, and coverage

## Decision summary

- **Do not** teach `system` about plugin-scoped link job names
- **Do** let the link plugin own the stable `link-capture` alias
- **Do** move link create logic out of core via the interceptor plan
- **Do** fix oversized link embeddings as part of the same workflow hardening effort
