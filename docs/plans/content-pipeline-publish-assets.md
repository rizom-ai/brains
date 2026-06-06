# Plan: Content Pipeline Publish Assets

## Status

Implemented on branch `feat/content-pipeline-publish-assets`.

This plan moves automatic publish-adjacent media generation out of entity plugins and site building, and into the content pipeline as a reusable "publish assets" stage.

Implementation notes:

- Added a shared `PublishExecutor` and `PublishStateUpdater` for provider-mode direct/queued publishing.
- Removed legacy `publish:execute` fallback; registered providers publish through the shared executor path.
- Added `PublishAssetRegistry`, `publish-assets:register`, `PublishAssetPreflight`, and `content-pipeline_ensure-assets`.
- Blog registers `post/og-image` as an auto-generated publish asset.
- Publish asset preflight now runs after provider-mode publish and on published entity create/update events.

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

There is also existing publish-flow drift that should be cleaned up before publish assets are added:

- The scheduler lives in `content-pipeline`, while legacy blog/deck publish state transitions had lived in entity-plugin `publish:execute` subscribers.
- Direct publish and queued publish do not clearly share one execution path.
- Provider-mode publishing and legacy message-driven publishing had different semantics.
- Frontmatter-backed publishable entities need `status` and `publishedAt` updated in both metadata and markdown content.
- These split paths would make publish-asset hooks fragile or duplicated.

## Goals

- Consolidate publish execution/state transitions inside content pipeline before adding publish assets.
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
- Do not move the content scheduler out of `content-pipeline`; only clarify its internal boundaries.

## Prerequisite: publish pipeline consolidation

Before implementing publish assets, consolidate publish ownership inside `content-pipeline`:

- Keep `ContentScheduler` as timing/cron/queue polling only.
- Add or clarify a `PublishExecutor` responsible for publish execution.
- Make direct publish and queued publish use the same executor path.
- Centralize the internal publish transition for markdown/frontmatter entities so `status` and `publishedAt` are updated consistently in both metadata and content/frontmatter.
- Reduce bespoke blog/deck publish handlers that only mark entities as published.
- Keep provider-specific external publishing pluggable through the existing provider registration model.

Suggested internal boundaries:

- `ContentScheduler`: decides _when_ to run queued/scheduled work.
- `PublishExecutor`: loads, validates, publishes, updates publish state, emits success/failure.
- `PublishStateUpdater`: performs durable status/frontmatter updates for internal publishing.
- `PublishAssetRegistry`: stores configured publish asset policies.
- `PublishAssetPreflight`: checks target fields and enqueues media jobs.

This keeps the scheduler in the right package while making publish asset hooks straightforward.

## Proposed publish asset model

Add a publish asset registry owned by the content pipeline.

Conceptual API:

