# Plan: Generation Stub Merge Model

## Status

Proposed. Follow-up to the shipped queued-entity-stubs work (commits `eb37d324e` and `cdac2492f`). Surfaced by review of that implementation: the "overwrite minus a preserve list" model in the base generation handler is structurally fragile and the seams will widen as more reference attachments are added.

## Problem

When a prompt-based `system_create` is accepted, the tool persists a stub entity (`status: "generating"`, empty body). When the generation job completes, `BaseGenerationJobHandler.updatePreallocatedStub` overwrites the stub with the generated content.

That overwrite is not actually total — it has two hand-curated exceptions:

1. A **preserve list** (currently `["coverImageId", "documents"]` in `shell/plugins/src/service/base-generation-job-handler.ts`): frontmatter fields that may be attached to the stub _during_ the generating window (cover image, document attachments) and must survive generation. Implemented in `preserveExistingReferenceFrontmatter`.
2. A **drop list** (currently `{ status, error }`): metadata fields on the existing stub that must be discarded so the generator's status (e.g., `"draft"`) wins over the stub's `"generating"`. Implemented as a destructure at the merge site.

Both lists are hand-curated, both live in the central handler, both must be edited whenever an entity gains a new reference attachment or a new lifecycle field. The "generation produces the final entity" framing is a fiction maintained by these exception lists.

Concrete failure modes:

- A new reference attachment added to, say, the blog adapter (`relatedPostIds`, `citations[]`) silently gets dropped on stub completion until someone notices and edits the preserve list. There is no test that fails — the wrong behavior is "field disappears."
- A new lifecycle field on a stub (say, `attemptCount` for retry tracking) needs to be added to the drop list, or it leaks into the post-generation entity.
- Moving the preserve list to the adapter (as `stubPreservedFields`) localizes the rot but doesn't eliminate it — adapter authors still have to remember to declare the list.

## Goal

Replace overwrite-minus-exceptions with a partial-update model: the generation handler declares what it produces (a body and a partial metadata patch); everything else on the stub is left alone by construction. No preserve list, no drop list, no special-case state to maintain.

## Non-goals

- Do not change the tool-side stub construction (`adapter.buildStub` stays).
- Do not change `system_create` tool surface or the agent-facing contract.
- Do not change search/listing semantics for stubs.
- Do not introduce retry logic for failed stubs (still future work).
- Do not change handlers' generation logic — only how the base class consumes the result.

## Design

### New semantics for stub completion

The stub completion path becomes a structural merge between the existing stub and the generator's output:

- **Body**: the generator's body wins (it's why generation ran).
- **Frontmatter**: start with the existing stub frontmatter, patch in the generator's `metadata`, then patch in frontmatter parsed from the generator's `content`; later sources win on conflict.
- **Metadata**: start with the existing stub metadata, then patch in the generator's `metadata`; the generator wins on conflict.

The explicit `metadata` patch is applied to frontmatter so handlers that emit body-only markdown (notably notes) still keep stored markdown in sync with the final metadata. If the generator's content also includes frontmatter, that content frontmatter remains the most specific source and wins.

The generator declares which durable fields it owns by emitting them. Fields the generator doesn't emit are preserved. Reference attachments (cover image, documents) and any future user-attached fields fall through automatically.

There is one explicit lifecycle rule: **`status` and `error` are generator-owned transient lifecycle fields in both metadata and frontmatter.** Existing stub values for those fields are removed before the merge; generated values are added back only if the generator emits them. That means:

- a successful handler that emits `status: "draft"` flips the stub to draft;
- a successful handler that emits no `status` (for entity types with no steady-state status, such as notes) clears `status: "generating"`;
- `error` from a previous failed attempt is cleared on success unless the generator emits a new `error`.

This keeps the lifecycle exception central and semantic, without preserving adapter-specific reference fields by hand.

### Generation handler contract

No structural change to `GeneratedContent`. Handlers continue to return:

```ts
{
  id: string;
  content: string;            // markdown body, optionally with frontmatter
  metadata: Partial<TMetadata>;
  title?: string;
  ...
}
```

The base handler interprets the result as a patch:

- Parse `content`'s frontmatter (call it `generatedFrontmatter`).
- Parse the existing stub's content frontmatter (`existingFrontmatter`).
- Remove lifecycle fields (`status`, `error`) from `existingFrontmatter` and `existing.metadata`.
- Merge frontmatter: `mergedFrontmatter = { ...existingFrontmatterWithoutLifecycle, ...generated.metadata, ...generatedFrontmatter }`.
- Body: extract body from generated content.
- Rebuild content: serialize `mergedFrontmatter` + body.
- Merge metadata: `mergedMetadata = { ...existingMetadataWithoutLifecycle, ...generated.metadata }`.

### What gets deleted

- `STUB_PRESERVED_REFERENCE_FIELDS` constant
- `EntityAdapter.stubPreservedFields` interface field
- `stubPreservedFields` declarations on `BlogPostAdapter`, `SocialPostAdapter`, `ProjectAdapter`, `DeckAdapter`
- `preserveExistingReferenceFrontmatter` function
- The `{ status: _existingStatus, error: _existingError, ...existingMetadata }` destructure in `updatePreallocatedStub`

### What replaces them

