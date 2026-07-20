# Topics Derivation

**Status:** Phases 1–2 implemented; Phase 3 mint economics next

The topic system produces near-duplicates and operational residue. Root
causes, verified in code:

- Merge candidacy is retrieved semantically (vector search bounds the pool)
  but **decided lexically** — `scoreTopicSimilarity` is title-token overlap
  with a tiny synonym table. "message testing" vs "messaging validation"
  scores 0; the knowledge-architecture trio scores ~0.2 pairwise; nothing
  reaches the 0.85 threshold. The semantic index the brain runs on is never
  consulted for the decision.
- Merges happen **only at extraction time** — two topics that already exist
  are never compared again.
- The extraction prompt says "prefer umbrella topics" but never defines what
  a topic **is**, so process artifacts (staging deployment, landing page
  copy, action plans) become topics.
- Every source type can mint a topic as cheaply as an authored essay, and
  one flat relevance cutoff (0.5) gates creation and reinforcement alike.

## Decisions (reviewed with the operator)

1. **Semantic distance is the merge arbiter.** Embedding distance decides
   candidacy; the LLM merge synthesizer confirms and writes the canonical
   topic. Exact-title match stays as a fast path. Lexical token scoring
   retires.
2. **A reconciliation pass reconciles what already exists.** An internal
   `topics:reconcile` job mode semantically scans existing topic pairs and
   merges them through the same synthesizer; it is triggered after each
   extraction wave. No public tool is exposed unless an operator surface is
   needed later.
3. **The extraction prompt gains a granularity contract.** A topic is a
   durable knowledge domain expected to accumulate entities over time —
   never operational activities, deliverables, or one-off tasks; prefer
   fewer, broader topics at small corpus sizes.
4. **Sources stay as configured** (post, deck, project, link,
   anchor-profile; note joins as a source when present). No narrowing —
   noise control comes from mint economics, not exclusion.
5. **After shipping, the live brain runs a full topic rebuild**
   (`rebuildAllTopics` + `topics:reconcile`): derived topics are deleted and
   re-derived under the new rules. No hand curation.
6. **A corpus-proportional soft ceiling.** `ceil(sourceEntities / 8)`
   clamped to [5, 24]. At or above the ceiling, extraction may not create:
   candidates must merge into an existing topic unless the synthesizer
   explicitly rules the domain novel.
7. **Mint economics: creation tier + numeric weights, both.**
   - Creation tier (may mint topics): `anchor-profile` (1.0 — identity
     declares the domains), `post` (1.0), `deck` (0.85), `project` (0.8).
   - Reinforce-only tier (may file into / strengthen existing topics,
     never mint): `link`, `note` (0.6).
   - Weights multiply the extracted relevance score; the tier controls
     mint rights. All weights are config; defaults above are starting
     intuitions to be **calibrated empirically** (decision 7 note: the
     operator wants experimentation, on yeehaa.io, before trusting
     numbers).
8. **Two-tier relevance cutoff.** Creating a new topic requires weighted
   relevance ≥ 0.7; filing into an existing topic requires ≥ 0.5. Both
   config, calibrated alongside the weights.

## Mechanics

- Distance source: merge candidacy uses `searchWithDistances`
  (types: [topic]) with the incoming title + content as query; threshold
  `semanticMergeDistance` (config, start 0.35 cosine, calibrated).
- Borderline band: candidates within +0.1 above the auto threshold go to
  the synthesizer with permission to answer "distinct" — the merge-synthesis
  template gains a distinct/merge verdict (today it always merges).
- Reinforce path: a reinforce-tier candidate that matches an existing topic
  takes the normal synthesize-merge path (enriching the topic); one that
  matches nothing is dropped, never minted.
- Ceiling: computed from the count of entities across the configured source
  types at extraction time.
- Reconciliation: per topic, nearest neighbor over topics via
  `searchWithDistances` (excluding self); pairs under threshold merge
  (canonical = older/richer), loop until stable, budgeted per run,
  deterministic ordering; emits the batch-completed event so the site
  rebuilds. Merging two saved topics = `applySynthesizedMerge` + deletion
  of the absorbed topic.

## Phases (thin slices, tests first)

1. **Semantic candidacy** — implemented. `findMergeCandidate` is distance-arbitrated, `semanticMergeDistance` is config, exact-title remains a fast path for in-batch writes, lexical scoring is retired, and the merge-synthesis template can return `merge` or `distinct`. Unit tests use live duplicate-style pairs with stubbed distances.
2. **Reconciliation** — implemented as a bounded pairwise semantic scan,
   internal `reconcile` projection job mode, and post-wave trigger. Existing
   duplicate topics merge through the same synthesizer; distinct verdicts,
   visibility partitions, and scan budgets are covered by tests.
3. **Mint economics** — source tiers, weights, two-tier cutoffs, soft
   ceiling; granularity contract in the extraction prompt. Extraction flow
   tests cover: reinforce-only sources never mint, ceiling forces
   merge-first, weighted cutoffs gate creation.
4. **Calibration on yeehaa.io** — run the derivation against the yeehaa.io
   corpus through the topics eval harness; tune weights, cutoffs, and
   `semanticMergeDistance`; lock the defaults from evidence.
5. **Ship + rebuild** — release train, deploy rizom-ai, run
   `rebuildAllTopics` then `topics:reconcile` on the live brain; verify the
   knowledge map's territories reflect the re-derived set.
