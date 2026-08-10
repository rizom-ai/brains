# Plan: Configurable embedding provider

## Status

Not started. Requested 2026-08-10. Independent of the Turso migration, but it
inherits that plan's Phase 5C outcome: embeddings now live in `brain.db`, so a
dimension change is a content-database concern rather than a separate file that
could simply be deleted.

## Context

The embedding provider is effectively hardcoded today.

- `OnlineEmbeddingProvider` already accepts `model` and `dimensions`
  (`shell/ai-service/src/online-embedding-provider.ts`), defaulting to OpenAI's
  `text-embedding-3-small` at 1536 dimensions.
- `service-factory.ts` constructs it with only `apiKey` and `logger`, so neither
  knob reaches user configuration.
- `ShellConfig` has an `embedding` block (`model: "fast-all-MiniLM-L6-v2"`,
  `cacheDir`), but nothing reads it — it is a leftover from an abandoned local
  runtime and actively misleads, since it names a model the system never uses.

Two facts establish the real constraint, both verified against the engines
rather than assumed:

- The `F32_BLOB(1536)` in the schema is not enforced. SQLite treats it as a type
  name; a 768-dimension vector stores and computes `vector_distance_cos`
  correctly in that column on both libSQL and Turso. The column declaration is
  migration metadata, as `schema/vector.ts` documents.
- Every stored vector must share one dimension. Comparing mismatched vectors is
  a hard error on both engines (`vectors must have the same length: 1536 != 768`
  on libSQL, `Vectors must have the same dimensions` on Turso).

So the constraint is not "must be 1536" but "must match whatever the active
provider produces". Choosing a provider at initialization is therefore free;
changing one on a populated brain is the dangerous case, and it is currently
unguarded: `backfillMissingEmbeddings` only regenerates _missing_ rows, and
content hashes do not change when the provider does, so stale vectors of the
wrong dimension would survive and every search would fail.

## Design

### Phase 1 — Configure the provider at initialization

- Replace the dead `embedding` config block with a real one: provider selection
  (initially `openai`), `model`, and `dimensions`, with the current OpenAI
  values as defaults so existing brains are unaffected.
- Pass it through `service-factory.ts` into `OnlineEmbeddingProvider`. No change
  to the provider itself; it already takes both fields.
- Validate config coherence where the provider knows its own limits (an OpenAI
  model has a maximum dimension; reject impossible pairs at parse time rather
  than at first embedding call).
- Tests: a configured non-default dimension reaches the provider and round-trips
  a stored embedding of that size on both engines; defaults keep today's values.

**Exit:** a brain can be initialized against a non-default model and dimension
without code changes.

### Phase 2 — Guard dimension changes on a populated brain

The safety half, and the reason this is not a pure config change.

- Detect the stored dimension without adding persistent state:
  `SELECT length(embedding) / 4 FROM embeddings LIMIT 1` returns it on both
  engines (verified). An empty table means "no opinion yet".
- At startup, compare stored against configured dimensions. On mismatch, fail
  fast with an actionable error naming both values and the remedy. Never
  silently proceed — that yields a brain whose every search throws.
- Provide the remedy as an explicit command rather than an automatic wipe:
  clear `embeddings`, then let the existing startup backfill regenerate every
  embeddable entity with the new provider. This mirrors what the Phase 5C
  migration already does for the fold, and reuses `backfillMissingEmbeddings`
  as the repair path.
- Tests: mismatch refuses startup; the remedy clears and re-embeds; a matching
  configuration starts normally; an empty embeddings table adopts the
  configured dimension without complaint.

**Exit:** switching providers is a documented, single-command operation, and an
un-migrated mismatch cannot reach a query.

## Non-goals

- No local/offline embedding runtime. That is
  [`embedding-service.md`](./embedding-service.md); this plan only makes the
  existing online provider configurable.
- No per-entity-type or mixed-dimension storage. One brain, one dimension.
- No automatic re-embedding on config change — regeneration costs provider
  spend and must stay explicit.

## Risks

- A user changing `dimensions` in config and restarting expects it to work; the
  fail-fast error is the entire user experience of that moment, so it must name
  the stored value, the configured value, and the exact command to migrate.
- Re-embedding a large brain is billable work. The remedy command should report
  how many entities will be regenerated before doing it.
