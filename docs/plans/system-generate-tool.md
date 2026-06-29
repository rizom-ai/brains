# System Generate Tool Plan

## Goal

Split durable creation into two model-visible operations:

- `system_create`: persist existing/concrete material.
- `system_generate`: produce new durable material or deterministic generated artifacts.

This removes the overloaded `system_create source.kind: generate` path and folds model-visible `document_generate` behavior behind the system tool surface.

## Why

`system_create` currently mixes several different intents:

- save exact user text
- import/upload existing content
- save a prior assistant response
- capture URL-backed entities
- generate new AI-authored entities
- generate images and cover images
- generate source-derived document/image artifacts

That creates model ambiguity. In particular, models can use create/generate branches to analyze existing uploads, or choose both document generation and create paths for one request. A separate `system_generate` gives the model a typed distinction:

- **create** = save/import/capture something that already exists
- **generate** = make a new artifact/content item

## Final model-visible contracts

### `system_create`

Purpose: persist existing material as durable content.

Allowed source branches:

- `text`
  - Exact user-provided text/markdown/content.
- `url`
  - URL/domain-backed capture such as links.
- `upload`
  - `transform: "extract-markdown"` — extract text/markdown from an upload into a note-like entity.
  - `transform: "preserve"` — preserve the raw uploaded bytes as their durable file entity (document/image). Entity type is derived from the upload media type via the registered upload-save handler, not taken from the model. This folds in the former `system_upload_save`.
- `prior-response`
  - Save the previous assistant response as durable content.

Not allowed in `system_create`:

- AI prompt generation.
- Standalone generated images.
- Cover-image generation.
- Source-derived carousel/printable/OG artifacts.

Raw file preservation is handled by `system_create source.kind: upload, transform: "preserve"` (see above), not a separate tool.

The `coverImage` field is removed from `system_create`. Generating a cover is a `system_generate` image targeting the created entity (see below), never a create-time side effect. This keeps `system_create` generation-free.

### `system_generate`

Purpose: create new durable generated content or artifacts.

The model-visible input is `{ operation, confirmed?, confirmationToken? }`, where `operation` is a discriminated union:

- `{ kind: "prompt", entityType, title?, source?: { entityType, entityId }, prompt }`
  - New AI-generated durable content.
  - Include `source` when generation is grounded in an existing entity, such as a newsletter from a post.
- `{ kind: "standalone-image", title?, prompt }`
  - New unattached generated image.
- `{ kind: "cover-image", target: { entityType, entityId }, title?, prompt }`
  - New generated image attached to the target as `coverImageId`.
- `{ kind: "attachment", source: { entityType, entityId }, attachmentType, title?, replace? }`
  - Deterministic artifact generation from an existing entity attachment provider.
  - Examples: deck carousel PDF, post/project printable PDF, OG/social preview image.

Confirmation fields are hidden from the model as with other durable tools.

Rules:

- Initial model call omits confirmation fields.
- Tool returns confirmation args.
- Confirmed call must match pending args exactly.
- Generated image/document target fields only attach generated artifacts to existing canonical entities.
- Placeholder/future target IDs are rejected or ignored consistently.
- Cover images are generated here, not in `system_create`: generate an image targeting the existing entity and mark it as the cover. The target entity must already exist and be referenced by its canonical ID, so "create X with a cover" is two calls — create the entity, then generate its cover targeting the real ID.

### `system_upload_save` (removed)

Raw upload preservation folds into `system_create` as `source.kind: upload, transform: "preserve"`. `system_upload_save` is removed from the model-visible tool surface — it was already the same trusted tier, same `writes` side effect, same `ConfirmationArgsStore` flow, and the same `isUploadRefInConversation` access gate as `system_create`, differing only in the `upload` transform. Collapsing it takes the durable surface from three model-visible doors to two (`system_create`, `system_generate`).

Migration details:

- `system_create`'s executor dispatches the `preserve` transform to the existing upload-save handler (`getUploadSaveHandler(mediaType)`), instead of the normal create path.
- `entityType` for the `preserve` branch is derived from the upload media type; if the model supplies one, validate it against the handler's entity type rather than trusting it.
- The upload-save confirmation copy moves into `system_create`'s confirmation builder as a `preserve` variant.

Examples (both now `system_create source.kind: upload, transform: "preserve"`):

- Save uploaded PDF as document.
- Save uploaded image as image.

## `document_generate` migration

`document_generate` exists today as a preview-only PDF render door. Drop it entirely rather than rehome it.

Rationale:

- Attachment artifacts (deck carousel PDFs, post/project printables, OG/social images) are deterministic renderings of content that is already durable. Previewing them before save adds a decision point with nothing real to decide; if the rendering is wrong the fix is editing the source or regenerating, not rejecting a preview.
- "See it before you commit it" is already provided by the durable confirmation step, which returns `summary`/`preview` and requires a confirmed call before any write. A standalone preview tool is a weaker second copy of a UX we already have.

