# Plan: Topics & Skills — Content-Derived Knowledge

## Context

Two related problems:

1. **Topics are too expensive.** The topics plugin makes 1 LLM call per entity. On a cold start or `deriveAll()`, 100 entities = 100 LLM calls. The per-entity quality is good, but the batch cost is unsustainable.

2. **Agent Card skills are meaningless.** The A2A Agent Card maps every public tool to a skill — `system_search`, `system_list` — instead of describing what the brain actually knows about.

These are the same problem at different levels of abstraction:

- **Topics** = what the brain knows about (content-level, per-entity)
- **Skills** = what the brain can do (brain-level, derived from topics + tools)

Skills should be derived from topics. Topics need to be cheaper to produce.

## Design

### Two-tier derivation

```
Entities → Topics → Skills → Agent Card
```

**Topics** are derived from entity content. They represent knowledge domains with nuance — "Institutional Design", "Token Engineering", "Urban Data Governance". Each entity maps to 1-3 topics based on what it actually discusses.

**Skills** are derived from topics + tools. One LLM call reads topic titles and registered tools, produces action-oriented descriptions — "Can write essays and newsletters about institutional design patterns". Skills are what the Agent Card advertises.

### Topics: two paths

**`derive(entity)` — single entity, on create/update:**

- One LLM call per entity (same as today)
- Sends full entity content
- Returns 1-3 topics with title, description, keywords
- Creates new topic entities or skips if topic already exists (by slug)
- This is the quality path — runs infrequently (one post at a time)

**`deriveAll()` — batch, on cold start / re-derive:**

- Groups entities into batches (10-20 per batch, bounded by context window)
- One LLM call per batch, not per entity
- Prompt includes all entities in the batch, asks for topics from each
- LLM naturally deduplicates across entities in the same batch
- Cross-batch dedup by slug (same as single-entity path)
- 100 entities ≈ 5-7 LLM calls instead of 100

### Topics: simplified entity model

Current topics track a `sources` list — which entities contributed, their content hashes, slugs. This drives complex merge logic and prevents simple re-derivation. Remove it.

A topic is: **title, description, keywords.** That's it. No source tracking, no merge logic, no contentHash bookkeeping. A topic exists because the brain has content about it.

- Topic ID = slug from title (stable, deterministic)
- `deriveAll()` produces topics. If a topic with that slug exists, leave it (user may have edited). If it's new, create it.
- No orphan cleanup needed — topics without matching content are still valid knowledge domains
- User-edited topic descriptions are preserved across re-derivation

### Skills: derived from topics

**`deriveAll()` — one LLM call:**

