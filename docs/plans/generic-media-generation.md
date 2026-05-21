# Plan: Generic Media Generation and Saved Artifacts

## Status

Proposed follow-up to the PDF carousel MVP.

The current `preview-attachment` tool proves that source-derived attachments can render correctly, but previews are disposable. The next step is to support saving the exact rendered artifact for later publishing, without introducing a new operator tool surface — `system_create` already handles image generation and entity creation; extending it to attachment-derived saves keeps the surface uniform.

## Goal

Provide one operator path for generated media artifacts, reusing the existing `system_*` tool surface.

The same path should support:

- generating source-derived attachments such as `deck` → `carousel` PDFs
- generating prompt-derived images such as cover images (already works today)
- previewing a generated artifact locally without persisting it
- saving the generated artifact as a durable entity when explicitly requested
- attaching saved or existing media to target entities
- publishing the exact approved artifact without regenerating it

## Non-goals

- Do not add implicit caching to every source-derived publish.
- Do not make previews durable unless explicitly requested.
- Do not remove source-derived publishing fallback; publishing should still regenerate when no saved artifact is attached.
- Do not introduce a new entity type for every artifact kind.
- Do not introduce parallel durable `media_generate`/`media_attach` tools when `system_create`/`system_update` already cover the case.
- Keep one media-specific preview tool for disposable render-to-file workflows; preview is not entity lifecycle.

## What already works

Three existing facilities cover most of the surface:

- **Image generation + attach (existing entity):** `system_create({ entityType: "image", prompt, targetEntityType, targetEntityId })` generates the image and sets the target's `coverImageId` via the image-generation job handler.
- **Image generation + attach (generated target):** `system_create({ entityType: <target>, prompt, coverImage: { generate: true } })` — the orchestration sugar in `entity-create-tool.ts` enqueues the image job after the target is created. Stays as-is.
- **Reference assignment:** `system_set-cover` is reference-only (no generation). It exists purely to add a `supportsCoverImage` adapter guard on top of `system_update`.

The only missing piece is **attachment-derived saves** (e.g. `deck` → `carousel` → durable `document` entity).

## Plugin ownership

- `media-tools` owns the disposable preview tool only.
- `entities/document` owns the document schema, adapter, storage, and attachment-derived create behavior.
- `entities/image` is unchanged.
- Source entity plugins (e.g. `decks`) own their attachment providers.

Current implementation note: the document plugin is a `ServicePlugin` that manually registers the `document` entity, not an `EntityPlugin`. Implement attachment-derived create behavior either by registering a create interceptor with `context.entities.registerCreateInterceptor("document", ...)`, or by first refactoring the document plugin to an `EntityPlugin`. Do not assume an `interceptCreate` override exists today.

## Proposed surface

### Extended `system_create` — attachment-derived saves

```ts
system_create({
  entityType: "document",
  from: {
    sourceEntityType: "deck",
    sourceEntityId: "distributed-systems-primer",
    attachmentType: "carousel",
  },
  // optional: attach the saved document to a target
  targetEntityType?: "social-post",
  targetEntityId?: "my-post",
});
```

Behavior:

- The document create interceptor resolves the attachment via the registry, computes a dedup key, and either reuses an existing document entity or enqueues a render job.
- `from` becomes a fourth valid `system_create` source alongside `content`, `prompt`, and `url`; update `CreateInput`, `createInputSchema`, validation, and tool instructions accordingly.
- When `targetEntityType`/`targetEntityId` are provided, the saved document ID is attached to the target (`documents[]` for social posts; semantically equivalent to the image-mode target params).
- Returns either a job ID (on render) or the existing entity ID (on dedup hit).

### Extended `system_update` — adapter-aware guards

```ts
system_update({
  entityType: "post",
  id: "my-post",
  fields: { coverImageId: "img-1" }, // or null to clear
});
```

