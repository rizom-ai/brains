# system_generate Structural Redesign Plan

## Problem

`system_generate` is currently structurally loose. The model-visible contract is a flat object with several independent optional knobs that can be combined into invalid or ambiguous operations:

- `entityType`
- `source.kind`
- `source.attachmentType`
- `targetEntityType`
- `targetEntityId`
- `coverImage`

This creates invalid cross-products such as:

- `entityType: "image"` with `attachmentType: "carousel"` even though carousel is a document/PDF artifact.
- standalone image generation with fake future targets.
- OG/social preview generation via prompt instead of source attachment.
- cover image generation modeled as a boolean side channel instead of a first-class operation.

Adding more prompt/schema wording is not sufficient. The tool contract should make invalid combinations **unrepresentable** (rejected at parse time), and reject the rest before confirmation.

## Goals

1. Keep `system_create` for persisting/importing existing concrete material.
2. Keep `system_generate` for newly generated durable entities and deterministic source-derived artifacts.
3. Replace loosely related optional fields with explicit generation operation branches.
4. Validate source entities, attachment provider capabilities, and targets before confirmation.
5. Remove the `coverImage` boolean side channel.
6. Make standalone image, cover image, OG image, carousel, and printable generation structurally distinct.
7. Expose attachment provider capability metadata through the system-tool service boundary so validation does not reach around plugin/runtime abstractions.

## Non-goals

- Do not add natural-language routing or regex guards.
- Do not rely on prompt hints as the primary fix.
- Do not expose multiple model-visible tools for the same durable generation operation.
- Do not weaken eval assertions around ambiguous or invalid calls.

## Proposed Tool Contract

Make `system_generate` input an object with a single **`operation`** field that is a discriminated union by `kind`, plus top-level confirmation internals:

```json
{
  "operation": { "kind": "cover-image", "...": "..." },
  "confirmed": true,
  "confirmationToken": "..."
}
```

The previous nested `source` object is removed; each operation branch carries only its own valid fields. The five branch shapes below are the **value of `operation`**.

There are five operation kinds. The split is by **generation mechanism** and source semantics, not by output shape — broad `prompt`, source-grounded `prompt-from-source`, `cover-image` (prompt-generated image), and OG image (deterministic provider render, lives under `attachment`) look like siblings but are produced by different machinery, which is why they are different branches.

### Why `operation` is nested, not a top-level union

The tool framework types `Tool.inputSchema` as a `ZodRawShape` (a flat object map), and two paths depend on that: `createSystemTool` extracts `inputSchema.shape` (`shell/core/src/system/tool-helpers.ts`), and the model-visible projection iterates `Object.entries(inputSchema)` to strip confirmation fields (`shell/ai-service/src/sdk-tools.ts`). A top-level `z.discriminatedUnion` has no `.shape` and is not an object map, so it cannot be the input without changing the framework or hand-authoring a second `modelInputSchema`.

Decisions that follow from this:

- **No `modelInputSchema` override.** The model-visible schema stays a _projection_ of the one runtime schema (drop `confirmed`/`confirmationToken`, re-wrap), not a second hand-authored contract that can drift. The nested-`operation` shape needs no override at all.
- **Confirmation fields stay top-level**, outside `operation` — required, because the strip filter matches top-level keys.
- **The outer schema must remain a plain `z.object`.** Do not `.superRefine()` it — that yields a `ZodEffects` with no `.shape` and breaks `createSystemTool`.
- **Refinements do not make rules unrepresentable to the model.** `@ai-sdk/provider-utils asSchema` drops Zod `.refine()`/`.superRefine()` from the model-visible JSON Schema (a refined string serializes as plain `{ "type": "string" }`). So a refinement only enforces server-side at runtime. For genuine model-visible unrepresentability, use structural schema (the discriminated union itself, literals, enums) — e.g. the prompt branch's `entityType: "image"` rule prefers a generated enum of allowed non-image generatable types, falling back to runtime validation (see the `prompt` branch). The discriminated union _is_ structural, so it survives serialization as `oneOf`; only refinement-based rules are at risk.
- Nesting is the pattern already proven in this codebase: `system_generate` today carries `source` as a nested discriminated union, and `sdk-tools.test.ts` already exercises a nested union round-tripping through the model-visible projection and MCP serialization (`oneOf`). Confirmation args deep-serialize, so a nested `operation` round-trips for exact-match validation.

