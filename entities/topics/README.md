# Topics

`@brains/topics` declares markdown-backed topics and a resumable ranked maintenance job. It does not expose native plugin services or its own CRUD/extraction tools.

## Selection

Sources vote for listed topics or propose a subject. Role weight × relevance determines support. The soft cap is `min(24, max(5, ceil(eligibleSources / topicSoftCeilingSourceRatio)))`. At the cap, a challenger needs more than a 25% lead over the weakest topic; replacement waits until every eligible source has been read at least once.

Descriptions use up to eight proposals, each truncated to 2,000 characters. Retained topics keep their IDs and URLs; new IDs are visibility-scoped title slugs. The title lives in markdown frontmatter and the description in the body. Topic metadata is empty.

The job makes at most ten **algorithm-level generation calls**, including descriptions, with at most four sources per vote prompt. These are not provider-attempt, spending, total-duration, total-scan, or total-memory limits. Later jobs continue outstanding work; source bodies are paged, but all source references and saved votes are retained for selection.

## Configuration

- `enableAutoExtraction`: defaults to `true`.
- `includeEntityTypes`: defaults to `["*"]`; `excludeEntityTypes` narrows the selection.
- `extractionVisibility`: defaults to `public`; derived topics use that visibility.
- `extractableStatuses`: defaults to `["published"]`. Missing/null status is eligible. Additional statuses can narrow or extend non-public extraction, but cannot lower the public publication floor.
- `minRelevanceScore`: defaults to `0.5`; `createRelevanceThreshold` defaults to `0.7`.
- `topicSoftCeilingSourceRatio`: defaults to `5`.
- `maxEntitiesPerBatch`: defaults to `4`, and ranked extraction clamps it to four.
- `sourceChangeBatchDelayMs`: defaults to `1000`; the SDK accepts integer delays from zero through one day.
- `sourceRoleOverrides` and `sourceRolePolicies` configure weighting and minting. Defaults: canonical/primary `1`, secondary `0.8`, supporting `0.55`, ambient `0.35`, excluded `0`. Only canonical, primary and secondary can mint by default.

The registry's `projectionSource: false` remains an exclusion floor. Topics never source themselves. Existing `sourceWeights` and `mintableEntityTypes` config overrides also affect policy. Older merge controls do not run a separate native pipeline: ranked extraction and ranked evals use the same selection algorithm and do not perform semantic merges.

## Installed runtime

- Service: `@brains/topics:topics`
- Entity: `@brains/topics:topic`
- Job: `@brains/topics:topics:extract`
- Generation templates: `@brains/topics:topic:votes` and `@brains/topics:topic:description`

Create/update/delete events are wakeup hints in both runtime roles. Startup recovery listens to `system:startup-content:settled`, not ready or the legacy initial-sync event. Failed initial import does not authorize that startup signal. Disabled extraction enqueues nothing, and its installed handler can drain earlier queued work without generating.

Each job declares an independent causal root, minted by the host. Authors cannot supply root IDs. `oncePending` deduplication permits one waiting successor while another attempt is processing; delays use the durable queue, not process-local timers.

`topics.votes`, `topics.failures` and `topics.extraction` are local names within installed runtime-state scopes. Votes record an identity covering source body hash, metadata and visibility. Sources are re-read before checkpointing and rescanned after generation. Missing, repeated or failed answers are retried separately; three counted failures produce an empty vote until its revision changes. An entirely failed provider attempt does not mark every source as abstaining.

A durable lease serializes attempts. Cancellation, lease ownership and expiry are checked before writes; release uses one compare-and-set, never a later blind delete of the lease. The lease check and content mutation are not one cross-record transaction. Cancellation does not roll back an already-admitted write or imply a spending limit.

## Mutation and migration safety

Topic selection retains host-issued canonical snapshots, including full revisions. Trimming and replacement use owner-scoped conditional removal: body, metadata or visibility changes after selection cause `conflict`, rather than deletion of the changed topic. Copied, foreign-access and expired-callback edit credentials are refused.

Descriptions are generated before deletion. **Replacement is not atomic:** interruption between delete and create leaves a vacancy that later maintenance can fill. Source rechecks are not a transaction spanning source withdrawal and topic creation.

The entity declaration retires exactly `topics-projection` version `1` for its owned `topic` type before orphan reconciliation, even when automatic extraction is disabled. The host removes only those ownership rows, preserving content and other rules, versions and types. Repeating the handoff is harmless.

**Stop old writers before upgrading.** This is a one-way handoff; no mixed-version or downgrade guarantee is provided. Native unscoped checkpoints are not imported into the new installed namespace; changed state schemas are not silently reset or replayed. Back up and reconcile old runtime state before rollout. Historical provider usage remains historical evidence, not validation of this declarative integration.

## Tools and evaluation

Use shared `system_get`, `system_list`, `system_search`, `system_create`, `system_update` and `system_delete` tools. There is no manual extraction/rebuild tool. The topic ATProto declaration is retained; live publication/deletion acceptance is separate.

Eval handlers run the same ranked algorithm, using local vote/lease checkpoints and local topic mutations, without deleting live topics. Source fixtures still use the evaluation fixture capability. Evals may call providers; provider-free unit tests do not certify live model quality or spending.

## Key files

- `src/index.ts`: declarative package, jobs, subscriptions and insights
- `src/topic-entity.ts`: codec, presentation, templates and retirement declaration
- `src/lib/ranked-topic-extraction.ts`: checkpointed ranking engine
- `src/lib/owned-topics.ts`: host-issued topic snapshots and conditional removal
- `src/lib/topic-selection.ts`: weighted support and challenger selection
- `src/lib/topic-source-policy.ts`: source eligibility
- `src/lib/eval-handlers.ts`: ranked evaluation handlers

## Validation

From `entities/topics`, run `bun test` and `bun run typecheck`. Provider-backed evaluation and live rollout require separate authorization.
