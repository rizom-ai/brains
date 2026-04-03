# Plan: Plugin-Declared Skills for Agent Card

## Context

The A2A Agent Card currently maps every public tool 1:1 to a skill — producing low-level entries like `system_search`, `system_list` instead of meaningful capability descriptions. Skills should describe what the brain **knows about** (knowledge domains) combined with what it **can do** (capabilities), derived automatically from stored content.

## Design Decisions

1. **Skills are derived entities** — not hand-written, not configured. They emerge from content via LLM analysis of entity titles and types.
2. **Knowledge-domain focused** — "Institutional Design", not "Blog Post Creation"
3. **Lives in `entities/agent-discovery`** — alongside the existing `AgentPlugin` in the same package.
4. **Two EntityPlugins, one package** — the framework requires one entity type per EntityPlugin. The package exports both `agentDiscoveryPlugin()` and `skillPlugin()`.
5. **Agent Card queries skill entities at build time** — no AI call at startup, just a read.
6. **Title-based derivation, one LLM call** — list all entity titles + types, ask the LLM to identify knowledge domains and write action-oriented skill descriptions. No embeddings, no clustering, no vector math. The LLM is better at abstraction than k-means on high-dimensional embeddings.
7. **One entity per skill, no forced count** — skills are individual entities (searchable, editable, linkable). Let the data decide how many. On each `deriveAll()`, delete all existing skills and replace with the new set — no diffing, no orphan cleanup needed.
8. **Knowledge × Capability = Skill** — a domain alone is "Institutional Design". Combined with brain tools, it becomes a skill ("Can write essays and newsletters about institutional design patterns"). The prompt receives entity titles + registered tools.
9. **Exclude by default: images, prompts, links, skills** — configurable via `excludeTypes`. All other entity types contribute to skill derivation.

## Why Not Embedding Clustering

The original plan proposed k-means clustering on entity embeddings. This was rejected:

- **K-means is wrong for skills.** MiniLM embeddings cluster by semantic similarity, but skills are higher-level abstractions. "TypeScript" and "React" are distant in embedding space but form one skill ("Web Development"). The LLM handles this abstraction naturally.
- **Forced cluster counts are arbitrary.** Min 3 / max 7 produces garbage skills for small brains and caps real diversity for large ones.
- **Custom math is a lot to own.** K-means, silhouette scores, cosine distance — ~200+ lines with edge cases, for what turns out to be the wrong algorithm.
- **Embedding dependency.** Skills would fail if search indexing hasn't completed. Title-based approach has no such dependency.
- **Still needs AI.** The clustering plan required 3-7 LLM calls for labeling anyway. The title-based approach uses one call and produces better results.

## Skill Entity Design

### Schema

```typescript
const skillFrontmatterSchema = z.object({
  name: z.string(), // "Institutional Design"
  description: z.string(), // What the brain can do in this domain
  tags: z.array(z.string()), // Searchable keywords
  examples: z.array(z.string()), // Example prompts/scenarios
});

const skillMetadataSchema = skillFrontmatterSchema.pick({
  name: true,
});

const skillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: skillMetadataSchema,
});
```

### Derivation

`SkillPlugin` implements `deriveAll()` (no per-entity `derive()` — skills are cross-cutting):

1. **Collect entity titles + types** — `entityService.listEntities()` for each registered type (excluding `excludeTypes`). Extract title and entityType from each.
2. **Collect registered tools** — `mcpService.getTools()` to get the brain's capabilities.
3. **One LLM call** — prompt receives:
   - List of entity titles grouped by type (e.g. "Posts: Institutional Design Patterns, DAOs and Governance, Token Engineering Basics")
   - List of tool capabilities (e.g. "Can create blog posts, generate social media, build website")
   - Instruction: identify the brain's knowledge domains, write an action-oriented skill for each
4. **Parse structured output** — LLM returns array of `{ name, description, tags, examples }` via `generateObject`
5. **Replace-all** — delete all existing skill entities, create new ones from LLM output.

### Prompt Design

```
You are analyzing a brain's content to identify its knowledge domains.

The brain manages these entities:

Posts (12):
- Institutional Design Patterns for DAOs
- Token Engineering: A Practical Guide
- ...

Projects (3):
- Governance Dashboard
- ...

The brain has these capabilities:
- Create and publish blog posts
- Generate social media content
- Build and deploy a website
- ...

Identify the brain's distinct knowledge domains. For each domain,
write an action-oriented skill description that combines what the
brain knows with what it can do.

Return 3-12 skills. Each skill needs: name, description (one sentence,
action-oriented), tags (3-5 keywords), examples (2-3 example prompts
a user might send).
```

### Agent Card Integration

The A2A interface's `buildAgentCard()` queries skill entities instead of mapping tools:

1. `rebuildAgentCard()` queries `entityService.listEntities("skill")`
2. Maps skill entities → `AgentSkill[]` (id, name, description, tags, examples)
3. Falls back to current tool mapping if no skill entities exist (backward compat)

## Implementation Steps

### Step 1: Rename package ✅

Already done — `entities/agent-discovery`, `@brains/agent-discovery`.

### Step 2: Skill entity type ✅

Schema, adapter, plugin, tests all exist.

### Step 3: Skill derivation pipeline

- `entities/agent-discovery/src/lib/skill-deriver.ts` — orchestrates: collect titles → collect tools → LLM call → create skill entities
- `entities/agent-discovery/src/templates/skill-labeling-template.ts` — prompt template for the LLM call
- `entities/agent-discovery/src/plugins/skill-plugin.ts` — add `deriveAll()` wiring the pipeline, replace-all strategy
- Manual trigger only (v1): `system_extract skill` runs the full pipeline
- Default `excludeTypes`: `["image", "prompt", "link", "skill"]`
- Tests for derivation pipeline (mock AI, verify entity creation)

### Step 4: Agent Card integration

- Update `interfaces/a2a/src/agent-card.ts` — `buildAgentCard()` accepts skill entities
- Update `interfaces/a2a/src/a2a-interface.ts` — query skill entities in `rebuildAgentCard()`
- Keep tool-based fallback for brains without skill entities
- Tests for card generation with skills

### Step 5: Registration ✅

Rover already registers both `agentDiscoveryPlugin` and `skillPlugin`.

## Files Affected

| Step | Files | Nature                                             |
| ---- | ----- | -------------------------------------------------- |
| 3    | ~4    | Skill deriver, prompt template, deriveAll(), tests |
| 4    | ~3    | Agent card builder, A2A interface, tests           |

## Verification

1. `bun run typecheck` / `bun test` after each step
2. `system_extract skill` → creates skill entities with meaningful domain names
3. `system_list skill` → shows derived skills
4. `GET /.well-known/agent-card.json` → shows domain-based skills instead of tool names
5. Brains without skills → Agent Card falls back to tool mapping

## Future Enhancements

- **Auto-trigger on sync completion** — run `deriveAll()` after `sync:completed` events
- **Source linking** — attach source entity references to each skill (which posts/projects contributed)
- **Incremental updates** — diff new skills against existing, only replace if domains changed
