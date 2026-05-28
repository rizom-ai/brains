# Plan: Queued Entity Stubs

## Status

Proposed. Surfaced by a flaky rover eval (`social-media-generate-cover-for-existing`) that exposes a real structural gap, not LLM brittleness.

## Problem

`system_create` with a `prompt` enqueues an AI generation job and returns `{status: "generating", jobId}` — **no entity id**. The entity does not exist anywhere addressable until the background generation job completes and the base handler calls `createEntity`.

Consequences:

- Multi-turn follow-ups like "now generate a cover image for that post" have no id to pass as `targetEntityId`. The agent searches (and the search returns empty because the entity isn't persisted yet) or gives up.
- `system_create` for cover images explicitly requires `targetEntityType` and `targetEntityId` together (`shell/core/src/system/entity-create-tool.ts:102-106`). With no id, the cover-image call can't be made.
- The fix can't be brain-instructions alone. Today's implementation provides no id to reference.

Conceptually the entity exists the moment the create call is accepted — it has a stable title, a target type, a generation job tracking it. The system just isn't surfacing it.

## Goal

Make the entity addressable immediately on `system_create` acceptance: persist a **stub** with the chosen id and a `generating` status, return that id from the tool, and have the generation handler update the stub when content arrives.

## Non-goals

- Do not change the synchronous `content`-bearing create path (already returns `entityId`).
- Do not change the cover-image generation job structure.
- Do not introduce conversation-scoped implicit entity resolution. References stay explicit by id.
- Do not retrofit existing entities. Stub semantics apply forward-only to new prompt-based creates.

## Stub semantics (the design decision)

A stub is a normal persisted entity with:

- the chosen `id` and `entityType`,
- empty or placeholder `content: ""`,
- `metadata.title` from the request (so listings have a label),
- a `status` of `"generating"` (or `"failed"` if the job fails).

Lifecycle:

1. **`generating`** — created by the tool, before the job runs. Content empty.
2. **`generated` / entity-specific target state** — when the generation job completes successfully, base handler updates the stub: sets full content + final metadata + sets `status` to the entity type's normal post-generation state (e.g., `"draft"` for blog/social-post).
3. **`failed`** — if the job throws or `failEarly`s, base handler marks the stub `status: "failed"` with an `error` field on metadata. The entity is NOT deleted — the operator can retry, delete, or inspect.

Visibility/searchability rules:

- **Search**: stubs with `status: "generating"` or `"failed"` are **excluded from semantic search** by default. Embeddings of empty content would be noise; we don't want hallucinated hits. Add a filter at the entity-service search layer.
- **Listing**: stubs ARE listed by `system_list` and `system_get`. They are addressable, just marked. This matches the agent's need to find "the thing I just queued."
- **Cover-image target validation**: `system_create({entityType: "image", targetEntityId})` accepts a stub target. Cover attachment doesn't require generated content.

Failure path:

- A failed stub stays in `"failed"` state with the error message on metadata. No automatic cleanup.
- A retry mechanism (re-enqueue a generation job with the same id) is out of scope for this plan; future work can add a `system_retry` or treat `system_create` with the same id and a prompt as a retry. For now, operator deletes and re-creates.

## Tool surface

`system_create` with a `prompt`:

```ts
// Before
return { success: true, data: { status: "generating", jobId } };

// After
return { success: true, data: { entityId, status: "generating", jobId } };
```

Synchronous content path is unchanged (already returns `entityId`).

Id derivation: same `slugify(title ?? prompt-derived-title)` already used in the sync path, with collision handling. If the slugified id collides with an existing entity, the tool returns an error (same behavior as the sync path).

## Base handler change

`BaseGenerationJobHandler.process()` at `shell/plugins/src/service/base-generation-job-handler.ts:200-271`:

- Job data carries the pre-allocated `entityId` (added to job payload by the tool).
- `process()` calls `updateEntity` instead of `createEntity` when the stub exists. Validates the stub's `entityType` matches.
- On `GenerationFailure` / exception, set `status: "failed"` + `metadata.error` on the stub via `updateEntity`, then return the failure result as today.

Subclass `generate()` methods need a small contract change: they may receive a pre-allocated id in the job data and should honor it (use it as `generated.id`). If they currently derive id from generated content (e.g., title-based slug), prefer the pre-allocated id when present.

## Search-layer filter

Entity-service search adds a default exclusion: skip entities with `metadata.status ∈ {"generating", "failed"}` unless the caller explicitly opts in (e.g., `system_search({includeUngenerated: true})` for admin/diagnostic flows). The exact opt-in shape is a small follow-up; the default exclusion is the load-bearing change.

## Brain instructions update

`shell/ai-service/src/brain-instructions.ts` (around line 128, the "Multi-Turn Context" section):

- "When you just called `system_create` with a `prompt` and the response includes an `entityId`, use that id directly on follow-ups (e.g., as `targetEntityId` for cover images). Do **not** search for the entity — it may not be searchable until generation completes."
- Add the same id-use rule to the "Image & Cover Operations" section near the existing follow-up guidance.

## Implementation steps

1. Extend `BaseGenerationJobHandler` job schemas to carry an optional `entityId` field. Update the base `process()` to:
   - use the pre-allocated id when present,
   - call `updateEntity` instead of `createEntity` in that branch,
   - on failure, mark the stub `failed`.
2. Update `entity-create-tool.ts` prompt branch: derive id, persist stub via `createEntity` with `status: "generating"`, then enqueue the generation job with the entity id in payload. Return `{entityId, status, jobId}`.
3. Audit each generation handler (note, blog, deck, portfolio, newsletter, social-media, document) to ensure `generated.id` does not override the pre-allocated id and to confirm post-generation metadata sets `status` to the entity type's normal state.
4. Add search-layer default exclusion of `generating` / `failed` stubs in entity-service search; expose an opt-in flag for diagnostic callers.
5. Update brain instructions.
6. Tests:
   - tool returns `entityId` for queued prompt creates,
   - stub is searchable by `system_get(id)` but excluded from `system_search`,
   - generation handler updates the stub (no new entity created with a different id),
   - failure marks the stub `failed` and surfaces the error,
   - multi-turn cover-image flow: turn 1 uses the entity id from turn 0 and `system_create({entityType: "image", targetEntityType, targetEntityId})` succeeds without a search,
   - id collision on stub creation returns a clear error.
7. Update fixtures:
   - `brains/rover/test-cases/multi-turn/generate-cover-for-existing-post.yaml` — no longer flaky once the flow works end-to-end.

## Validation matrix

- `system_create({entityType: "social-post", prompt: "..."})` returns `{entityId, status: "generating", jobId}`.
- Immediately after the tool returns, `system_get({entityType: "social-post", id: entityId})` resolves to the stub with empty content and `status: "generating"`.
- `system_search({query: "...", entityType: "social-post"})` does NOT include the stub.
- Generation job completes → entity has full content + `status: "draft"` (or entity-specific) + same id.
- Generation job fails → entity has `status: "failed"` + `metadata.error` populated.
- `system_create({entityType: "image", targetEntityType: "social-post", targetEntityId: <stub id>, prompt: "..."})` succeeds against the stub.
- Cover image attached to the stub remains attached after the stub is filled in by the generation job.

## Closed decisions

1. **Stub or no stub?** Stub. Returning an id without a corresponding row makes the id a lie; resolving "where is the entity" later forces every caller to handle a half-state. Persisting the stub keeps the entity model honest.
2. **Searchable while generating?** No. Stubs are explicitly excluded from semantic search by default. Embedding empty content is noise; an opt-in flag exists for diagnostic flows.
3. **Failure handling?** Failed stubs stay in `failed` state with an error message. No auto-cleanup. Retry/cleanup are future work.
4. **Conversation-scoped implicit resolution?** Rejected. Tool calls remain referentially explicit; the agent uses the returned id, not "most recent of type".
