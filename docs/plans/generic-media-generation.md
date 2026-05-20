# Plan: Generic Media Generation and Saved Artifacts

## Status

Proposed follow-up to the PDF carousel MVP.

The current preview tool proves that source-derived attachments can render correctly, but previews are disposable. The next step is to replace preview-only behavior with a generic generation flow that can optionally save the exact rendered artifact for later publishing.

## Goal

Provide one generic operator/tooling path for generated media artifacts under the existing media tooling plugin.

The same path should support:

- generating source-derived attachments such as `deck` → `carousel` PDFs
- generating prompt-derived images such as cover images
- previewing the generated artifact locally
- saving the generated artifact as a durable entity when explicitly requested
- attaching saved or existing media to target entities through a generic media attachment surface
- publishing the exact approved artifact without regenerating it

## Non-goals

- Do not add implicit caching to every source-derived publish.
- Do not make previews durable unless explicitly requested.
- Do not remove source-derived publishing fallback; publishing should still regenerate when no saved artifact is attached.
- Do not introduce a new entity type for every artifact kind.

## Plugin ownership

Keep the existing `plugins/media-tools` service plugin and expand it from preview-only tooling into the operator-facing media generation plugin.

Ownership boundaries:

- `media-tools` owns tools/CLI orchestration: generate, preview-to-file, save, attach.
- `image` entity plugin owns image schema, adapter, storage, and compatibility job handling.
- `document` entity plugin owns PDF/document schema, adapter, and storage.
- source entity plugins, such as `deck`, own their source-derived providers.

Move operator-facing image generation and media assignment into `media-tools`. The old `system_set-cover` tool should be removed rather than kept as a parallel operator surface; update system prompts, tool descriptions, and evals to use `media_attach` for assignment and `system_update` for removal. Keep existing `image:image-generate` jobs and `system_create(... coverImage ...)` behavior only where they are internal creation flows, not as the preferred operator-facing media API.

## Proposed operator surface

Replace or deprecate `preview-attachment` with media generation commands/tools:

```bash
brain media generate attachment deck distributed-systems-primer carousel --outputDir .tmp/media
brain media generate attachment deck distributed-systems-primer carousel --save
brain media generate attachment deck distributed-systems-primer carousel --save --attach social-post my-post --as document
brain media generate image --prompt "Editorial cover image for ..." --attach post my-post --as cover
brain media attach image my-image post my-post --as cover
brain system update post my-post --fields '{"coverImageId": null}'
```

Equivalent MCP/tool shapes:

```ts
media_generate({
  mode: "attachment",
  sourceEntityType: "deck",
  sourceEntityId: "distributed-systems-primer",
  attachmentType: "carousel",
  outputDir?: string,
  save?: boolean,
  targetEntityType?: "social-post",
  targetEntityId?: string,
});

media_generate({
  mode: "image",
  prompt: "Editorial cover image for ...",
  title?: "...",
  aspectRatio?: "16:9",
  targetEntityType?: "post",
  targetEntityId?: "my-post",
  attachAs?: "cover" | "og",
});

media_attach({
  mediaEntityType: "image" | "document",
  mediaEntityId: "my-image",
  targetEntityType: "post",
  targetEntityId: "my-post",
  as: "cover" | "og" | "document",
});
```

## Behavior

1. For `mode: "attachment"`, resolve the artifact through the existing attachment registry.
2. For `mode: "image"`, generate an image through the configured AI image provider.
3. Always return artifact metadata: filename, MIME type, byte size, page count if known, and source reference where applicable.
4. If `outputDir` is provided, write the artifact to disk for inspection.
5. If `save` is true, store the artifact as a durable `document` or `image` entity.
6. If `attach` is provided, imply `save: true` and call the same generic attach logic exposed by `media_attach`.
7. `media_attach` updates target fields by semantic role: `coverImageId` for `as: "cover"`, `ogImageId` for `as: "og"`, and `documents[]` for `as: "document"`.
8. Removing media references remains a normal entity mutation via `system_update`, e.g. clearing `coverImageId`, `ogImageId`, or removing an ID from `documents[]`.
9. Publishing prefers explicit saved artifacts first, then falls back to source-derived generation.

## Save semantics

Saving is an explicit approval/pinning action, not a cache.

- Default generation is disposable: write to `outputDir` if requested, return metadata, and create no entity.
- `--save` persists the exact generated artifact as a durable entity.
- `--attach ...` implies `--save` because target entities should reference durable artifacts, not temporary files.
- `media attach` can also attach an already-existing `image` or `document` entity without generating anything.
- The implementation/docs may describe saved artifacts as "frozen" internally, but the operator-facing flag should be `--save`.

## Dedup key

Saved artifacts should use a deterministic `dedupKey` based on:

- source entity type and ID
- source entity content hash
- attachment type
- renderer/provider version
- relevant theme/site styling version, where available

If a saved artifact with the same `dedupKey` already exists, reuse it and return the existing entity ID unless `--force` is provided.

## Implementation steps

1. Add a generic `media_generate` service tool in `plugins/media-tools` with discriminated modes.
2. Add CLI support as `brain media generate ...`.
3. Move `preview-attachment` onto the `mode: "attachment"` implementation, then mark it deprecated.
4. Implement save-to-entity for document artifacts first; carousel PDFs use this path.
5. Add a `media_attach` tool in `plugins/media-tools`.
6. Implement semantic attach roles: `cover`, `og`, and `document`.
7. Replace `system_set-cover` with `media_attach` and remove the old tool from the registered system tool surface.
8. Update system prompts, tool instructions, and eval expectations that currently mention `system_set-cover`; removal cases should use `system_update`.
9. Add optional attach-to-target support for `social-post.documents[]`.
10. Move operator-facing prompt image generation into `media-tools`, reusing the current image generation logic.
11. Keep `image:image-generate` and cover-image creation as internal compatibility shims where needed.
12. Add dedup lookup/reuse for saved artifacts.
13. Add tests that publishing with explicit `documents[]` does not regenerate the carousel.
14. Update docs to recommend `brain media generate` / `brain media attach` over `preview-attachment` and `system_set-cover`.

## Validation

- Attachment generate-only writes a valid local PDF and creates no entity.
- Attachment generate with `--save` creates a durable `document` entity.
- Image generate creates a durable `image` entity and can attach it as cover/OG image.
- `media_attach image ... --as cover` replaces an entity's cover image.
- `system_update fields: { coverImageId: null }` removes an entity's cover image.
- Re-running `--save` with unchanged input reuses the existing document by `dedupKey`.
- `--force` creates or refreshes the saved artifact intentionally.
- `--attach social-post ... --as document` updates the social post with the saved document ID.
- Publishing an attached saved document does not invoke the source-derived carousel renderer.
- Publishing without an attached document still falls back to source-derived generation.
- System prompts and evals no longer reference `system_set-cover`.
