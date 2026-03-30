# Plan: Agent Directory

## Context

A2A lets brains talk to each other, but there's no discovery or contact management. You need to know an agent's URL upfront, and tokens are hardcoded in brain.yaml.

A2A authentication Phase 1 (bearer tokens) is complete. This plan builds the **next layer**: manage known agents as entities, and discover new agents via AT Protocol.

## Discovery: AT Protocol vs manual

Two discovery mechanisms, layered:

| Mechanism                 | How                                                                                                                            | When                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **AT Protocol (passive)** | Brains publish `io.rizom.brain.card` records. Subscribe to Jetstream, filter for brain cards. New brains appear automatically. | Default — always running if atproto plugin is active |
| **Manual (active)**       | User provides a URL. Brain fetches Agent Card and creates a local contact.                                                     | Fallback — for agents not on AT Protocol             |

AT Protocol replaces the Agent Card fetch (`/.well-known/agent-card.json`) for identity and capabilities. Brain cards are signed by the brain's DID, so authenticity is guaranteed. If the agent moves servers, its DID document updates automatically — no stale URLs.

## What AT Protocol covers and what it doesn't

| Need                                           | AT Protocol                                 | Local entity |
| ---------------------------------------------- | ------------------------------------------- | ------------ |
| Discovery (finding agents)                     | Yes — firehose subscription                 | No           |
| Capabilities (what can it do)                  | Yes — signed brain card record              | No           |
| Identity verification                          | Yes — DID signatures                        | No           |
| Name → URL resolution                          | Yes — DID document → service endpoint       | No           |
| Trust status (testing/trusted/archived)        | No                                          | Yes          |
| Outbound tokens                                | No (DID-based auth could replace long-term) | Yes          |
| Relationship metadata (notes, when discovered) | No                                          | Yes          |

**AT Protocol is the discovery and resolution layer. The local entity is the relationship layer.**

## Design

### Entity type: `agent`

An EntityPlugin in `entities/agent/`. Stores the local relationship with a known agent. Discovery data comes from AT Protocol or Agent Card fetch, trust/token data is local.

```yaml
---
name: Yeehaa
did: "did:web:yeehaa.io"
url: https://yeehaa.io
status: trusted # testing | trusted | archived
organization: Rizom
description: Personal knowledge brain for Yeehaa
discoveredAt: "2026-03-22T00:00:00.000Z"
discoveredVia: manual # atproto | manual
skills:
  - id: content-creation
    name: Content Creation
    description: Create blog posts, social media posts, newsletters, presentations, and notes
    tags: [blog, social-media, newsletter, content, writing]
  - id: knowledge-search
    name: Knowledge Search
    description: Search and retrieve from a personal knowledge base
    tags: [search, knowledge, notes, links]
  - id: site-publishing
    name: Site Publishing
    description: Build and publish static sites with blog, portfolio, and custom pages
    tags: [site, publishing, blog, portfolio]
---
Professional brain managing essays, presentations, and portfolio projects.
```

### Design decisions

**Entity ID is the domain** — e.g., `yeehaa.io`, `mylittlephoney.com`. Domains are naturally unique. `findEntityByIdentifier` resolves by name/title as a fallback.

**Outbound tokens stay in brain.yaml** — not in entity frontmatter. Agent entities describe who you know; brain.yaml describes how you authenticate. Tokens are secrets — they belong in config alongside other secrets, not in content files that get committed to git. The A2A client checks both: entity for URL resolution, brain.yaml for the token (keyed by domain).

**Skills are semantic capabilities, not tool names** — following the A2A spec's `AgentSkill` format. Each skill has an `id`, `name`, `description`, and `tags`. Populated from the Agent Card on discovery. This is what the agent was built to do (e.g., "content creation"), not which internal tools it uses (e.g., `system_create`). Skills enable capability-based routing ("find me a brain that can generate images") without coupling to tool implementations.

**ServicePlugin with custom tools, not generation handler** — `system_create` with a generation handler is the wrong pattern for fetching an Agent Card. That's not AI generation — it's a deterministic HTTP fetch. Instead, the agent directory is a ServicePlugin with:

- `agent_add { url: "yeehaa.io" }` — fetches Agent Card, creates entity
- `agent_trust { agent: "yeehaa.io" }` — sets status to trusted
- `agent_remove { agent: "yeehaa.io" }` — archives or deletes

Standard entity CRUD (`system_list`, `system_get`) still works for reading agents.

**`a2a_call` auto-creates on first contact** — if you call an unknown agent by URL, the A2A client creates a directory entry with `status: testing` after the call succeeds. The agent is no longer forgotten — it's in the directory for future reference.

