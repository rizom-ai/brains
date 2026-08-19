# Topic extraction cost and reconciliation

## Status

Proposed.

## Goal

Make topic extraction incremental (stop re-extracting the whole corpus every projection wave), give the extraction prompt real canonicalization evidence (embedding-retrieved nearest topics instead of a flat 40-title list), and wire semantic merge into the production path (it currently only runs in evals). A final slice surfaces topic coverage from the embedding space at zero LLM cost.

The division of labor stays as it is: the LLM discovers topics, embeddings canonicalize them. Cluster-then-label was considered and rejected — clusters partition on embedding variance (document type, project, register), not on "durable knowledge domain", and re-clustering churns slug-derived topic identities that are published to ATProto and site URLs.

## Current state (verified against code)

Four facts drive this plan:

1. **Every wave is a full-corpus pass.** `selectTopicWaveInput` (`entities/topics/src/lib/topic-wave-rule.ts:92`) ignores the wave trigger entirely and selects _all_ eligible sources; `deriveTopicIntents` (`topic-wave-rule.ts:214`) then loops every source in batches of `maxEntitiesPerBatch` (4), one `ai.generate` call per batch. The scheduler memoizes `derive` by input fingerprint (`shell/core/src/projection-rule-job-handler.ts:274-314`), but any single changed source changes the fingerprint, so one edited note costs ~⌈N/4⌉ LLM calls where N is the corpus size.
2. **Canonicalization evidence is a flat title list.** `buildTopicExtractionPrompt` (`entities/topics/src/lib/extraction-prompt.ts`) feeds the LLM up to 40 existing topic _titles_ (`MAX_EXISTING_TOPIC_TITLES`), with no summaries and silent truncation past 40. The LLM cannot judge whether "Fragmentation" already covers a new angle, so it mints near-duplicates that downstream merging must clean up.
3. **Production has no semantic merge.** `findMergeCandidate` / `autoMerge` run only in the legacy batch extractor (`topic-batch-extractor.ts`, used by rebuild/eval handlers), and `reconcileTopics` (`topic-reconciliation.ts`) is reachable only from `eval-handlers.ts`. The wave rule's only dedup is "same slug ⇒ same id" (`existingIds.has(id)` skip). The `autoMerge: true` config default is dead in the production path.
4. **Coverage already exists geometrically but isn't surfaced.** `buildKnowledgeMapData` (`lib/knowledge-map-data.ts`) assigns every entity to its nearest topic zone within `ZONE_RADIUS = 0.16` in the PCA-projected plane; entities with `zoneId: null` are unclaimed knowledge, currently visible only as unlabeled dots on the map.

Relevant infrastructure that already exists:

- `IEntityService.searchWithDistances` and `projectSemanticSpace` (`shell/entity-service/src/types.ts:759-766`).
- `ProjectionInputContext.entities` is a narrow `ProjectionEntityReader` (`shell/plugins/src/entity/projection-rule.ts:43-50`) — **no** `searchWithDistances`; `ProjectionExecutionContext` has only `ai` + `logger`. Retrieval therefore belongs in `selectInput`, behind a one-method reader extension.
- `PROJECTION_CHANNELS.waveReady` broadcasts `{waveId, sourceTypes, changedTargetTypes}` after each wave; site-builder's auto-rebuild (`plugins/site-builder/src/lib/auto-rebuild.ts:168-190`) is the reference consumer via `context.messaging.subscribeExecution`. `beforeWaveCompletion` (`shell/core/src/initialization/shellBootloader.ts:151`) fails the wave if a handler errors, so wave-ready handlers must acknowledge fast and defer real work to a job.
- Plugins get scoped job enqueue/registration via `context.jobs` (`shell/plugins/src/base/context.ts:216`).

## Phases

Each phase is an independently shippable vertical slice. Tests are written first within each phase (existing suites: `entities/topics/test`, `shell/core/test`, `shell/plugins/test`).

### Phase 1 — incremental waves

The wave rule processes only the sources that triggered the wave.

