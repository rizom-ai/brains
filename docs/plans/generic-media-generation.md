# Plan: Generic Media Generation and Frozen Artifacts

## Status

Proposed follow-up to the PDF carousel MVP.

The current preview tool proves that source-derived attachments can render correctly, but previews are disposable. The next step is to replace preview-only behavior with a generic generation flow that can optionally freeze the exact rendered artifact for later publishing.

## Goal

Provide one generic operator/tooling path for generated media artifacts under the existing media tooling plugin.

The same path should support:

- generating source-derived attachments such as `deck` → `carousel` PDFs
- generating prompt-derived images such as cover images
- previewing the generated artifact locally
- freezing the generated artifact as a durable entity
- attaching the frozen artifact to a target entity such as a `social-post`
- publishing the exact approved artifact without regenerating it

## Non-goals

- Do not add implicit caching to every source-derived publish.
- Do not make previews durable unless explicitly requested.
- Do not remove source-derived publishing fallback; publishing should still regenerate when no frozen artifact is attached.
- Do not introduce a new entity type for every artifact kind.

## Plugin ownership

Keep the existing `plugins/media-tools` service plugin and expand it from preview-only tooling into the operator-facing media generation plugin.

Ownership boundaries:

- `media-tools` owns tools/CLI orchestration: generate, preview-to-file, freeze, attach.
- `image` entity plugin owns image schema, adapter, storage, and compatibility job handling.
- `document` entity plugin owns PDF/document schema, adapter, and storage.
- source entity plugins, such as `deck`, own their source-derived providers.

Move operator-facing image generation into `media-tools` over time, but keep existing `image:image-generate` jobs and `system_create(... coverImage ...)` behavior as compatibility shims until callers migrate.

## Proposed operator surface

Replace or deprecate `preview-attachment` with media generation commands/tools:

```bash
brain media generate attachment deck distributed-systems-primer carousel --outputDir .tmp/media
brain media generate attachment deck distributed-systems-primer carousel --freeze
brain media generate attachment deck distributed-systems-primer carousel --freeze --attach social-post my-post
brain media generate image --prompt "Editorial cover image for ..." --target post my-post --as cover
```

Equivalent MCP/tool shapes:

```ts
media_generate({
  mode: "attachment",
  sourceEntityType: "deck",
  sourceEntityId: "distributed-systems-primer",
  attachmentType: "carousel",
  outputDir?: string,
  freeze?: boolean,
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
```

## Behavior

1. For `mode: "attachment"`, resolve the artifact through the existing attachment registry.
2. For `mode: "image"`, generate an image through the configured AI image provider.
3. Always return artifact metadata: filename, MIME type, byte size, page count if known, and source reference where applicable.
4. If `outputDir` is provided, write the artifact to disk for inspection.
5. If `freeze` is true, store the artifact as a durable `document` or `image` entity.
6. If `attach` is provided, update the target entity to reference the frozen artifact.
7. Publishing prefers explicit frozen artifacts first, then falls back to source-derived generation.

## Dedup key

Frozen artifacts should use a deterministic `dedupKey` based on:

- source entity type and ID
- source entity content hash
- attachment type
- renderer/provider version
- relevant theme/site styling version, where available

If an artifact with the same `dedupKey` already exists, reuse it and return the existing entity ID unless `--force` is provided.

## Implementation steps

1. Add a generic `media_generate` service tool in `plugins/media-tools` with discriminated modes.
2. Add CLI support as `brain media generate ...`.
3. Move `preview-attachment` onto the `mode: "attachment"` implementation, then mark it deprecated.
4. Implement freeze-to-entity for document artifacts first; carousel PDFs use this path.
5. Add optional attach-to-target support for `social-post.documents[]`.
6. Move operator-facing prompt image generation into `media-tools`, reusing the current image generation logic.
7. Keep `image:image-generate` and cover-image creation as compatibility shims.
8. Add dedup lookup/reuse for frozen artifacts.
9. Add tests that publishing with explicit `documents[]` does not regenerate the carousel.
10. Update docs to recommend `brain media generate` over `preview-attachment`.

## Validation

- Attachment generate-only writes a valid local PDF and creates no entity.
- Attachment generate with `--freeze` creates a durable `document` entity.
- Image generate creates a durable `image` entity and can attach it as cover/OG image.
- Re-running `--freeze` with unchanged input reuses the existing document by `dedupKey`.
- `--force` creates or refreshes the frozen artifact intentionally.
- `--attach social-post ...` updates the social post with the frozen document ID.
- Publishing an attached frozen document does not invoke the source-derived carousel renderer.
- Publishing without an attached document still falls back to source-derived generation.
