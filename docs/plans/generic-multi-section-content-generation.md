# Plan: Generic Multi-Section Content Generation

Last updated: 2026-09-13

## Status

**Merged in PR #252 and included in Brain `0.2.0-alpha.379`.**

The branch moves reusable multi-target generation into `shell/content-service`; domain plugins retain composition, discovery, entity, tool, and presentation ownership. It preserves the user-facing `site-content_generate` input/result shape, replaces the private `shell:content-generation` payload without a dual-format shim, and exposes the proven capability through an additive declarative `@rizom/brain/services` contract.

Existing pending jobs with the retired payload must be drained before rollout. If that is not possible, obtain approval for a bounded queue migration rather than dropping queued work or adding indefinite compatibility.

Studio hierarchy is a separate demand-gated follow-up in [studio-hierarchical-entity-navigation.md](./studio-hierarchical-entity-navigation.md).

## Delivered on the branch

- `content-service` plans and executes generation for multiple opaque typed targets without route or section vocabulary.
- `site-content` keeps site discovery/filtering and maps accepted sections to generic targets; it no longer owns durable payload construction or batch enqueueing.
- Destinations carry an entity definition, structured non-empty `idPath`, schema-bound JSON metadata, and optional visibility.
- One shared codec serializes a path at the durable entity boundary. A book-shaped path round-trips to `book-section/book-1/part-1/chapter-2.md` without asking public authors to join or split delimiters.
- Duplicate destinations, unknown types, invalid metadata, unavailable generation templates, authorization failures, and conflicts fail terminally. Generation jobs run at most once, so a failed job wrote nothing.
- Conditional writes protect later edits/deletes from stale generation; a retried job conflicts instead of overwriting.
- Durable jobs carry the trusted caller, resolved account, and admission-time permission ceiling; authority is checked again at execution and final write.
- Public-output retrieval is scoped to public knowledge even when an Admin starts the job.
- Submission is bounded by target count, JSON bytes, nesting depth, and cycle checks.
- A generation-only template can produce a non-web entity with no React layout or site route.
- Internal service contexts, queue channels, datasource IDs, and durable job payloads remain private.

## Settled decisions

### Composition, paths, and metadata are separate

Composition decides membership and order. A site route already owns page-section order; a future book plugin may own an explicit ordered outline. Filesystem paths do not infer that composition.

Structured `idPath` models storage containment only. Metadata models independent relationships such as `clientId`, status, or section kind. Neither requires the other, and moving a relationship must not silently change identity.

### Targets are independently durable

A multi-target request may partially succeed. Each target has its own write precondition, so resubmission is safe. The existing job queue's root job ID is the returned batch correlation; no second durable batch table or generic generation-status API is introduced.

Callers observe output through ordinary typed entity readers. A dedicated status surface would duplicate queue/entity state without a proven user need.

### Site compatibility is narrow

The existing `site-content_generate` user-facing shape remains intact. Site-content may report domain-discovered missing or non-generatable sections as skips. Public literal mistakes and invalid typed destinations remain errors.

The old private payload has one production producer and is replaced cleanly. This is why pending jobs must be drained at rollout.

### Directory-sync compatibility is not silently tightened

The shared codec governs new structured paths and their tested round-trip. Directory-sync still splits and joins stored IDs independently; generation did not move it onto the codec. Phase 0 of the Studio hierarchy plan owns that adoption, with golden tests preserving existing placement. Legacy malformed IDs, root-note conventions, embedded separators, and unsafe path-like values are not normalized or relocated by this work. Codec adoption does not authorize ID rewrites, file moves, or database migrations.

## Remaining gates

1. Review the branch architecture, public DX, generated declarations, migration, and changesets.
2. Rebase/integrate current `main` and the active public-authoring boundary without widening private runtime APIs.
3. Run affected workspace typecheck, tests, lint, architecture, package-surface, packed-authoring, and docs checks.
4. Verify the site adapter through a canonical running app and app-managed preview rebuild.
5. Verify the non-web fixture persists and directory-sync round-trips the book-shaped path.
6. Before deployment, inspect the live generation queue and drain jobs using the retired payload.
7. Publish and deploy only with separate approval; monitor deterministic failures, retries, partial batches, and site output.

## Non-goals

- Route, book-outline, or course discovery in `content-service`.
- EPUB, PDF, site, or book assembly.
- Recursive generation or job dependency semantics.
- Inferring reading order, reuse, clients, or projects from paths.
- A shared physical content tree or identity/storage migration.
- Studio folder browsing, folder moves, or metadata grouping.
- Exposing shell services or queue internals as public authoring APIs.
- A permanent compatibility reader for the old private payload.

## Completion

Delete this plan after the branch is merged, the incompatible queue is safely drained, package/runtime/site evidence passes, and the durable contracts are captured in `content-service`, `site-content`, directory-sync, and public authoring documentation.
