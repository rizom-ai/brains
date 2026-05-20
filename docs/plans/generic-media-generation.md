# Plan: Generic Media Generation and Frozen Artifacts

## Status

Proposed follow-up to the PDF carousel MVP.

The current preview tool proves that source-derived attachments can render correctly, but previews are disposable. The next step is to replace preview-only behavior with a generic generation flow that can optionally freeze the exact rendered artifact for later publishing.

## Goal

Provide one generic operator/tooling path for generated media artifacts:

```text
generate <sourceEntityType> <sourceEntityId> <attachmentType>
```

The same path should support:

- previewing the generated artifact locally
- freezing the generated artifact as a durable entity
- attaching the frozen artifact to a target entity such as a `social-post`
- publishing the exact approved artifact without regenerating it

## Non-goals

- Do not add implicit caching to every source-derived publish.
- Do not make previews durable unless explicitly requested.
- Do not remove source-derived publishing fallback; publishing should still regenerate when no frozen artifact is attached.
- Do not introduce a new entity type for every artifact kind.

## Proposed operator surface

Replace or deprecate `preview-attachment` with a generic generation command/tool:

```bash
brain generate-media deck distributed-systems-primer carousel --outputDir .tmp/media
brain generate-media deck distributed-systems-primer carousel --freeze
brain generate-media deck distributed-systems-primer carousel --freeze --attach social-post my-post
```

Equivalent MCP/tool shape:

```ts
media_generate({
  sourceEntityType: "deck",
  sourceEntityId: "distributed-systems-primer",
  attachmentType: "carousel",
  outputDir?: string,
  freeze?: boolean,
  targetEntityType?: "social-post",
  targetEntityId?: string,
});
```

## Behavior

1. Resolve the attachment through the existing attachment registry.
2. Render the artifact using the source-owned provider.
3. Always return artifact metadata: filename, MIME type, byte size, page count if known, and source reference.
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

1. Add a generic `media_generate` service tool that wraps attachment resolution.
2. Add CLI support for the same operation.
3. Move `preview-attachment` onto the generic implementation, then mark it deprecated.
4. Implement freeze-to-entity for document artifacts first; carousel PDFs use this path.
5. Add optional attach-to-target support for `social-post.documents[]`.
6. Add dedup lookup/reuse for frozen artifacts.
7. Add tests that publishing with explicit `documents[]` does not regenerate the carousel.
8. Update docs to recommend `generate-media` over `preview-attachment`.

## Validation

- Generate-only writes a valid local PDF and creates no entity.
- Generate with `--freeze` creates a durable `document` entity.
- Re-running `--freeze` with unchanged input reuses the existing document by `dedupKey`.
- `--force` creates or refreshes the frozen artifact intentionally.
- `--attach social-post ...` updates the social post with the frozen document ID.
- Publishing an attached frozen document does not invoke the source-derived carousel renderer.
- Publishing without an attached document still falls back to source-derived generation.