**`derive()` reserved for Phase 2** — when AT Protocol discovery is active, the agent plugin's `derive()` watches for ingested `io.rizom.brain.card` records and creates/updates agent entities with `discoveredVia: atproto`.

### Entity schema

```typescript
const agentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
});

const agentFrontmatterSchema = z.object({
  name: z.string(),
  did: z.string().optional(),
  url: z.string().url(),
  status: z.enum(["testing", "trusted", "archived"]).default("testing"),
  organization: z.string().optional(),
  description: z.string().optional(),
  discoveredAt: z.string().datetime(),
  discoveredVia: z.enum(["atproto", "manual"]).default("manual"),
  skills: z.array(agentSkillSchema).default([]),
});
```

### Skills: auto-generated from plugins

Skills are not manually declared — they're derived from registered plugins. Each EntityPlugin and ServicePlugin declares what capability it contributes:

```typescript
// entities/blog/src/plugin.ts
export class BlogPlugin extends EntityPlugin<Post> {
  readonly skills: AgentSkill[] = [
    {
      id: "blog-writing",
      name: "Blog Writing",
      description: "Create and manage blog posts and essays with AI generation",
      tags: ["blog", "writing", "essays", "content"],
      examples: ["Write a blog post about ecosystem architecture"],
    },
  ];
}

// plugins/site-builder/src/plugin.ts
export class SiteBuilderPlugin extends ServicePlugin {
  readonly skills: AgentSkill[] = [
    {
      id: "site-publishing",
      name: "Site Publishing",
      description:
        "Build and publish static sites with blog, portfolio, and custom pages",
      tags: ["site", "publishing", "web", "static"],
    },
  ];
}
```

InterfacePlugins don't declare skills — they're transport, not capability.

The shell collects all plugin skills at registration time. The Agent Card serves the aggregate. Add a plugin → skill appears. Remove a plugin → skill disappears. No manual curation, no `defineBrain()` skills field needed.

### How other brains use our skills

When another brain fetches our Agent Card:

1. They see our semantic skills (e.g., "blog writing", "site publishing")
2. They store them in their agent directory entity for us
3. They can route requests by capability: "find a brain that can generate images" → search agent entities by skill tags
4. Skills describe **what** we can do, not **how** — no tool names leaked

### How we use other brains' skills

When we add an agent, we store their skills from their Agent Card:

1. `agent_add { url: "ranger.rizom.ai" }` → fetches Agent Card → stores skills in entity
2. "Which brains can help with social media?" → search agent entities by skill tags
3. "Ask ranger to find agents that do image generation" → `a2a_call` with capability query

Skills enable capability-based routing without coupling to tool implementations.

### Agent Card generation fix

The current Agent Card generation (`interfaces/a2a/src/agent-card.ts`) maps MCP tools 1:1 to skills. Replace with:

1. Shell collects `skills` from all registered plugins during initialization
2. Agent Card serves these aggregated semantic skills
3. No tool names in the Agent Card

### A2A client integration

Update `createA2ACallTool` to resolve agents from the directory:

```typescript
// Current: agent must be a URL
a2a_call { agent: "https://yeehaa.io", message: "..." }

// New: agent can be a domain/name
a2a_call { agent: "yeehaa.io", message: "..." }   → entity lookup → url + token
a2a_call { agent: "yeehaa", message: "..." }       → findEntityByIdentifier fallback
a2a_call { agent: "https://...", message: "..." }  → direct URL (backward compatible)
```

Resolution order:

1. If agent starts with `http://` or `https://` → use as URL directly
2. Otherwise → `findEntityByIdentifier("agent", agent)` → get url from entity, token from brain.yaml
3. If no entity found → try as domain: fetch Agent Card from `https://{agent}/.well-known/agent-card.json`, auto-create entity with `status: testing`

### How discovery works

**Phase 1 (manual):**

1. User says "add yeehaa.io as an agent"
2. `agent_add { url: "yeehaa.io" }` fetches Agent Card from `https://yeehaa.io/.well-known/agent-card.json`
3. Creates entity with domain ID `yeehaa.io`, semantic skills from card, `discoveredVia: manual`, `status: testing`
4. User says "trust yeehaa.io" → `agent_trust` sets status to `trusted`
5. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory, token from brain.yaml → calls agent

**Auto-create on first contact:**

1. `a2a_call { agent: "https://unknown.io", message: "..." }` → direct call (no entity yet)
2. Call succeeds → A2A client fetches Agent Card → creates entity with `status: testing`
3. Next call: `a2a_call { agent: "unknown.io" }` → resolves from directory