- `selectTopicWaveInput` consumes `trigger.inputs` (the wave's dirty set: `sourceType`/`sourceId`/`operation`) instead of listing the corpus: fetch each upserted source via `context.entities.getEntity`, apply the existing eligibility filters (visibility scope, extractable status, source-role policy), skip `delete` operations. Sources are sorted as today so the fingerprint stays deterministic.
- The soft ceiling (`topicSoftCeiling`) needs the corpus-wide eligible-source count, not the changed count. Keep the per-type `listEntities` pass solely to compute `totalSourceCount` (DB reads only — the cost being cut is LLM calls, not row reads) and add it to the input schema.
- Bump the rule `version` to `"2"` — the input shape changes, so old memos must not be reused.
- Semantics are unchanged for the two cases that matter: the initial wave and rebuilds mark everything dirty, so they remain full passes; steady state drops from ⌈N/4⌉ to ⌈changed/4⌉ generate calls per wave.
- Tests first: extend `topic-wave-rule` tests to assert (a) only trigger-named sources appear in the selected input, (b) delete operations are skipped, (c) the ceiling still reflects the full corpus, (d) an unchanged re-run produces an identical fingerprint.

### Phase 2 — retrieval-augmented canonicalization

Replace the flat 40-title prompt block with the k nearest existing topics, with summaries.

- Shell: add `searchWithDistances` to `ProjectionEntityReader` (`shell/plugins/src/entity/projection-rule.ts:43`) and wire it through `createProjectionInputContext`. It is a read — it fits the reader contract. No other shell change.
- In `selectTopicWaveInput`, for each changed source, call `searchWithDistances` with the source content truncated to its first ~2,000 characters, keep hits with `entityType === "topic"`, resolve each via `getEntity` to check `extractionVisibility` and read the body, and keep the top **k = 8** per source. The union across the wave's sources (deduped by id, capped at 24) goes into the input as `nearestTopics: [{id, title, summary}]`, where `summary` is the first paragraph of the topic body.
- `existingTopics` (full id+title list) stays in the input — `deriveTopicIntents` still needs the complete id set for the mint-skip and the ceiling. Only the _prompt_ changes: `buildTopicExtractionPrompt` renders a "Nearest existing topics" block with title + summary and the instruction to reuse a title exactly when the content belongs to it. In-wave minted titles are still appended as today.
- Fallback: when retrieval returns nothing (embeddings not yet indexed — the same lag `findMergeCandidate` documents), fall back to the current global title list. `listExistingTopicTitles` stays for this path.
- The retrieved neighbors are part of the selected input, so they are fingerprinted — a changed topic set correctly invalidates the memo.
- Tests first: prompt-builder tests asserting the neighbor block renders title + summary and the fallback engages on empty retrieval; wave-rule tests asserting neighbors are fetched per changed source, filtered by visibility, deduped, and capped.

### Phase 3 — semantic merge in production

Give `autoMerge` its meaning back: run the reconciliation sweep after waves that write topics.

- In `TopicsPlugin.onRegister`, when `config.autoMerge` is true: register a plugin-scoped job handler `topics:reconcile` via `context.jobs` that calls `reconcileTopics` with `semanticMergeDistance`, `reconciliationMaxPairs`, and `extractionVisibility` from config, and subscribe with `context.messaging.subscribeExecution(PROJECTION_CHANNELS.waveReady, …)` following the site-builder pattern. The handler checks `changedTargetTypes.includes("topic")`, enqueues the job, and returns `{success: true}` immediately — reconciliation must never run inline, because `beforeWaveCompletion` fails the wave on a slow or erroring acknowledgment.
- Pileup guard: an in-memory latch — while a reconcile job is pending, further wave-ready signals set a "rerun" flag instead of enqueuing a second job; the handler re-enqueues once on completion if the flag is set. The sweep is idempotent and bounded by `reconciliationMaxPairs`, so a missed latch after restart is harmless.
- `reconcileTopics` already emits `TOPICS_BATCH_COMPLETED_EVENT` when it merges, so dashboards refresh without new wiring.
- Expected interaction with Phase 2: better canonicalization at extraction time should make the sweep's steady-state merge count approach zero; the sweep remains the safety net for drift and for topics minted before Phase 2.
- Tests first: plugin registration test asserting the subscription and handler exist only when `autoMerge` is set; handler test asserting fast acknowledgment, enqueue-on-topic-change, no-enqueue otherwise, and the latch behavior; reuse the existing `reconcileTopics` unit coverage for sweep semantics.

### Phase 4 — topic-coverage insight

Surface unclaimed knowledge from geometry already being computed, at zero LLM cost.

- Extract the zone-assignment step of `buildKnowledgeMapData` (spread layout + nearest-zone-within-`ZONE_RADIUS`) into a shared helper so the map and the insight cannot diverge.
- Register a `topic-coverage` insight next to `topic-distribution` (`src/insights/`, registered in `index.ts`): call `entityService.projectSemanticSpace`, run the shared assignment, and return `{covered, uncovered, entities: [{id, entityType, title}]}` where `entities` lists the unclaimed points, capped at 50. The `InsightHandler` signature already provides `entityService` and the visibility scope; `projectSemanticSpace` is on `IEntityService`, so no context extension is needed.
- This is the useful half of the cluster-labeling idea: the embedding space votes on what the topic set fails to cover, and a human (or a later workflow) decides whether that warrants new topics.
- Tests first: insight test with a stubbed projection asserting assignment parity with the knowledge map and the cap.

## Decisions made here (not open)

- **k = 8 neighbors per source, union capped at 24** — enough evidence without crowding the prompt; the cap matches the topic soft ceiling's maximum.
- **Retrieval lives in `selectInput`, not `derive`** — `derive` stays a pure input→intents function and the neighbors participate in memoization.
- **Reconciliation triggers off `waveReady` + job queue, not a cron** — it runs exactly when topics changed, is durable, and needs no new scheduling infrastructure.
- **The legacy batch extractor is untouched** — rebuild and eval harnesses keep their full-corpus semantics; Phase 1 changes only the projection rule.
- **Corpus count keeps using `listEntities`** — extending the reader with a filtered count API is not worth it while the eligibility filter needs metadata inspection anyway.