- Add a guard: when `fields` includes `coverImageId`, verify the adapter's existing `supportsCoverImage` flag.
- `supportsOgImage` does not exist today. Add it to the adapter contract only when OG-image assignment lands; until then, do not mention or validate `ogImageId` through a non-existent adapter capability.
- Once the `coverImageId` guard exists, `system_set-cover` is fully redundant and gets deleted.

### `media_preview` — disposable case

Rename `preview-attachment` → `preview`, exposed by `plugins/media-tools` as MCP tool `media-tools_preview` and CLI alias `media-preview` unless/until plugin naming changes. It resolves a provider, writes to disk, and creates no entity.

Do not model preview as `system_create({ dryRun: true })`: preview renders real bytes to an operator file path but intentionally does not create an entity. Keeping it in `media-tools` preserves `system_create` as durable create/enqueue semantics.

### `--replace` flag

`system_create({ ..., from: ..., replace: true })` bypasses dedup and forces a fresh render. Default is reuse.

`replace: true` should create a new saved artifact ID by default and, when a target is provided, update/append the target reference to the new document without duplicating stale references for the same source/attachment pair. It should not silently mutate an already-published document entity in place.

## Dedup

Applies only to attachment-derived saves (deterministic renders). Does **not** apply to prompt-generated images (non-deterministic — same prompt produces different outputs).

Dedup key for attachment-derived documents:

- source entity type + ID + content hash
- attachment type
- renderer/provider version (template `version` field — to be added)
- theme/site styling version, where available

If a saved document with the same dedup key exists, reuse it. `replace: true` forces a new render.

## Behavior on attach

- Image attached as cover: writes `coverImageId` on the target via `system_update`.
- OG image assignment can use `ogImageId` later, after `supportsOgImage` and selected-entity frontmatter support exist.
- Document attached to a target: appends to `documents[]` (or equivalent field) on the target.
- Removing a reference remains a normal `system_update` with the field cleared or array element removed.

## Publishing precedence

Publishing prefers explicit saved artifacts first, then falls back to source-derived generation. Unchanged from current carousel behavior — saved `documents[]` short-circuits the re-render.

## Eval baseline (do this first)

Before touching any production code, audit the existing rover evals so they would catch regressions in the paths this plan touches. The migration deletes `system_set-cover` and extends `system_create`/`system_update`; without a green baseline we won't know if a step broke prior behavior.

Existing evals in scope:

- `system-set-cover.yaml` — set existing image as cover
- `system-set-cover-generate.yaml` — generate cover via `system_create({ entityType: "image", target* })`
- `system-set-cover-generate-by-title.yaml`, `-by-reference.yaml` — variants
- `set-cover-uses-target-params.yaml` — variant
- `generate-post-with-image.yaml` — `coverImage:` sugar (must continue to work unchanged)
- `system-update.yaml` — generic update behavior

Baseline tasks:

1. Run the full rover eval suite on `main` and record pass/fail per case.
2. For each `set-cover*` case, verify the expected tool and args match current production behavior. Fix any drift before starting implementation.
3. Confirm `generate-post-with-image.yaml` exercises the `coverImage:` sugar path end-to-end (job enqueued, image entity created, target entity updated). If it only asserts the tool call shape, add an assertion that the cover image is actually attached.
4. Add a regression eval for "remove cover image": current expectation is `system_set-cover` with `imageId: null`. This case will migrate to `system_update({ fields: { coverImageId: null } })` — capture the _current_ expectation now so we can flip it in step 6 below and detect any drift.

Only proceed to implementation once the baseline is green and the regression coverage above exists.

## Implementation steps

