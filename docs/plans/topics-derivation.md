# Topics Derivation

**Status:** Phases 1–3 implemented; Phase 4 calibration next

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
6. **A corpus-proportional soft ceiling.** Calibrated to
   `ceil(sourceEntities / 5)` clamped to [5, 24]. At or above the ceiling, extraction may not create:
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
- Corpus extraction batches are capped at four entities per AI call so full
  rebuilds do not compress the entire corpus into only 1-3 topics.
- Reconciliation: per topic, nearest neighbor over topics via
  `searchWithDistances` (excluding self); pairs under threshold merge
  (canonical = older/richer), loop until stable, budgeted per run,
  deterministic ordering; emits the batch-completed event so the site
  rebuilds. Merging two saved topics = `applySynthesizedMerge` + deletion
  of the absorbed topic.

## Corpus eval sufficiency

The pre-calibration eval suite was useful but not sufficient for the yeehaa.io
corpus. It covered generic extraction, human/agent collaboration grouping,
fragmentation grouping, low-quality content, and rebuild replacement, but it did
not exercise several corpus-specific failure modes found in live data:

- Existing duplicate topic files such as `e-waste` / `electronic-waste`.
- Near-duplicate corpus domains such as `distributed-collaboration` /
  `decentralized-collaboration`.
- Mint economics against the actual source mix, especially reinforce-only
  `link` sources.
- Full-corpus acceptance criteria for the expected canonical topic set.

This phase adds targeted corpus-derived evals for the first three gaps. A full
corpus rebuild/acceptance eval remains the calibration gate before shipping.

## Phases (thin slices, tests first)

1. **Semantic candidacy** — implemented. `findMergeCandidate` is distance-arbitrated, `semanticMergeDistance` is config, exact-title remains a fast path for in-batch writes, lexical scoring is retired, and the merge-synthesis template can return `merge` or `distinct`. Unit tests use live duplicate-style pairs with stubbed distances.
2. **Reconciliation** — implemented as a bounded pairwise semantic scan,
   internal `reconcile` projection job mode, and post-wave trigger. Existing
   duplicate topics merge through the same synthesizer; distinct verdicts,
   visibility partitions, and scan budgets are covered by tests.
3. **Mint economics** — implemented. Source weights, mintable source types,
   two-tier weighted relevance cutoffs, a corpus-proportional soft ceiling,
   and the extraction prompt granularity contract are in place. Tests cover
   reinforce-only sources never minting, reinforce-only sources merging,
   weighted creation cutoffs, and ceiling-forced merge-first behavior.
4. **Calibration on yeehaa.io** — complete. Added corpus-derived evals for
   electronic waste duplicate reconciliation, distributed/decentralized
   collaboration reconciliation, link reinforce-only mint prevention, and full
   corpus rebuild acceptance. Calibration found the original one-batch full
   corpus rebuild collapsed 50 sources into three topics, so extraction now
   caps AI batches at four entities and uses a softer `sourceEntities / 5`
   ceiling. The full corpus acceptance gate passes with bounded canonical
   coverage and no known duplicate/artifact topics.
5. **Ship + rebuild** — release train, deploy rizom-ai, run
   `rebuildAllTopics` then `topics:reconcile` on the live brain; verify the
   knowledge map's territories reflect the re-derived set.
