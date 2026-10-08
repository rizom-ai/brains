# Plan: Topics ranked under the cap

## Status

Implemented in `work/topics-ranked-selection`; release, cohort bump, and verification on `friedrich` remain pending.

## Problem

Verified against the code on main:

1. **One wave is one job.** `deriveTopicIntents` (`entities/topics/src/lib/topic-wave-rule.ts`) reads every eligible source, four per `ai.generate` call, inside one projection-rule job. The wave scheduler (`shell/core/src/projection-wave-scheduler.ts`) runs one rule job per wave over all pending dirty inputs and fails the wave as a whole. The worker's execution deadline is 300 seconds (`shell/job-queue/src/job-queue-worker.ts`). `friedrich` (3,738 sources, about 935 calls at about 9 seconds each) made 33 calls before the deadline; the job was retried from the start.
2. **The job cannot be cancelled.** `IEntityAINamespace.generate` (`shell/plugins/src/entity/ai-types.ts`) takes no abort signal, so a job past its deadline ignores the cancellation grace and the worker process is restarted.
3. **The cap freezes the topic set.** A new topic is minted only while existing topics plus topics found in the wave stay below `topicSoftCeiling` = `min(24, max(5, ceil(sources / 5)))`. Nothing removes topics, so once a brain has as many topics as its cap it never gets another. Which topics fill the cap depends on source order.
4. **One change re-reads everything.** The rule's memo is keyed on the whole input, so one edited source re-extracts the corpus.

## Goal

A brain's topics are the best-supported subjects across all of its content, at most the cap. A better-supported subject replaces the weakest topic. Each job is bounded well below the deadline and survives restarts; after the first pass only changed sources cost an AI call.

## Design

1. **Votes per source.** A `topics:extract` job reads up to four sources per AI call. The prompt lists the current topics and the leading challengers by title (each list at most the cap). For each source the AI returns the listed titles the source supports, with relevance, and at most one new title with a one-paragraph description when nothing listed fits. Votes below `minRelevanceScore` are dropped.
2. **Vote store.** Votes live in the runtime-state namespace `topics.votes`, keyed `<entityType>:<id>`, with the source's `contentHash`, its supported slugs with relevance, and its proposal. One row per eligible source; topic content is never touched by extraction.
3. **Bounded, resumable jobs.** A job takes the eligible sources whose stored vote is missing or has a different `contentHash`, drops votes of sources that no longer exist or are no longer eligible, makes at most 10 AI calls (about 90 seconds), stores the votes, runs selection, and enqueues the next job (deduplicated) while stale sources remain. Eligibility is unchanged: include and exclude types, `extractionVisibility`, `extractableStatuses`, source-role policy. Every AI call receives the job's abort signal. Jobs scan sources by page and keep only keys and hashes; full content is loaded for the sources in a prompt. A source whose call fails or goes unanswered is retried alone; after three failures, counted only in jobs where the provider answered a call, it receives an empty vote until its content changes.
4. **Tally.** Selection reads all votes and computes each slug's support: the sum over voting sources of role weight × relevance, for supported titles and proposals alike. Computing from the votes keeps the tally exact with no counters to drift; it reads one row per source and makes no AI call.
5. **Selection.** The cap is `topicSoftCeiling` over the full eligible-source count.
   - Below the cap, the best-supported challenger whose relevance clears `createRelevanceThreshold` becomes a topic.
   - At the cap, the best-supported challenger replaces the weakest topic when its support exceeds the weakest topic's by more than 25%. The margin keeps near-equal topics from swapping on small edits. Replacement waits until every eligible source has been read once.
   - Selection repeats until no challenger qualifies.
   - An entering topic's description is written by one AI call from the proposals that support it. A replaced topic is deleted; its site page and ATProto record follow the existing deletion paths.
   - Topic ids stay `scopedDerivedId(generateIdFromText(title), visibility)`, so a topic keeps its id and URL while it stays in the set.