**Phase 2 (AT Protocol — automatic):**

1. Brain subscribes to Jetstream for `io.rizom.brain.card` records
2. Agent plugin's `derive()` creates agent entities from discovered brain cards
3. Agent appears with `status: testing`, `discoveredVia: atproto`
4. Same trust/call flow as Phase 1

### Future: DID-based authentication

Currently A2A uses bearer tokens (pre-shared secrets). With DIDs on both sides, authentication could become signature-based — the calling brain signs the request with its DID key, the receiving brain verifies against the DID document. This eliminates token management entirely. Not in this plan — depends on A2A auth Phase 2+.

### Future: Ranger as network curator

Ranger subscribes to the full firehose, indexes all brain cards, and exposes a cross-brain feed. Other brains discover agents through Ranger's feed instead of subscribing to the firehose directly. Ranger becomes the curator, not a central registry — any brain can still discover directly.

## Relationship to brain.yaml

Currently in brain.yaml:

```yaml
plugins:
  a2a:
    trustedTokens:
      ${A2A_TOKEN_YEEHAA}: yeehaa
    outboundTokens:
      yeehaa.io: ${A2A_OUTBOUND_TOKEN_YEEHAA}
```

With agent directory:

- `outboundTokens` stays in brain.yaml — tokens are secrets, keyed by domain. A2A client checks brain.yaml for the token after resolving the URL from the directory.
- `trustedTokens` (inbound) stays in brain.yaml — that's "who do I let in", not "who do I know"
- The directory adds: identity (DID), capabilities (skills), trust status, discovery metadata. brain.yaml stays for secrets only.

## Agent Card generation fix

The current Agent Card generation (`interfaces/a2a/src/agent-card.ts`) maps MCP tools 1:1 to skills with empty tags. This needs to change:

1. Brain models declare semantic skills in `defineBrain({ skills: [...] })`
2. Agent Card serves these skills instead of tool dumps
3. Skills flow from brain model → Agent Card → other brains' directories

## Steps

### Phase 1: Agent entity + tools

1. Create `plugins/agent-directory/` — ServicePlugin with schema, adapter, tools
2. Implement `agent_add` — fetches Agent Card, creates entity with semantic skills
3. Implement `agent_trust`, `agent_remove`
4. Update `a2a_call` to resolve agent name/domain from entity service, token from brain.yaml
5. Auto-create entity on first successful `a2a_call` to unknown agent
6. Register in brain models
7. Tests

### Phase 1b: Plugin-declared skills + Agent Card fix

1. Add optional `skills: AgentSkill[]` field to `BasePlugin` (EntityPlugin and ServicePlugin)
2. Shell collects skills from all registered plugins at initialization
3. Update Agent Card generation to serve aggregated plugin skills instead of tool dump
4. Add skills to existing entity and service plugins (blog, decks, note, link, site-builder, etc.)
5. Tests

### Phase 2: AT Protocol discovery

Depends on AT Protocol Phase 4 (medium-term) — which provides Jetstream subscription and `io.rizom.brain.card` publishing.

1. Add `derive()` to agent plugin — watches for ingested brain card records
2. Auto-create agent entities from discovered brain cards with `discoveredVia: atproto`
3. Refresh capabilities on card updates
4. Configurable auto-discovery settings
5. Tests

### Phase 3: Migrate from brain.yaml tokens

1. Migration script: read `outboundTokens` from brain.yaml, create agent entities
2. Update A2A client to check directory before brain.yaml config
3. Deprecate `outboundTokens` in brain.yaml
4. Tests

## Files affected

| Phase | Files | Nature                                                                   |
| ----- | ----- | ------------------------------------------------------------------------ |
| 1     | ~8    | New entity plugin, schema, adapter, generation handler, a2a client patch |
| 2     | ~3    | derive() implementation, auto-create, config                             |
| 3     | ~3    | Migration script, A2A client update, brain.yaml deprecation              |

## Verification

1. `bun run typecheck` / `bun test`
2. `agent_add { url: "yeehaa.io" }` → entity created with Agent Card data and semantic skills
3. `agent_trust { agent: "yeehaa.io" }` → status changes to trusted
4. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory, token from brain.yaml
5. `a2a_call { agent: "https://unknown.io" }` → call succeeds → auto-creates entity
6. `a2a_call { agent: "https://yeehaa.io" }` → direct URL still works (backward compatible)
7. Agent Card at `/.well-known/agent-card.json` contains semantic skills, not tool names
8. (Phase 2) Brain card on network → auto-discovered as agent entity via `derive()`
9. (Phase 3) `outboundTokens` stays in brain.yaml, directory resolves URLs only