A single `mergeStubWithGenerated(existing, generated)` helper in `base-generation-job-handler.ts` that does the parse-merge-write, with the lifecycle exception as a named line inside the helper. It should be a private method (or accept the effective frontmatter schema) so it can validate the merged frontmatter via `context.entities.getEffectiveFrontmatterSchema(entityType)` before saving.

## Risks

- **Generator produces frontmatter that wasn't on the stub but should not survive**: e.g., a transient flag the generator sets and then wants cleared. Not currently a real case — generators today produce a steady-state final entity. If it shows up, the generator owns clearing the field itself. Document the convention.
- **Schema validation after merge**: the merged frontmatter must satisfy the entity's effective frontmatter schema. Since the stub already satisfied it (or schema validation rejected stub creation upstream) and the generator's frontmatter is also valid, the merge should satisfy it too. Add a schema-validation assertion at the merge site as a guard; skip only when no effective schema is registered.
- **Handler that emits no frontmatter in content but populates `metadata`**: today's destructure-and-spread is metadata-only on that path. New merge path must handle "generator content has no parseable frontmatter" by applying `generated.metadata` to the merged frontmatter and using the generated body. This is required for note generation and similar body-only handlers.
- **Schema-level rename of a reference field**: e.g., renaming `coverImageId` → `headerImageId` in the blog schema. Old stubs in flight may still carry the old field name. The merge preserves it (unknown to the new schema), schema validation rejects it. This is the same hazard the preserve-list approach had; the merge model doesn't make it worse.

## Test-infrastructure cleanup (folded into this work)

The current test mocks for entity-registry / entity-adapter (notably `shell/core/test/system/mock-services.ts` and the `getAdapter` mocks in `@brains/test-utils`) are hand-curated structural lookalikes of `EntityAdapter`. Every new field the tool/handler touches has to be added by hand to the mock, which is the same hand-curated-list rot this plan is replacing. Keep this cleanup scoped: remove `stubPreservedFields` from mocks as part of this work, and only replace the broader mocks with a small Map-backed test registry / `createTestAdapter(config)` helper if typecheck or implementation pressure makes it necessary.

## Implementation steps

1. Write a `mergeStubWithGenerated(existing, generated)` helper in `base-generation-job-handler.ts`:
   - Parse both sides' frontmatter.
   - Compose merged frontmatter, body, and metadata.
   - Apply the lifecycle rule for `status` and `error` to both frontmatter and metadata.
   - Apply `generated.metadata` to frontmatter before generated content frontmatter so body-only handlers still sync markdown.
   - Validate the result against the entity's effective frontmatter schema when registered (assertion, not best-effort).
2. Rewrite `updatePreallocatedStub` to call the helper and `updateEntity`. Remove the existing destructure and the `preserveExistingReferenceFrontmatter` call.
3. Delete `preserveExistingReferenceFrontmatter` and `STUB_PRESERVED_REFERENCE_FIELDS`.
4. Delete `EntityAdapter.stubPreservedFields` from the interface and from `BlogPostAdapter`, `SocialPostAdapter`, `ProjectAdapter`, `DeckAdapter`.
5. Tests:
   - Existing "cover image survives generation" test stays — now passes via the merge model.
   - New test: a stub-attached field that's _not_ on any current preserve list survives generation (use a synthetic adapter or a real adapter with a new field added in the test).
   - New test: generated `status` wins when emitted, and stub `status: "generating"` clears when the generator emits no status.
   - New test: `error` on the stub (e.g., from a previous failed attempt that left `error` set) is cleared after successful regeneration.
   - Regression test: generator that doesn't emit frontmatter still produces a valid final entity (stub's durable frontmatter survives, lifecycle fields clear, generator's metadata patch applies to both metadata and markdown frontmatter).
6. Audit each generation handler's `generate()` to confirm the `metadata` returned is genuinely the patch the handler wants applied (no implicit "and overwrite everything else"). Adjust handlers that today rely on overwrite semantics.

## Validation matrix

- Cover image attached to a stub during the generating window is still present after generation completes.
- A blog-post field added today (e.g., `seriesName`) set by the user on the stub via a hypothetical attach API survives generation without touching the central handler.
- A successful regeneration of a previously failed stub clears `error` and either updates `status` from the generator or clears the stub lifecycle status when no final status is emitted.
- A stub whose generation produces frontmatter that overlaps with stub fields (e.g., the generator picks its own slug) wins on those fields.
- Adapters that don't support cover images or attachments are unaffected.
- The full suite of generation handler tests (note, blog, deck, portfolio, newsletter, social-media) passes without changes to handler-level test expectations.

## Closed decisions

1. **Generator emits patch vs. full entity?** Patch. The fact that today's generators emit a "full" `content` markdown is incidental — the base handler is free to interpret it as a patch, and the result is identical for fields the generator does set.
2. **Where does the lifecycle exception live?** In the merge helper, as a named, justified pair (`status`, `error`) applied to both metadata and frontmatter. Not on the adapter, not in a general preserve/drop list.
3. **Adapter-owned preserve list (the previously shipped intermediate fix)?** Removed. The merge model makes it dead code; leaving it would be two parallel mechanisms.
4. **Change to `GeneratedContent` shape?** No. The base class re-interprets the existing shape; handlers stay as-is. This minimizes blast radius and lets the change land without touching every handler.