### 1. `prompt` — generate a new durable entity from a prompt

```json
{
  "kind": "prompt",
  "entityType": "social-post",
  "title": "LinkedIn post about continuous learning",
  "prompt": "Write a polished LinkedIn post about continuous learning in tech."
}
```

Rules:

- No target fields.
- For generated posts, newsletters, notes, etc. — **not** images. `entityType: "image"` is rejected on this branch (use `standalone-image` or `cover-image`). Verified with `@ai-sdk/provider-utils asSchema`: Zod refinements do **not** survive to model-visible JSON Schema (`z.string().refine(v => v !== "image")` serializes as plain `{ type: "string" }`). Therefore, make this unrepresentable with a generated enum of allowed non-image generatable entity types if practical; otherwise enforce it as pre-confirmation runtime validation and do not claim tool-schema unrepresentability.
- Always creates a fresh generated entity request; no `replace`. If the derived slug already exists, the persistence layer creates a deduplicated ID rather than reusing a deterministic artifact (confirmed current behavior: `executePromptGenerate` calls `createEntity` with `deduplicateId: true`).

### 2. `prompt-from-source` — generate a new durable entity from a resolved entity

```json
{
  "kind": "prompt-from-source",
  "entityType": "newsletter",
  "source": {
    "entityType": "post",
    "entityId": "event-sourcing-sustainability"
  },
  "prompt": "Turn this post into a concise newsletter."
}
```

Rules:

- Requires a resolved existing durable source entity.
- Never use upload IDs, filenames, profile/brain-character context, conversation-only context, unknown sources, or guessed sources.
- For broad topical prompts, use `kind: "prompt"` with no source.

### 3. `standalone-image` — standalone generated image

Resolves Open Question 4: standalone image is its own branch, structurally distinct from prompt-entity generation and from cover-image.

```json
{
  "kind": "standalone-image",
  "title": "Abstract header image",
  "prompt": "Create an abstract editorial header image."
}
```

Rules:

- Output entity type is fixed to `image`; the model does not supply `entityType`.
- No target fields (a standalone image attaches to nothing).
- Always creates a fresh generated image request; no `replace`. If the derived slug already exists, the persistence layer must create a deduplicated ID rather than reusing a deterministic artifact.

### 4. `cover-image` — generate an image and attach it to an existing entity

```json
{
  "kind": "cover-image",
  "target": {
    "entityType": "post",
    "entityId": "resilience-in-distributed-systems"
  },
  "title": "Cover image for Resilience Is Not Redundancy",
  "prompt": "Create an editorial cover image for the article."
}
```

Rules:

- Output entity type is fixed to `image`; target field is fixed to `coverImageId`.
- Target entity must resolve to a canonical ID before confirmation. No fake/future IDs.
- Prompt-only for now (Open Question 3 resolved): style/aspect-ratio fields are deferred until a real use case; add them as an explicit additive change, not as free-form passthrough.
- Always creates a fresh generated image request; no `replace`. If the derived slug already exists, the persistence layer must create a deduplicated ID rather than reusing a deterministic artifact.

### 5. `attachment` — deterministic artifact from a source attachment provider

```json
{
  "kind": "attachment",
  "source": {
    "entityType": "deck",
    "entityId": "distributed-systems-primer"
  },
  "attachmentType": "carousel",
  "title": "Distributed Systems Primer Carousel",
  "replace": false
}
```

Rules:

- **No target fields.** The output's target behavior is derived from provider metadata (Open Question 1 resolved): if the provider declares a `targetField`, the generated artifact updates the **source entity** on that field (e.g. `og-image` updates the source's `ogImageId`). Cross-entity targets are out of scope until a real use case requires them.
- Source entity must resolve to a canonical ID before confirmation; provider must exist.
- Output entity type is derived from provider metadata, never supplied by the model.
- `replace` lives only on this branch. Current behavior (`entity-generate-tool.ts`): for non-interceptor providers, generation errors when an entity already exists for the candidate id unless `replace: true` is passed; for interceptor-backed providers the existing-entity guard is skipped and the interceptor decides reuse vs regeneration. `replace` forces a new copy in the non-interceptor case.
- Examples:
  - `deck/carousel` → `document`
  - `post/printable` → `document`
  - `post/og-image` → `image`, updates source `ogImageId`

