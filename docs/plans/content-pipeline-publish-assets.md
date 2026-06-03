# Plan: Content Pipeline Publish Assets

## Status

Proposed follow-up to the generic media rendering work and the OG image / printable PDF work.

This plan moves automatic publish-adjacent media generation out of entity plugins and site building, and into the content pipeline as a reusable "publish assets" stage.

## Problem

Generated media such as OG images are content assets, but their automation is about publication readiness rather than entity storage or site rendering.

Current manual flow works:

```ts
system_create({
  entityType: "image",
  from: {
    sourceEntityType: "post",
    sourceEntityId: "resilience-in-distributed-systems",
    attachmentType: "og-image",
  },
  targetEntityType: "post",
  targetEntityId: "resilience-in-distributed-systems",
});
```

However, automatic OG generation needs a better home. The trigger should not live in:

- the site builder, because site builds should not create durable media entities as a hidden side effect;
- the image plugin, because image rendering should not know publication policy;
- individual entity plugins, because every publishable entity would need bespoke lifecycle subscribers.

## Goals

- Add a content-pipeline-owned abstraction for ensuring publish assets exist.
- Keep source entity plugins responsible for registering media providers/templates.
- Keep media plugins responsible for rendering and persisting the media entity.
- Make publish readiness idempotent and safe to run repeatedly.
- Support both on-demand publish flows and reconciliation/backfill for existing content.
- Preserve manual `system_create` flows for explicit user requests and replacement.

## Non-goals

- Do not generate media during site builds.
- Do not add a new `media` or `og-image` entity type.
- Do not make every attachment required for every publishable entity.
- Do not regenerate already-selected assets automatically unless policy explicitly allows it.
- Do not reintroduce manual provider/template version fields; use source content hashes and dedup keys.

## Proposed model

Add a publish asset registry owned by the content pipeline.

Conceptual API:

```ts
contentPipeline.registerPublishAsset({
  entityType: "post",
  attachmentType: "og-image",
  targetEntityField: "ogImageId",
  mediaEntityType: "image",
  requiredWhen: {
    status: "published",
  },
  autoGenerate: true,
});
```

Responsibilities:

- Source plugin registers attachment provider:
  - example: blog registers `post/og-image`.
- Content pipeline registers/owns publish asset policy:
  - example: published posts should have an OG image.
- Image/document plugins provide durable media creation:
  - example: `image-render-source` renders `post/og-image` into an `image` entity and writes `ogImageId`.

## Trigger points

### 1. Publish execution / direct publish

When content pipeline publishes an entity, it runs publish asset preflight before marking the entity as published or before external publication.

For each configured asset:

1. load entity;
2. check policy predicate (`status`, visibility, provider availability, target field presence);
3. skip if target field already points to an asset and regeneration is not requested;
4. enqueue the appropriate source-derived media job;
5. optionally wait for required assets, or return `generating` when async is acceptable.

### 2. Entity status transitions

When content enters a published state outside the scheduled publish runner, content pipeline can observe `entity:created` / `entity:updated` and run the same publish asset preflight.

This keeps ad hoc `system_update({ fields: { status: "published" } })` behavior aligned with scheduled publishing.

### 3. Reconciliation / backfill

Provide a content pipeline command/job to reconcile publish assets:

```ts
content -
  pipeline_ensure -
  assets({
    entityType: "post",
    status: "published",
    assetType: "og-image",
  });
```

This finds existing published entities missing configured assets and queues generation.

## Idempotency and dedup

Publish asset generation should be safe to run many times:

- use source-derived dedup keys including `attachmentType`, source type/id, and source content hash;
- skip when target field already exists unless `replace: true` or policy says stale assets should regenerate;
- use deterministic predicted media IDs such as `og-post-{sourceId}`;
- let the media job reuse existing entities by dedup key when possible.

Default policy:

- missing asset: generate;
- existing target field: skip;
- stale source hash: skip by default, report as stale/replaceable;
- explicit replace: regenerate and update target field.

## Required contract additions

Likely additions:

- A `PublishAssetDefinition` contract in content pipeline or shared contracts.
- A content-pipeline namespace for plugins to register publish asset policies.
- A generic executor that maps media entity type + attachment type to source render jobs.
- Tooling for manual reconciliation/backfill.

Possible shape:

```ts
interface PublishAssetDefinition {
  entityType: string;
  attachmentType: string;
  mediaEntityType: "image" | "document";
  targetEntityField?: "ogImageId" | "coverImageId" | string;
  requiredWhen?: {
    status?: string;
    visibility?: string;
  };
  autoGenerate?: boolean;
  requiredForPublish?: boolean;
}
```

## Initial implementation slice

Start with blog post OG images only:

1. Add the content pipeline publish asset registry.
2. Register `post/og-image` as an auto-generated publish asset.
3. Run publish asset preflight when a post becomes published.
4. Add a reconciliation tool/job for existing published posts missing `ogImageId`.
5. Keep current manual `system_create({ entityType: "image", from: ... })` path unchanged.

## Validation

Unit tests:

- registry stores and unregisters asset definitions;
- preflight skips drafts;
- preflight skips published posts with `ogImageId`;
- preflight enqueues image generation for published posts missing `ogImageId`;
- preflight does not enqueue when no attachment provider exists;
- reconciliation finds only eligible missing assets;
- repeated preflight is idempotent.

Integration/eval smoke:

- Publish or mark a post as published and verify an OG image job is queued.
- Run reconciliation against seeded published posts and verify missing OG images are generated.
- Rebuild preview site after generation and verify absolute `og:image` / `twitter:image` metadata.

## Open questions

- Should required publish assets block publish completion, or can publish complete while assets are generating?
- Should stale OG images be regenerated automatically on content changes, or only reported as replaceable?
- Should publish assets be configured by each source plugin, by content pipeline config, or both?
- Should printable PDFs ever be publish assets, or remain purely user-requested durable attachments?