1. Add `version` field to `MediaPageTemplate` and `AttachmentProvider`. Stamp the carousel template+provider.
2. Add attachment-derived create behavior for `document`: resolve `from`, compute dedup key, reuse or enqueue render job. Use `context.entities.registerCreateInterceptor("document", ...)` unless the document plugin is first refactored to `EntityPlugin`.
3. Extend `system_create` / `CreateInput` schemas with `from:` and `replace:` fields; accept `from` as a valid create source.
4. Define `replace: true` behavior precisely in tests: new artifact ID, no in-place mutation of previously saved documents, and target `documents[]` deduped/repointed for the same source/attachment pair.
5. Add `supportsCoverImage` guard to `system_update` for `coverImageId` updates. Leave `ogImageId` guards for the OG-image phase when `supportsOgImage` exists.
6. Rename `preview-attachment` → `preview` in `plugins/media-tools` (`media-tools_preview` MCP name; CLI alias `media-preview`).
7. Remove or deprecate the existing `document_generate` tool once `system_create({ entityType: "document", from: ... })` is available; do not keep two durable document-generation surfaces.
8. Update agent prompts and rover eval cases (`system-set-cover*.yaml`) to use `system_update` for reference assignment and `system_create({ entityType: "image", ... })` for generation.
9. Delete `system_set-cover` tool and `createEntityCoverTool` registration.
10. Add publishing integration test: a social post with a saved `documents[]` entry does not invoke the carousel renderer at publish time.
11. Document the `from:` pattern in `system_create` for operators/agents.

## New evals (add at the end)

Once the migration is complete, add rover evals covering the new surface so future drift is caught:

1. **Attachment-derived save** — "Save the carousel for deck X as a document"
   - Expect `system_create({ entityType: "document", from: { sourceEntityType: "deck", sourceEntityId: "X", attachmentType: "carousel" } })`.

2. **Save + attach to target** — "Save the carousel for deck X and attach it to social post Y"
   - Expect a single `system_create` call with `from:` and `targetEntityType: "social-post"`, `targetEntityId: "Y"`.

3. **Dedup reuse** — agent re-runs the save; expect the returned entity ID matches the existing one, and no new render job is enqueued. (Integration test, not a tool-invocation eval, since the assertion is on side-effects.)

4. **Force replace** — "Regenerate the carousel document for deck X" → expect `system_create({ ..., from: ..., replace: true })`.

5. **Reference assignment via system_update** — "Set image 'hero-banner' as the cover for post Y" → expect `system_update({ entityType: "post", id: "Y", fields: { coverImageId: "hero-banner" } })`. Replaces `system-set-cover.yaml`.

6. **Reference removal via system_update** — "Remove the cover image from post Y" → expect `system_update({ entityType: "post", id: "Y", fields: { coverImageId: null } })`.

7. **Adapter guard rejection** — `system_update` on an entity type without `supportsCoverImage` returns a clear error. (Unit test on the tool, not an agent eval.)

8. **media preview disposable** — "Preview the carousel for deck X" → expect `media-tools_preview` / CLI `media-preview` with no entity created. (Integration test.)

9. **Publishing precedence** — social post with `documents[]` populated publishes without invoking the deck carousel renderer. (Integration test from step 8 of implementation.)

10. **Eval cleanup verification** — grep across rover test cases and agent prompts confirms no references to `system_set-cover`.

## Validation

- `system_create({ entityType: "document", from: { ..., attachmentType: "carousel" } })` creates a durable document entity.
- Re-running the same call returns the existing entity ID without re-rendering.
- `replace: true` forces a new render, creates a new saved artifact, and repoints/dedupes target references when a target is provided.
- `system_create({ entityType: "document", from: ..., targetEntityType: "social-post", targetEntityId })` saves the document and attaches it to the target.
- `media-tools_preview` writes the rendered artifact to disk and creates no entity.
- `system_update({ fields: { coverImageId: "img-1" } })` rejects on entity types without `supportsCoverImage`.
- `system_update({ fields: { coverImageId: null } })` clears the reference.
- Publishing a social post with `documents[]` populated does not invoke the deck carousel renderer.
- Publishing without `documents[]` still falls back to source-derived generation.
- Existing image generation paths (`system_create({ entityType: "image", prompt, ... })` and `coverImage:` sugar) continue to work unchanged.
- Rover evals no longer reference `system_set-cover`.