## Attachment Registry Metadata

Extend attachment provider registration to declare capability metadata. Use the simple `outputEntityType` shape (Open Question 2 resolved) — providers already carry `mimeType` in the resolved `PublishMediaData`, so nothing is lost by not modeling media type in metadata.

For this redesign, source-derived durable artifacts are intentionally scoped to `image` and `document`. If another artifact entity type is introduced later, widen `outputEntityType` in a separate schema/versioned change and add tests for that entity's handler.

```ts
interface AttachmentProviderMetadata {
  outputEntityType: "image" | "document";
  targetField?: "coverImageId" | "ogImageId";
}

interface AttachmentProvider {
  metadata: AttachmentProviderMetadata;
  resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> | PublishMediaData | undefined;
}

// Phase 1 transition only: metadata is optional while existing providers are
// migrated, and validation returns provider-missing-metadata when absent.
interface TransitionalAttachmentProvider {
  metadata?: AttachmentProviderMetadata;
  resolve(
    request: AttachmentResolveRequest,
  ): Promise<PublishMediaData | undefined> | PublishMediaData | undefined;
}
```

Registry exposes:

```ts
getProviderMetadata(
  sourceEntityType: string,
  attachmentType: string,
): AttachmentProviderMetadata | undefined;
hasProvider(sourceEntityType: string, attachmentType: string): boolean;
```

This lets `system_generate` validate before confirmation that the provider exists, the source entity exists, the output type is known and derived internally, and the target-field behavior is deterministic.

`SystemServices` must expose this capability through an explicit service boundary, for example:

```ts
attachments: {
  hasProvider(sourceEntityType: string, attachmentType: string): boolean;
  getProviderMetadata(
    sourceEntityType: string,
    attachmentType: string,
  ): AttachmentProviderMetadata | undefined;
}
```

Do not make `system_generate` reach into plugin internals or singleton registries directly.

## Internal Mapping

The public tool branches map to existing internal create/generation flows. Internal handlers are largely unchanged (see Migration Notes).

### `kind: "prompt"`

```ts
CreateInput { entityType, title?, prompt }
```

### `kind: "prompt-from-source"`

```ts
CreateInput { entityType, title?, prompt, sourceEntityType, sourceEntityId, sourceEntityIds }
```

### `kind: "standalone-image"`

```ts
CreateInput { entityType: "image", title?, prompt }
```

### `kind: "cover-image"`

```ts
CreateInput { entityType: "image", title?, prompt, targetEntityType, targetEntityId }
```

The image generation job already treats `targetEntityType`/`targetEntityId` as a `coverImageId` update (`entities/image/src/handlers/image-generation-handler.ts`), so no boolean is needed.

### `kind: "attachment"`

```ts
CreateInput {
  entityType: provider.metadata.outputEntityType,
  title?,
  replace?,
  from: { kind: "entity-attachment", sourceEntityType, sourceEntityId, attachmentType },
  // only when provider.metadata.targetField is present and the existing
  // interceptor path accepts target fields:
  targetEntityType: sourceEntityType,
  targetEntityId: sourceEntityId,
}

PreparedGenerateAttachment {
  createInput,
  targetField?: provider.metadata.targetField, // internal prepared metadata/job data, not model input
}
```

When the provider declares `targetField`, `system_generate` must internally map the resolved source entity as the target. For `post/og-image`, this means the artifact render receives `targetEntityType: "post"`, the canonical `targetEntityId`, and internal `targetImageField: "ogImageId"` job/handler data, so the source post's `ogImageId` is updated. The model never supplies target fields for attachment artifacts.