```ts
contentPipeline.registerPublishAsset({
  entityType: "post",
  attachmentType: "og-image",
  targetEntityField: {
    location: "frontmatter",
    field: "ogImageId",
  },
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

When content pipeline publishes an entity, it should use one publish executor for both direct and queued publishing. Publish assets can then run as a stage around that executor.

For OG images, the first implementation should run asynchronously after the entity is marked published, because the rendered OG template may need `publishedAt` to already exist.

For each configured asset:

1. load entity;
2. check policy predicate (`status`, visibility, provider availability, target field presence);
3. skip if target field already points to an asset and regeneration is not requested;
4. enqueue the appropriate source-derived media job;
5. return `generating`/queued status for async assets by default.

### 2. Entity status transitions

When content enters a published state outside the scheduled publish runner, content pipeline can observe `entity:created` / `entity:updated` and run the same publish asset preflight.

This keeps ad hoc `system_update({ fields: { status: "published" } })` behavior aligned with scheduled publishing. If event coverage is insufficient, v1 can hook only the centralized `PublishExecutor` and add transition observation later.

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

- use source-derived dedup keys including `attachmentType`, source type/id, and a source content hash;
- avoid self-referential stale detection: managed fields such as `ogImageId` must be excluded from the hash, or stale detection must be disabled for v1;
- skip when target field already exists unless `replace: true` or policy says stale assets should regenerate;
- use deterministic predicted media IDs such as `og-post-{sourceId}`;
- enqueue jobs with queue-level deduplication (`deduplication: "skip"`) and a stable `deduplicationKey` so repeated publish/update events do not create duplicate pending jobs;
- let the media job reuse existing entities by dedup key when possible.

Default policy:

- missing asset: generate;
- existing target field: skip;
- stale source hash: skip by default, report as stale/replaceable;
- explicit replace: regenerate and update target field.

## Required contract additions

Likely additions:

- A `PublishExecutor` contract/helper used by both scheduler and direct publish tool.
- A `PublishStateUpdater` helper for markdown/frontmatter-backed publishable entities.
- A `PublishAssetDefinition` contract in content pipeline or shared contracts.
- A content-pipeline namespace or message channel for plugins to register publish asset policies.
- A generic executor that maps media entity type + attachment type to source render jobs.
- Tooling for manual reconciliation/backfill.

Registration should stay order-safe and message-based, following the existing `publish:register` pattern:

```ts
await context.messaging.send({
  type: "publish-assets:register",
  payload: {
    entityType: "post",
    attachmentType: "og-image",
    mediaEntityType: "image",
    targetEntityField: { location: "frontmatter", field: "ogImageId" },
    requiredWhen: { status: "published" },
    autoGenerate: true,
    jobType: "image:image-render-source",
  },
});
```

Possible shape:

```ts
type PublishAssetTargetField =
  | string
  | {
      location: "metadata" | "frontmatter";
      field: string;
    };

interface PublishAssetDefinition {
  entityType: string;
  attachmentType: string;
  mediaEntityType: "image" | "document";
  targetEntityField?: PublishAssetTargetField;
  requiredWhen?: {
    status?: string;
    visibility?: string;
  };
  autoGenerate?: boolean;
  requiredForPublish?: boolean;
  jobType?: string; // e.g. "image:image-render-source"
}
```

## Initial implementation slice

### Phase 0: publish pipeline consolidation

1. Add or clarify a content-pipeline `PublishExecutor`.
2. Route both direct publish and queued/scheduled publish through the same executor.
3. Centralize internal publish state transitions for publishable markdown entities, including frontmatter/content and metadata updates.
4. Keep provider registration external and backward-compatible.
5. Reduce blog/deck entity-plugin publish handlers to registration-only where possible.

### Phase 1: blog post OG images

Start with blog post OG images only:

1. Add the content pipeline publish asset registry.
2. Register `post/og-image` as an auto-generated publish asset, preferably over a message-based API such as `publish-assets:register`.
3. Run publish asset preflight after a post becomes published so `publishedAt` exists before render.
4. Enqueue the fully-qualified media job (`image:image-render-source`) with queue deduplication.
5. Add a reconciliation tool/job for existing published posts missing `ogImageId`.
6. Keep current manual `system_create({ entityType: "image", from: ... })` path unchanged.

## Validation

Unit tests:

- direct publish and queued publish share the same executor path;
- internal publish updates metadata and frontmatter/content consistently for markdown entities;
- registry stores and unregisters asset definitions;
- preflight skips drafts;
- preflight skips published posts with `ogImageId`;
- preflight enqueues image generation for published posts missing `ogImageId`;
- preflight uses fully-qualified media job types and queue deduplication;
- preflight does not enqueue when no attachment provider exists;
- reconciliation finds only eligible missing assets;
- repeated preflight is idempotent.

Integration/eval smoke:

- Publish or mark a post as published and verify an OG image job is queued.
- Run reconciliation against seeded published posts and verify missing OG images are generated.
- Rebuild preview site after generation and verify absolute `og:image` / `twitter:image` metadata.

## Decisions for v1

- Publish assets do not block publish completion; they are generated asynchronously.
- Existing target fields are skipped; stale/regeneration policy is deferred.
- Source plugins register publish asset policy over the content-pipeline message API.
- Printable PDFs remain user-requested durable attachments for now.
- Entity transition observation is included for published `entity:created` / `entity:updated` events.

## Open questions

- Should stale OG images be regenerated automatically on content changes, or only reported as replaceable?
- Should printable PDFs ever be publish assets, or remain purely user-requested durable attachments?
