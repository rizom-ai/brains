# Plan: Plugin-Declared Skills for Agent Card

## Context

The A2A Agent Card currently maps every public tool 1:1 to a skill — producing low-level entries like `system_search`, `system_list` instead of meaningful capability descriptions. Skills should describe what the brain **knows about** (knowledge domains) combined with what it **can do** (capabilities), derived automatically from stored content.

## Design Decisions

1. **Skills are derived entities** — not hand-written, not configured. They emerge from content via embedding clustering.
2. **Knowledge-domain focused** — "Institutional Design", not "Blog Post Creation"
3. **Lives in the shell-level discovery concern** — rename `entities/agent-directory` → `entities/agent-discovery`, add a `SkillPlugin` alongside the existing `AgentPlugin` in the same package.
4. **Two EntityPlugins, one package** — the framework requires one entity type per EntityPlugin. The package exports both `agentPlugin()` and `skillPlugin()`.
5. **Agent Card queries skill entities at build time** — no AI call at startup, just a read.
6. **Embedding-based derivation, not AI** — entity embeddings from search indexing already encode what content is about. Cluster embeddings by similarity → each cluster = a skill domain. No LLM call needed, just vector math. Only use AI for naming/describing clusters from their member entities (titles, excerpts).

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

- **Triggered manually** via `system_extract skill` (v1), automatic on sync completion later
- **Embedding-based clustering**: queries all entity embeddings from the search index, clusters by cosine similarity
- **Cluster → skill mapping**: each cluster becomes a skill entity. Name and description are derived from member entity titles/excerpts (light AI call for labeling only, not content analysis)
- **Incremental on re-run**: compares new clusters against existing skill entities, creates/updates/removes as needed
- **No expensive AI scanning** — embeddings are already computed by search indexing, clustering is pure vector math

### Agent Card Integration

The A2A interface's `buildAgentCard()` queries skill entities instead of mapping tools:

1. `rebuildAgentCard()` queries `entityService.listEntities("skill")`
2. Maps skill entities → `AgentSkill[]` (id, name, description, tags, examples)
3. Falls back to current tool mapping if no skill entities exist (backward compat during rollout)

## Implementation Steps

### Step 1: Rename package

- Rename `entities/agent-directory/` → `entities/agent-discovery/`
- Update package name `@brains/agent-directory` → `@brains/agent-discovery`
- Update all imports across the codebase
- Rename `plugins/agent-directory/` → `plugins/agent-discovery/` (service plugin)

### Step 2: Skill entity type

- `entities/agent-discovery/src/schemas/skill.ts` — schema
- `entities/agent-discovery/src/adapters/skill-adapter.ts` — adapter
- `entities/agent-discovery/src/plugins/skill-plugin.ts` — EntityPlugin with derive()
- Tests for adapter and schema

### Step 3: Skill derivation via embedding clustering

- `entities/agent-discovery/src/lib/skill-clusterer.ts` — fetch embeddings, cluster by cosine similarity, map clusters to skill candidates
- `entities/agent-discovery/src/templates/skill-labeling-template.ts` — light AI prompt: given a cluster of entity titles/excerpts, produce a skill name + description + tags
- `entities/agent-discovery/src/plugins/skill-plugin.ts` — `deriveAll()` implementation (no per-entity `derive()`)
- Manual trigger only (v1): `system_extract skill` runs the full pipeline
- Tests for clustering logic and label generation

### Step 4: Agent Card integration

- Update `interfaces/a2a/src/agent-card.ts` — `buildAgentCard()` accepts skill entities
- Update `interfaces/a2a/src/a2a-interface.ts` — query skill entities in `rebuildAgentCard()`
- Keep tool-based fallback for brains without skill entities
- Tests for card generation with skills

### Step 5: Registration

- Update `entities/agent-discovery/src/index.ts` — export both `agentPlugin` and `skillPlugin`
- Update rover brain definition to register both plugins
- Verify Agent Card serves derived skills

## Files Affected

| Step | Files | Nature                                                     |
| ---- | ----- | ---------------------------------------------------------- |
| 1    | ~20+  | Rename package, update imports                             |
| 2    | ~4    | New schema, adapter, plugin class, tests                   |
| 3    | ~4    | Embedding clusterer, labeling template, deriveAll(), tests |
| 4    | ~3    | Agent card builder, A2A interface, tests                   |
| 5    | ~3    | Index exports, rover registration                          |

## Key Files to Modify

- `entities/agent-discovery/src/plugins/skill-plugin.ts` (new)
- `entities/agent-discovery/src/schemas/skill.ts` (new)
- `entities/agent-discovery/src/adapters/skill-adapter.ts` (new)
- `entities/agent-discovery/src/lib/skill-clusterer.ts` (new)
- `entities/agent-discovery/src/templates/skill-labeling-template.ts` (new)
- `interfaces/a2a/src/agent-card.ts` — consume skill entities
- `interfaces/a2a/src/a2a-interface.ts` — query skill entities
- `brains/rover/src/index.ts` — register skill plugin

## Verification

1. `bun run typecheck` / `bun test` after each step
2. After step 2: `system_list skill` returns empty, `system_create skill` works
3. After step 3: `system_extract skill` clusters embeddings → creates skill entities with meaningful names
4. After step 4: `GET /.well-known/agent-card.json` shows domain-based skills instead of tool names
5. After step 5: Full integration — `system_extract skill` → Agent Card update

## Future Enhancements

- **Auto-trigger on sync completion** — run `deriveAll()` after `sync:completed` events
- **Incremental clustering** — only re-cluster changed embeddings, diff against existing skills
- **Skill confidence scores** — weight by cluster density (tight cluster = strong skill, loose = weak)
