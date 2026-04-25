# Plan: Assessment package and SWOT capability profiles

Last updated: 2026-04-25

## Goal

Move SWOT out of `agent-discovery` and into a new assessment-oriented entity package.

SWOT analyzes a richer **capability profile** view instead of directly analyzing thin `skill` + `agent` lists. Capability profiles stay ephemeral for now; the stored output remains the derived `swot` artifact.

## Package boundary

```text
entities/agent-discovery
  owns agent contacts, remote agent-card ingestion, approval state, skill evidence

entities/assessment
  owns interpretation outputs, starting with SWOT
```

Boundary rule:

```text
agent-discovery = evidence source
assessment = interpretation consumer/output
```

`agent-discovery` must not import or depend on `assessment`.

## Core decisions

1. SWOT does **not** belong in `agent-discovery`.
2. Use `entities/assessment`, not `entities/swot`, because SWOT is a lens/output type, not the full package concept.
3. Keep `entityType: "swot"` for this pass.
4. Do **not** add durable `capability-profile` storage yet.
5. Do **not** create a generic analysis framework yet.

Runtime flow:

```text
identity/profile + local skills + saved agents
        ↓
CapabilityProfile[] built in memory by assessment
        ↓
SWOT context + prompts
        ↓
stored swot entity
```

## In scope

- Create `entities/assessment`.
- Move SWOT schema, adapter, derivation handler, widget, eval support, and tests there.
- Add `SwotAssessmentPlugin` and `swotAssessmentPlugin()`.
- Add package factory `assessment()` returning current assessment plugins.
- Add an internal `CapabilityProfile` model in `entities/assessment`.
- Build self profile from identity/profile plus local `skill` entities.
- Build network profiles from saved `agent` entities.
- Refactor SWOT context construction to consume profiles.
- Preserve existing durable `swot` entity shape.
- Register assessment as its own brain capability alongside `agents` where SWOT should exist.

## Out of scope

- New durable `capability-profile` entity type.
- Generic `analysis` plugin/framework.
- Historical profile snapshots.
- Direct SWOT ingestion of blog/product/wishlist/analytics entities.
- Public agent-card schema changes.
- Generic `assessment` entity shape.
- Making agent-discovery render or own SWOT UI.

## Capability profile model

Internal to `entities/assessment`:

```ts
interface CapabilityProfile {
  id: string;
  source: "self" | "agent";
  name: string;
  brainName?: string;
  kind?: "professional" | "team" | "collective";
  status?: "approved" | "discovered" | "archived";
  description?: string;
  notes?: string;
  skills: Array<{
    name: string;
    description: string;
    tags: string[];
    examples?: string[];
  }>;
}
```

This is the typed evidence contract for assessment, not user-facing storage.

## Profile builders

### Self profile

Use:

- `context.identity.get()` for brain name/role/purpose
- `context.identity.getProfile()` for anchor name/description
- local `skill` entities for capabilities
- skill `examples` when present

### Network profiles

Use each saved `agent` entity:

- frontmatter name, brain name, kind, status
- body `about`
- body `skills`
- body `notes`

Archived agents are excluded from SWOT for now.

## SWOT context refactor

Replace:

```text
agents + skills → SwotContext
```

with:

```text
selfProfile + networkProfiles → SwotContext
```

The deterministic context can still compute coverage/gap hints, but evidence cards should include richer profile evidence:

- self/profile description
- skill examples
- remote profile about text
- remote notes
- status/confidence

## Prompt update

- Treat self profile as the owner capability baseline.
- Treat approved agents as dependable network evidence.
- Treat discovered agents as tentative evidence.
- Use descriptions/examples/notes as grounding, not just names/tags.
- Avoid raw entity/internal language in final prose.
- Prefer capability-area conclusions over agent-name conclusions.

## Storage and freshness

No new profile storage.

The `swot` entity is rederived when relevant evidence changes:

- local `skill` changes
- saved `agent` changes
- initial sync completion when `swot` is missing

Identity/profile changes can be added as triggers later if/when those emit usable messages.

## Later promotion criteria

Only promote capability profiles to durable entities if at least one becomes true:

- multiple features need the same profile snapshot
- users need to inspect/edit profiles directly
- historical profile comparison is needed
- profile enrichment becomes expensive enough to cache
- profiles become a public/private artifact separate from agent cards

Only migrate from `swot` entity to a generic `assessment` entity if additional assessment types appear.