- Reads all topic entity titles + registered brain tools
- Produces 3-12 skills with name, description, tags, examples
- Replace-all strategy (skills are not user-edited — they're machine-generated for the Agent Card)
- Falls back to tool mapping if no topics exist

**No per-entity `derive()`** — skills are cross-cutting, not per-entity.

**Trigger:** manual via `system_extract skill` (v1), auto after topic derivation later.

### Skills require topics

Skills without topics would fall back to the title-only approach — which produces worse results because titles lack context. Topics provide the abstracted knowledge domains that make skills meaningful.

This means topics must be in all presets, including `core`. For small brains, the cost is negligible (few entities = few LLM calls). The batch cost problem only hits at scale, which is exactly what the batched `deriveAll()` solves.

## Prompt Design

### Topic extraction (batched)

```
Extract topics from each piece of content below.

---
[1] Post: Institutional Design Patterns for DAOs

{full content}

---
[2] Post: Token Engineering: A Practical Guide

{full content}

---

For each piece, extract the 1-3 most important topics.
Each topic needs: title (single concept, max 40 chars),
description (1-2 paragraphs), keywords (5-12), relevanceScore (0-1).

If multiple pieces discuss the same topic, return it once.
```

### Skill derivation (from topics)

```
You are analyzing a brain's content to identify its capabilities.

The brain's knowledge domains (from content analysis):
- Institutional Design
- Token Engineering
- Urban Data Governance
- Event Sourcing
- ...

The brain has these capabilities:
- Create and publish blog posts
- Generate social media content
- Build and deploy a website
- ...

Identify the brain's distinct skills. For each skill, write an
action-oriented description combining what the brain knows with
what it can do. Return 3-12 skills with: name, description, tags, examples.
```

## Implementation

### Phase 1: Simplify topic entity model

Remove source tracking in 6 sub-steps. Each is one commit, tests updated alongside.

**1a: Schema + adapter.** Remove `sources` from schema and frontmatter. Drop `## Sources` body section from adapter. Make adapter ignore `sources` in old entities on read (`.strip()` or just omit from schema — Zod drops unknown fields by default). This is the core change with the backward compat concern.

**1b: Topic service.** Remove merge logic, source deduplication, `allSources` collection from `TopicService`. Simplify `createOrUpdateTopic` and `mergeSimilarTopics`.

**1c: Extractor + handler.** Remove `sources` from `ExtractedTopic` type and extraction output schema. Update `TopicProcessingHandler` to stop passing sources.

**1d: Datasource + templates + insights.** Remove `sourceCount` from datasource, `sources` from topic-detail template schema, source-based distribution from insights. Related entities on topic pages can use search queries later (separate work).

**1e: Plugin index.** Remove `getEntitiesToExtract` contentHash tracking from `entities/topics/src/index.ts`.

**1f: Add topics to core preset.** Update rover brain definition to include `topics` in the `core` preset. Skills depend on topics existing. For small brains the cost is negligible.

### Phase 2: Batch `deriveAll()`

**New batched extraction:**

- `entities/topics/src/lib/topic-batch-extractor.ts` — batches entities, one LLM call per batch
- `entities/topics/src/lib/batch-entities.ts` — token-budget-aware batch splitting (chars/4 estimate, 108K token budget for 128K context models)
- `entities/topics/src/templates/extraction-template.ts` — update prompt for multi-entity input
- `entities/topics/src/index.ts` — rewrite `deriveAll()` to use batch extractor
- Topic creation: create by slug, skip if exists
- Default batch size: 30 entities (safe for 128K context, ~45K tokens at 1,500 avg tokens/entity)

**Keep single-entity `derive()` unchanged** — it's already one LLM call and that's fine for the incremental path.

**Initial sync trigger:** On `sync:initial:completed`, run `deriveAll()` instead of just enabling auto-extraction. New brains get batch topic extraction (few LLM calls) instead of N individual `derive()` calls as entities trickle in. After initial derivation, auto-extraction handles incremental updates via per-entity `derive()`.

**Verification:** unit tests for batch splitting + eval test that a 30-entity batch produces meaningful topics.

### Phase 3: Skill derivation pipeline

**Already scaffolded** (schema, adapter, plugin exist in `entities/agent-discovery/`):

- `entities/agent-discovery/src/lib/skill-deriver.ts` — collect topic titles + tools, one LLM call, create skill entities
- `entities/agent-discovery/src/templates/skill-labeling-template.ts` — prompt template
- `entities/agent-discovery/src/plugins/skill-plugin.ts` — wire `deriveAll()`, replace-all strategy
- Manual trigger: `system_extract skill`

### Phase 4: Agent Card integration

- `interfaces/a2a/src/agent-card.ts` — `buildAgentCard()` accepts skill entities
- `interfaces/a2a/src/a2a-interface.ts` — query skill entities in `rebuildAgentCard()`
- Keep tool-based fallback for brains without skills/topics

## Cost Comparison

| Scenario                                   | Current       | After                             |
| ------------------------------------------ | ------------- | --------------------------------- |
| Single entity create                       | 1 LLM call    | 1 LLM call (same)                 |
| `deriveAll()` on 100 entities              | 100 LLM calls | 5-7 LLM calls (batched)           |
| New brain initial sync (50 entities)       | 50 LLM calls  | 2-3 LLM calls (batched deriveAll) |
| Skill derivation                           | N/A           | 1 LLM call (reads topic titles)   |
| Total for full re-derive (topics + skills) | 100 LLM calls | 6-8 LLM calls                     |

## What Changes

- Topic entities lose `sources` metadata — simpler, no merge logic
- `deriveAll()` batches entities into multi-entity LLM calls
- User-edited topics preserved across re-derivation (matched by slug)
- Skills derived from topics, not from raw entities
- Agent Card serves skills instead of tool names

## What Doesn't Change

- Per-entity `derive()` (one LLM call, same quality)
- Topic entity type, templates, datasources, site rendering
- Topic schema (title, description, keywords — just no sources)
- Auto-extraction on incremental entity changes (entity:created/updated events)
- Topic insights (topic-distribution)

## What Changes for Startup

- Initial sync now triggers batch `deriveAll()` instead of individual `derive()` per entity
- New brains: topics derived in 2-3 LLM calls instead of 50-100
- Existing brains: `deriveAll()` on first boot with new code creates topics for any unprocessed entities, skips existing by slug

## Files Affected

| Phase | Files | Nature                                                                 |
| ----- | ----- | ---------------------------------------------------------------------- |
| 1     | ~5    | Remove source tracking from schemas, service, adapter, handler, plugin |
| 2     | ~3    | Batch extractor, updated template, rewritten deriveAll()               |
| 3     | ~4    | Skill deriver, prompt template, deriveAll() wiring, tests              |
| 4     | ~3    | Agent card builder, A2A interface, tests                               |

## Verification

1. `bun run typecheck` / `bun test` after each phase
2. Phase 1: existing topics still render, sources section gone
3. Phase 2: `system_extract topic` on 100 entities completes in 5-7 LLM calls
4. Phase 3: `system_extract skill` creates meaningful skill entities
5. Phase 4: Agent Card shows domain-based skills
6. Per-entity `derive()` on new post still works (one LLM call, creates topic)