Action: remove model-visible `document_generate` from the agent tool surface. `system_generate operation.kind: "attachment"` becomes the canonical durable PDF artifact path, and its confirmation step carries whatever see-before-save value exists. There is no orphaned preview capability to migrate.

Open verification: confirm no chat/web UI affordance renders a preview attachment inline before save. If one does, that surface must be accounted for separately before removal.

## Expected simplification of `system_create`

Once prompt/attachment generation moves out, `system_create` can drop:

- generation stub creation
- generic generation job enqueue logic
- prompt-based confirmation copy
- source attachment resolution for generation artifacts
- target entity normalization for generated image/document attachments
- image generation target handling
- document attachment generation handling
- cover-image normalization, prompt building, validation, and enqueue
- much of the generate-specific already-exists guard

`system_create` should retain:

- concrete source normalization
- source-bound confirmation guard
- visibility/policy checks
- prior-response resolution
- upload access checks for import/extraction
- direct markdown/entity creation
- concrete create interceptors such as link capture or upload import

## Test-first migration plan

Ship as thin vertical slices. Each phase is independently mergeable, writes its tests before implementation, moves its evals in the same slice, and ends at a clean state with no duplicate model-visible doors. Run the validation checklist at every phase boundary.

### Phase 1 — `system_generate` walking skeleton (prompt branch)

Establishes the new tool end to end on the simplest source, and removes the matching branch from `system_create` so no operation has two doors.

Tests first:

- `system_generate` is registered with write side effects and trusted-or-anchor visibility matching generation policy.
- `system_generate` accepts `operation.kind: "prompt"`.
- `system_generate` confirmation binding rejects missing/mismatched confirmation tokens.
- Prompt generation queues the same jobs/results currently reached through `system_create source.kind: generate`.
- `system_create` schema rejects `source.kind: generate`.
- `system_create` no longer accepts a `coverImage` field.
- Cover-image generation via `system_generate` (image targeting an existing entity, marked as cover) queues the same cover job previously reached through `system_create coverImage`.
- SDK model-visible schemas for `system_generate` expose only the intended fields and hide confirmation internals.

Evals moved in this slice:

- standalone image generation
- cover image generation (now `system_generate` image targeting an existing entity — assert the two-call create-then-cover sequence)
- post/deck/newsletter/social generation

Risk to watch: the create-then-cover ordering is the highest-risk behavior change in the whole split. A model that previously emitted one `system_create coverImage` call must now create the entity, wait for its real canonical ID, then issue a `system_generate` cover targeting that ID — and not guess or use a placeholder ID. This needs explicit tool/prompt guidance, and the two-call sequence eval above is the gate; do not weaken it with prompt nudges if a model fumbles the ordering — fix the guidance.

### Phase 2 — attachment artifacts + retire `document_generate`

Moves deterministic artifact generation onto `system_generate` and removes the preview-only door.

Tests first:

- `system_generate` accepts `operation.kind: "attachment"`.
- Attachment generation queues/returns the same document/image artifacts currently reached through `system_create source.kind: attachment` or `document_generate`.
- `system_create` schema rejects `source.kind: attachment`.
- `document_generate` is removed from the model-visible tool surface entirely (no preview-only door remains).

Evals moved in this slice:

- source-derived document artifacts
- carousel/printable/OG artifact generation
- any eval currently expecting `document_generate`

### Phase 3 — fold raw upload preservation into `system_create`

Independent of phases 1–2; can be sequenced before or after them. Collapses the third durable door.

Tests first:

- `system_create source.kind: upload` accepts `transform: "preserve"` and `transform: "extract-markdown"`.
- `preserve` derives entity type from upload media type and routes to the upload-save handler; raw bytes are preserved identically to the former `system_upload_save`.
- `system_upload_save` is removed from the model-visible tool surface.

Evals moved in this slice:

- raw upload preservation (from `system_upload_save` to `system_create source.kind: upload, transform: "preserve"`)

### Evals that stay on `system_create` throughout

- exact note creation
- finalized markdown direct create
- URL/link capture
- upload-to-note extraction (`transform: "extract-markdown"`)
- prior-response save
- wish capture

## Non-goals

- Do not add natural-language/message-text host routing.
- Do not expose two model-visible tools for the same operation.
- Do not preserve legacy flat create inputs.
- Do not auto-save one-shot agent calls.
- Do not weaken eval assertions to pass around product ambiguity.

## Validation

Minimum validation:

1. Targeted unit tests for core system tools and SDK tool schemas.
2. Affected plugin tests for document/image generation.
3. Focused Rover evals for generation/artifact flows.
4. Full Rover core eval.
5. `bun run typecheck`.
6. `bun run lint`.

Track full Rover against the current high-water baseline and call out any remaining failure that requires the next structural pass rather than prompt nudges.
