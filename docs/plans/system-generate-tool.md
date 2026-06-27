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
  - Upload text/PDF/markdown/JSON extraction/import into a note-like entity.
  - Requires explicit transform such as `extract-markdown`.
- `prior-response`
  - Save the previous assistant response as durable content.

Not allowed in `system_create`:

- AI prompt generation.
- Standalone generated images.
- Cover-image generation.
- Source-derived carousel/printable/OG artifacts.
- Raw file preservation as document/image.

Raw file preservation remains `system_upload_save` unless folded into a concrete-source create in a later dedicated change.

### `system_generate`

Purpose: create new durable generated content or artifacts.

Source branches:

- `prompt`
  - New AI-generated content or standalone generated images.
  - Examples: generated post, deck, newsletter, image.
- `attachment`
  - Deterministic artifact generation from an existing entity attachment provider.
  - Examples: deck carousel PDF, post/project printable PDF, OG/social preview image.

Expected fields:

- `entityType`
- `title?`
- `source`
- `replace?`
- `coverImage?`
- `targetEntityType?`
- `targetEntityId?`
- confirmation fields hidden from the model as with other durable tools

Rules:

- Initial model call omits confirmation fields.
- Tool returns confirmation args.
- Confirmed call must match pending args exactly.
- Generated image/document target fields only attach generated artifacts to existing canonical entities.
- Placeholder/future target IDs are rejected or ignored consistently.

### `system_upload_save`

Purpose: preserve raw uploaded bytes as durable file entities.

Keep as a separate model-visible tool for now because it is a different operation from both extraction/import and generation.

Examples:

- Save uploaded PDF as document.
- Save uploaded image as image.

## `document_generate` migration

`document_generate` should no longer be a competing model-visible door for the same operation.

Options:

1. Hide/remove `document_generate` from the agent tool surface and route durable document artifact generation through `system_generate`.
2. Keep `document_generate` only as an internal/plugin helper, CLI-only diagnostic, or legacy non-agent surface.

Preferred path: model-visible `document_generate` is removed/hidden; `system_generate source.kind: attachment` becomes the canonical durable PDF artifact path.

## Expected simplification of `system_create`

Once prompt/attachment generation moves out, `system_create` can drop:

- generation stub creation
- generic generation job enqueue logic
- prompt-based confirmation copy
- source attachment resolution for generation artifacts
- target entity normalization for generated image/document attachments
- image generation target handling
- document attachment generation handling
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

### Unit tests first

Add failing tests before implementation for:

- `system_create` schema rejects `source.kind: generate`.
- `system_create` schema rejects `source.kind: attachment`.
- `system_generate` is registered with write side effects and trusted-or-anchor visibility matching generation policy.
- `system_generate` accepts `source.kind: prompt`.
- `system_generate` accepts `source.kind: attachment`.
- `system_generate` confirmation binding rejects missing/mismatched confirmation tokens.
- Prompt generation queues the same jobs/results currently reached through `system_create source.kind: generate`.
- Attachment generation queues/returns the same document/image artifacts currently reached through `system_create source.kind: attachment` or `document_generate`.
- `document_generate` is not model-visible when `system_generate` can perform the operation.
- SDK model-visible schemas expose only the intended fields and hide confirmation internals.

### Eval updates before product implementation

Update expected tools/args for generation evals:

- standalone image generation
- cover image generation
- post/deck/newsletter/social generation
- source-derived document artifacts
- carousel/printable/OG artifact generation
- any eval currently expecting `document_generate`

Keep direct-save/import evals on `system_create`:

- exact note creation
- finalized markdown direct create
- URL/link capture
- upload-to-note extraction
- prior-response save
- wish capture

Keep raw upload preservation evals on `system_upload_save`.

## Non-goals

- Do not add natural-language/message-text host routing.
- Do not expose two model-visible tools for the same operation.
- Do not preserve legacy flat create inputs.
- Do not auto-save one-shot agent calls.
- Do not weaken eval assertions to pass around product ambiguity.
- Do not fold raw upload preservation into this refactor unless a separate typed source contract is designed.

## Validation

Minimum validation:

1. Targeted unit tests for core system tools and SDK tool schemas.
2. Affected plugin tests for document/image generation.
3. Focused Rover evals for generation/artifact flows.
4. Full Rover core eval.
5. `bun run typecheck`.
6. `bun run lint`.

Track full Rover against the current high-water baseline and call out any remaining failure that requires the next structural pass rather than prompt nudges.
