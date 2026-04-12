# Plan: Topic Auto-Merge Cleanup

## Open work

Remaining work here is cleanup around evaluation coverage and stale schema surface.

### 1. Eval parity

`checkMergeSimilarity` in `entities/topics/src/index.ts` still uses a simplified title-match eval path instead of exercising the real merge-candidate detection path.

Desired outcome:

- evals cover the same decision path the runtime uses
- gray-zone and no-merge cases stay explicit
- runtime and eval behavior stop drifting

### 2. Remove or wire dead schema surface

`topicMergeJobDataSchema` still exists in `entities/topics/src/schemas/topic.ts`.

Decide one:

- remove it if no real job path uses it
- wire it into a real maintenance merge job if that path still matters

### 3. Keep docs/examples aligned

User-facing docs should describe the current bounded-alias merge model, not older future-tense design text.

## Non-goals

- redesigning topic ontology
- large backfill or migration work without an operator need
- expanding alias metadata beyond what canonicalization/search needs

## Done when

1. eval coverage uses the real merge-candidate path
2. `topicMergeJobDataSchema` is either removed or used by a real path
3. docs/examples no longer describe topic auto-merge as future work