The source-image render handler already supports `targetImageField: "ogImageId"` (`entities/image/src/handlers/source-image-render-handler.ts`); implementation must ensure the system tool routes into that path deterministically without adding `targetImageField` to the model-visible schema.

## Validation Rules

Before creating a confirmation:

1. Validate entity/action permissions for the resolved output entity type.
2. `prompt` / `standalone-image`: output entity type must support queued generation or plugin interception; no target fields exist in the branch.
3. `cover-image`: target entity type and ID must resolve to a real entity; output fixed to `image`.
4. `attachment`: source entity must resolve to a canonical ID; provider must exist; provider metadata must declare `outputEntityType`; output type is derived from it; if a `targetField` is declared, the source-entity update is deterministic.

### Rejection contract

Pre-confirmation rejections return a **typed reason** so the model can recover instead of retrying blindly (this is part of the contract, and is what the `cover-generation-failure-follow-up` eval exercises). Minimum reason set:

- `unknown-entity-type` — requested entity type is not registered.
- `unsupported-generation` — requested entity type is registered but does not support queued generation or plugin-intercepted generation.
- `target-not-found` — `cover-image` target does not resolve.
- `source-not-found` — `attachment` source does not resolve.
- `no-provider` — no attachment provider for source `entityType`/`attachmentType`.
- `provider-missing-metadata` — provider exists but declares no `outputEntityType`.

Each reason carries the offending identifiers (e.g. the unresolved id, the requested source `entityType`/`attachmentType`) so the model can correct the next call.

## Cleanup

- Remove `coverImage` from `generateInputSchema` entirely.
- Remove the nested `source` object and replace it with a top-level `operation` field whose value is the discriminated union.
- Remove generic top-level `targetEntityType` / `targetEntityId` from `system_generate` input; cover targets are expressed only as `operation.target: { entityType, entityId }` on `operation.kind: "cover-image"`.
- Remove any schema prose added only to discourage invalid cross-products; the union now makes them unrepresentable.
- Cross-check `shell/ai-service/src/call-options.ts` for message-text gates touching `system_generate` fields (e.g. `shouldEnableCreateSourceAttachment`). Coordinate with `system-create-source-architecture.md`, which deletes those gates, so the two changes do not collide on a field this plan removes.
- Revisit the placeholder-only `system_create source.kind: text` guard; if kept, justify as data validation, not as routing around one eval.

## Phasing

A discriminated-union flip is close to atomic at the contract layer, so phase **around** it: land the new infrastructure non-breaking first, then flip the schema in one slice. Tests are written before implementation within each phase.

### Phase 1 — provider metadata + validation plumbing (non-breaking)

No model-visible schema change. Additive at runtime boundaries.

During Phase 1, attachment provider metadata is optional in the TypeScript type to avoid breaking existing registration call sites before they are migrated. `getProviderMetadata` returns `undefined` when a provider has not yet declared metadata, and validation reports `provider-missing-metadata`.

Tests first:

- Providers can register transitional optional metadata; `getProviderMetadata` returns metadata when present and `undefined` when absent.
- Each existing in-repo provider is migrated to declare correct `outputEntityType` (and `targetField` where applicable: `og-image` → `ogImageId`).
- `SystemServices` exposes the attachment capability namespace used by `system_generate` validation.
- A `validateGenerateRequest` helper returns the correct typed rejection reason for each failure (`unknown-entity-type`, `unsupported-generation`, `target-not-found`, `source-not-found`, `no-provider`, `provider-missing-metadata`).

### Phase 2 — flip `system_generate` to the discriminated union

Tests first (see Tests section); move all generation evals to the new branches in this same slice. End state: input is `{ operation, confirmed?, confirmationToken? }` — no top-level `entityType`/`source`/`coverImage`/`targetEntityType`/`targetEntityId`.

Eval arg-shape migration: every generation eval's expected tool args move under `operation` (e.g. `{ operation: { kind: "cover-image", ... } }`), not just renamed fields. This is a sweep across the focused eval set, done in this slice.

At the end of Phase 2, metadata becomes required for attachment providers: registration fails fast when a provider omits metadata, so authoring errors surface immediately. Validation still returns `provider-missing-metadata` as a runtime fallback for any provider that slips through.