6. **Triggers.** Entity created, updated and deleted events for eligible types enqueue `topics:extract` (ordinary subscriptions in the web process, `subscribeExecution` in the worker, where imports run), and so does `SYSTEM_CHANNELS.startupContentSettled`. A missed event heals itself: every job scans for stale votes, and every boot triggers one.
7. **The topics projection rule is removed.** `topic-wave-rule.ts` and its registration go; ownership of existing topic entities is released (`releaseProjectionOwnership`) so nothing treats them as orphans. The topics ATProto projection, whose source is the topic entity type, is unchanged.

## Cost

| Step                    | 30-source brain                  | 10,000-source brain                                     |
| ----------------------- | -------------------------------- | ------------------------------------------------------- |
| First pass (extraction) | 8 AI calls, 1 job                | 2,500 AI calls in 250 jobs, about 6 hours on one worker |
| After an edit           | 1 AI call                        | 1 AI call                                               |
| Tally per job           | 30 rows read                     | 10,000 rows read, no AI                                 |
| Selection per job       | sort of at most 60 slugs         | sort of all proposed slugs, no AI                       |
| Entering topic          | 1 AI call                        | 1 AI call                                               |
| Prompt size             | at most 48 titles plus 4 sources | at most 48 titles plus 4 sources                        |

Existing topics start without votes. Replacement waits for the first full pass, which gives them real support; below the cap, challengers enter as soon as they qualify.

## Trade-off

Sources read early saw an earlier list, so they cannot vote for a challenger that appeared later; tallies are order-dependent at the margins. Every source can propose a title, so a recurring subject accumulates support from its first appearance and the strongest subjects still win. Re-reading a sample of earlier sources after a swap would remove the residue; it is not part of this plan.

## Phases

### Phase 1 — jobs stop killing the worker

- tests first: `generate` forwards an abort signal to the content service; the topic wave rule passes its signal and stops at the deadline without a worker restart
- add `signal` to `IEntityAINamespace.generate` and thread it to the content service, which already accepts one
- release; bump the `books` cohort; `friedrich`'s worker stays up

### Phase 2 — ranked topics with replacement

- tests first: a job extracts at most 10 calls of stale sources and re-enqueues while stale remain; an unchanged source is not re-read; a deleted source's votes are dropped; the tally sums role weight × relevance; below the cap the best challenger enters; at the cap a challenger replaces the weakest topic only past the 25% margin; a replaced topic is deleted; existing topic ids are kept; events and `startupContentSettled` enqueue one deduplicated job; removing the rule leaves existing topics in place
- implementation as above; the projection rule and its tests are removed
- local verification on `friedrich`'s corpus: the first pass completes across jobs with the worker up, the topics span the books, an edit re-reads one source
- release; bump the `books` cohort; redeploy `friedrich`; verify the topics and theme pages

## Implementation review

- `SYSTEM_CHANNELS.startupContentSettled` is emitted by the shell once the queued initial import settles; extraction subscribes to it.
- Ownership release existed only on the internal projection store. Added a narrow entity-service method and release old topic ownership across all visibility partitions before orphan reconciliation, once per brain, recorded in runtime state.
- Pending-job deduplication permits a successor while a job is processing. A runtime-state lease serializes overlapping extraction attempts and permits recovery after a worker dies.
- Extraction jobs start independent maintenance roots. An event from a supporting projection (such as a series) must not make the whole resumable corpus scan inherit that unrelated projection's 32-job causal budget.
- The ten-call budget includes description synthesis, not only extraction, so selection cannot turn a bounded extraction job into another deadline failure. Pending selection continues in a successor.
- Descriptions use at most eight strongest proposals, each bounded to 2,000 characters. Eligibility and evidence are rechecked after generation before topic writes, including visibility changes during the AI call.
- `subscribeExecution` runs once in both web and worker processes, so a second ordinary subscription would only duplicate enqueue requests.
- Validation is provider-free and local. The production corpus, release, books cohort bump, redeployment, and live site/ATProto deletion paths have not been verified here.

## Decisions

- **Votes in runtime state, not entities.** Votes are derived working data: they must not be embedded, exported to the content repo or published.
- **Tally from votes, not counters.** One read per source per job is cheap and cannot drift.
- **Extraction outside the projection framework.** A wave is one job over all dirty inputs and plugins cannot mark a projection dirty; per-source work does not fit it.
- **25% replacement margin.** Large enough that ties do not flap, small enough that a clearly stronger subject gets in.
