---
"@brains/content-pipeline": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
---

Migrate `@brains/content-pipeline` to the declarative surface. The package is one `defineServicePlugin` (`publishing`) importing `@brains/sdk`, `@brains/contracts`, `@brains/scheduler` and `@brains/utils`; `ContentPipelinePlugin` is deleted. The fourteen bus handlers are `defineSubscription`, each with a payload schema so a malformed request is refused before it reaches the queue; the dashboard widget and the Publishing workspace are declared and bound in their slots; `publishing_manage` is `defineTool`. The per-tool `queue` and `publish` factories are gone — nothing registered them.

**The pipeline owns no entity types, and no longer writes as if it did.** Recording a publish outcome — status, the timestamp, the provider's id — and queueing a generated publish asset both go through `publishing` on the service setup context, which the runtime scopes to what each package delegated by declaring `publish` or `publishAssets`. A type nobody declared publishable is refused, and the asset job is the one that type's declaration named rather than one the pipeline picks. `PublishDelegationRegistry` records those delegations as the declarations register, each bound to the declaring package's own entity access.

The service setup context also gains `messaging`, `permissions`, `attachments` and `jobs`, with `@brains/content-pipeline` as the named consumer: a scheduler running on a timer has no caller to answer, it applies the permission check on a caller's behalf over types it does not own, what it sends includes media another package resolves, and an operator page shows the work it queued. `ServiceJobs` gains `active()`, scoped to this package's own jobs. `@brains/sdk/services` exports `IAttachmentsNamespace`, `IPermissionsNamespace`, `OperatorRegionBlock`, `ServiceActiveJob`, `ServiceJobs`, `ServicePublisher`, `ServicePublishingAccess` and `permissionToVisibilityScope`.

The runtime plugin id is `@brains/content-pipeline:publishing`; the capability id in a brain's configuration is still `content-pipeline`, so `brain.yaml` is unchanged.
