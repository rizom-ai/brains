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
discoveredVia: atproto # atproto | manual
outboundToken: ${A2A_OUTBOUND_TOKEN_YEEHAA} # plain env var, like existing secrets
skills:
  - system_create
  - system_search
  - system_update
---
Professional brain managing essays, presentations, and portfolio projects.
```

### Design decisions

**Entity ID is the domain** — e.g., `yeehaa.io`, `mylittlephoney.com`. Domains are naturally unique and align with how `outboundTokens` is keyed today. `findEntityByIdentifier` still resolves by name/title as a fallback, but the domain is the canonical identifier.

**No encryption in Phase 1** — outbound tokens are stored as plain env var references (`${A2A_OUTBOUND_TOKEN_YEEHAA}`), consistent with how all secrets work in brain.yaml today. The agent entities live in brain-data (private repo or gitignored). Encryption can be added later if a real threat model warrants it (e.g., when brain-data repos become public).

**Skills are raw tool names from the Agent Card** — the Agent Card's `skills` array maps 1:1 from registered MCP tools (e.g., `system_create`, `system_search`). Stored as-is — machine-readable data for capability routing.

**Pure EntityPlugin, no separate ServicePlugin** — follows the codebase pattern where EntityPlugins don't have custom tools. Instead:

- `system_create { entityType: "agent", prompt: "add yeehaa.io" }` → `AgentGenerationHandler` fetches the Agent Card, populates the entity
- `system_update` → handles trust changes (e.g., "trust yeehaa" updates status to `trusted`)
- `system_delete` → removes agents
- No `agent_add`/`agent_list`/`agent_trust`/`agent_remove` tools — the system tools handle everything

**`a2a_call` resolves agents from the entity service** — the A2A interface's `createA2ACallTool` is updated to accept an entity service dependency. When `agent` is not a URL, it looks up the agent entity by domain/name and resolves the URL + outbound token from there.

**`derive()` reserved for Phase 2** — when AT Protocol discovery is active, the agent plugin's `derive()` watches for ingested `io.rizom.brain.card` records and creates/updates agent entities with `discoveredVia: atproto`. Not needed in Phase 1.

### Entity schema

```typescript
const agentFrontmatterSchema = z.object({
  name: z.string(),
  did: z.string().optional(), // did:web:... or did:plc:...
  url: z.string().url(),
  status: z.enum(["testing", "trusted", "archived"]).default("testing"),
  organization: z.string().optional(),
  description: z.string().optional(),
  discoveredAt: z.string().datetime(),
  discoveredVia: z.enum(["atproto", "manual"]).default("manual"),
  outboundToken: z.string().optional(), // plain env var or value
  skills: z.array(z.string()).default([]),
});
```

### Entity adapter

```typescript
class AgentAdapter extends BaseEntityAdapter<AgentEntity, AgentMetadata> {
  // Entity ID = domain extracted from url
  // e.g., https://yeehaa.io → yeehaa.io
}
```

### Generation handler

`AgentGenerationHandler` processes `system_create` for agent entities:

1. Parse the prompt for a URL (e.g., "add yeehaa.io as an agent")
2. Fetch `https://{url}/.well-known/agent-card.json`
3. Parse agent card → extract name, description, skills, A2A endpoint URL
4. Create entity with `status: testing`, `discoveredVia: manual`, `discoveredAt: now`

### A2A client integration

Update `createA2ACallTool` to accept an entity service and resolve agents:

```typescript
// Current: agent must be a URL
a2a_call { agent: "https://yeehaa.io", message: "..." }

// New: agent can be a domain/name that resolves from directory
a2a_call { agent: "yeehaa.io", message: "..." }   → looks up agent entity → gets url + token
a2a_call { agent: "yeehaa", message: "..." }       → findEntityByIdentifier fallback
a2a_call { agent: "https://yeehaa.io", message: "..." }  → direct URL (backward compatible)
```

Resolution order:

1. If agent starts with `http://` or `https://` → use as URL directly (current behavior)
2. Otherwise → `findEntityByIdentifier("agent", agent)` → get url + outboundToken from entity
3. If no entity found → try as domain: fetch Agent Card from `https://{agent}/.well-known/agent-card.json`

### How discovery works

**Phase 1 (manual):**

1. User says "add yeehaa.io as an agent"
2. `system_create` routes to `AgentGenerationHandler`
3. Handler fetches Agent Card from `https://yeehaa.io/.well-known/agent-card.json`
4. Creates entity with domain ID `yeehaa.io`, `discoveredVia: manual`, `status: testing`
5. User says "trust yeehaa.io" → `system_update` sets status to `trusted`
6. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory → calls agent

**Phase 2 (AT Protocol — automatic):**

1. Brain subscribes to Jetstream for `io.rizom.brain.card` records
2. Agent plugin's `derive()` creates agent entities from discovered brain cards
3. Agent appears with `status: testing`, `discoveredVia: atproto`
4. Same trust/call flow as Phase 1

### Future: DID-based authentication

Currently A2A uses bearer tokens (pre-shared secrets). With DIDs on both sides, authentication could become signature-based — the calling brain signs the request with its DID key, the receiving brain verifies against the DID document. This eliminates token management entirely. Not in this plan — depends on A2A auth Phase 2+.

### Future: Ranger as network curator

Ranger subscribes to the full firehose, indexes all brain cards, and exposes a cross-brain feed. Other brains discover agents through Ranger's feed instead of subscribing to the firehose directly. Ranger becomes the curator, not a central registry — any brain can still discover directly.

## Replaces brain.yaml A2A config

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

- `outboundTokens` moves into agent entities (as plain env var references)
- `trustedTokens` (inbound) stays in brain.yaml — that's "who do I let in", not "who do I know"
- A2A client resolves outbound tokens from the directory instead of config

## Steps

### Phase 1: Agent entity + system tool integration

1. Create `entities/agent/` — EntityPlugin with schema, adapter, frontmatter parsing
2. Implement `AgentGenerationHandler` — fetches Agent Card on `system_create`
3. Update `a2a_call` to resolve agent name/domain from entity service
4. Register in brain models
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
2. `system_create { entityType: "agent", prompt: "add yeehaa.io" }` → entity created with Agent Card data, ID is `yeehaa.io`
3. `system_update` → change agent status to trusted
4. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory, calls the agent
5. `a2a_call { agent: "https://yeehaa.io" }` → direct URL still works (backward compatible)
6. `system_delete` → removes agent entity
7. (Phase 2) Brain card on network → auto-discovered as agent entity via `derive()`
8. (Phase 3) Existing brain.yaml tokens migrated to agent entities