## Tests

### Prompt / standalone-image branches

- Generates `social-post` from `kind: "prompt"` and requires confirmation.
- Generates standalone `image` from `kind: "standalone-image"` with no target.
- Rejects unknown/unregistered entity type with `unknown-entity-type`.
- Rejects registered-but-not-generatable prompt entities with `unsupported-generation`.
- A second generation with a colliding slug yields a distinct deduplicated id (no overwrite or reuse).

### Cover-image branch

- Resolves target by title/slug to canonical ID before confirmation.
- Rejects missing target before confirmation with `target-not-found`.
- Confirmation args freeze the canonical target ID.
- Confirmed execution queues image generation with target fields (→ `coverImageId`).

### Attachment branch

- Resolves source entity by title/slug to canonical ID before confirmation.
- Rejects missing source entity with `source-not-found`.
- Rejects missing provider with `no-provider`.
- `deck/carousel` derives output `document`.
- `post/printable` derives output `document`.
- `post/og-image` derives output `image` and updates source `ogImageId` by internally mapping the canonical source entity as the target.
- Providers without metadata are rejected with `provider-missing-metadata` during the transitional phase.

### Unrepresentable-input tests (parse-time, not just runtime)

These prove the contract, not just the handler:

- `{ operation: { kind: "attachment", entityType: ... } }` fails to parse (model cannot supply output type for artifacts — kills `image + carousel`).
- `{ operation: { kind: "prompt", entityType: "image", ... } }` is rejected — by serialized schema only if non-image generatable entity types are enumerated. A Zod refinement is insufficient because AI SDK JSON Schema serialization drops it. Otherwise reject by pre-confirmation runtime validation. The SDK schema exposure test must verify which level is actually enforced.
- `coverImage` anywhere fails to parse.
- `targetEntityType`/`targetEntityId` on `operation.kind: "prompt"`, `"prompt-from-source"`, `"standalone-image"`, or `"attachment"` fail to parse; cover targets must use nested `operation.target`.
- `source` on broad `operation.kind: "prompt"` fails to parse; use `operation.kind: "prompt-from-source"` for source-grounded generation.
- Flat `sourceEntityType`/`sourceEntityId` on `operation.kind: "prompt-from-source"` or `"attachment"` fail to parse; source refs must use nested `operation.source`.

### Tool visibility / schema-exposure tests

- The **model-visible** SDK schema for `system_generate.operation` exposes the five branches as alternatives with discriminator constants — AI SDK currently serializes the Zod discriminated union as JSON Schema `anyOf` branches with `kind.const`, not as collapsed optionals. Assert that alternatives survive without requiring a specific `oneOf` vs `anyOf` keyword. Also verify whether the prompt branch excludes `entityType: "image"` at the serialized schema level; if not, require runtime validation coverage. Do not rely on Zod refinements for serialized tool constraints.
- Confirmation summary/preview reflects the **derived** output entity type for `attachment` (e.g. "Generate a PDF document carousel from deck X"), since the model no longer supplies it.
- `system_create` has no generation branches.
- `document_generate` remains non-model-visible.
- `system_upload_save` remains non-model-visible.

## Focused Eval Rerun Set

After implementing structural changes, rerun focused failing evals first:

- `tool-invocation-image-create-post-og`
- `multi-turn-web-chat-file-upload-context-deck-carousel-preview`
- `image-generate-uses-target-params`
- `tool-invocation-image-standalone-generate`
- `tool-invocation-set-cover-generate-by-title`
- `social-media-generate-post-with-image`
- `cover-generation-failure-follow-up`
- `tool-invocation-newsletter-generate-from-post`

Then rerun Rover full eval:

```bash
cd brains/rover
bun run eval:full --skip-llm-judge --max-parallel 1
```

## Migration Notes

Existing internal handlers can mostly remain:

- Image prompt generation already supports target-as-cover behavior.
- Image source attachment render already supports `targetImageField: "ogImageId"`.
- Document generation already handles document-producing attachments.

Main work is the model-visible `system_generate` schema and the pre-confirmation validation layer, plus attachment provider capability metadata.
