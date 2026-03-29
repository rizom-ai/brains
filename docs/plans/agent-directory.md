# Plan: Agent Directory Plugin

## Context

A2A lets brains talk to each other, but there's no discovery or contact management. You need to know an agent's URL upfront, and tokens are hardcoded in brain.yaml.

A2A authentication Phase 1 (bearer tokens) is complete. This plan builds the **next layer**: manage known agents as entities with encrypted tokens, and discover new agents via AT Protocol.

## Discovery: AT Protocol vs manual

Two discovery mechanisms, layered:

| Mechanism                 | How                                                                                                                            | When                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **AT Protocol (passive)** | Brains publish `io.rizom.brain.card` records. Subscribe to Jetstream, filter for brain cards. New brains appear automatically. | Default — always running if atproto plugin is active |
| **Manual (active)**       | User provides a URL or DID. Brain resolves identity and creates a local contact.                                               | Fallback — for agents not on AT Protocol             |

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

Stores the local relationship with a known agent. Discovery data comes from AT Protocol, trust/token data is local.

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
outboundToken: "enc:a1b2c3d4..." # AES-encrypted, for A2A bearer auth
skills:
  - note_create
  - blog_publish
  - system_search
---
Professional brain managing essays, presentations, and portfolio projects.
```

**Tokens encrypted in the entity** — outbound tokens are AES-encrypted with a brain-specific key (`AGENT_ENCRYPTION_KEY` in `.env`). At runtime, decrypted to get the actual bearer token. One secret in `.env`, all agent tokens self-contained and portable.

**DID field** — links the local entity to the AT Protocol identity. Used for resolution (DID → service endpoint → A2A URL) and verification (signed requests).

### Plugin: `plugins/agent-directory/`

A ServicePlugin with:

**Tools:**

- `agent_add` — add an agent by DID or URL. If DID: resolve from AT Protocol. If URL: fetch Agent Card as fallback. Creates entity with status `testing`.
- `agent_list` — list known agents, optionally filtered by status or skill
- `agent_trust` — change agent status to `trusted`
- `agent_remove` — archive or delete an agent contact

**AT Protocol integration (if atproto plugin active):**

- On startup, subscribe to Jetstream filtered for `io.rizom.brain.card` records
- New brain cards create agent entities with status `testing` and `discoveredVia: atproto`
- Card updates refresh capabilities on existing entities
- Configurable: auto-discover all, or only from known DIDs

**A2A client integration:**

The existing `a2a_call` tool accepts an agent name from the directory:

```
a2a_call { agent: "yeehaa" }        → resolves DID → URL from directory
a2a_call { agent: "https://..." }   → direct URL (current behavior)
```

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
  outboundToken: z.string().optional(), // AES-encrypted
  skills: z.array(z.string()).default([]),
});
```

### How discovery works

**With AT Protocol (automatic):**

1. Brain subscribes to Jetstream for `io.rizom.brain.card` records
2. New brain card appears → create `agent` entity with `discoveredVia: atproto`
3. Agent appears in `agent_list` with status `testing`
4. User says "trust yeehaa" → `agent_trust` sets status to `trusted`
5. `a2a_call { agent: "yeehaa" }` → resolves DID → gets URL → calls agent

**Without AT Protocol (manual):**

1. User says "add yeehaa.io as an agent"
2. `agent_add` fetches `https://yeehaa.io/.well-known/agent-card.json`
3. Creates entity with `discoveredVia: manual`
4. Same trust/call flow as above

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

- `outboundTokens` moves into agent entities (encrypted)
- `trustedTokens` (inbound) stays in brain.yaml — that's "who do I let in", not "who do I know"
- A2A client resolves outbound tokens from the directory instead of config

## Steps

### Phase 1: Agent entity + basic tools

1. Create `plugins/agent-directory/` with EntityPlugin for `agent` type
2. Implement `agent_add` (manual — URL + Agent Card fetch)
3. Implement `agent_list`, `agent_trust`, `agent_remove`
4. Update `a2a_call` to resolve agent name from directory
5. Register in brain models
6. Tests

### Phase 2: AT Protocol discovery

Depends on atproto plugin (Phase 4 of atproto-integration plan).

1. Subscribe to Jetstream for `io.rizom.brain.card` records
2. Auto-create agent entities from discovered brain cards
3. Refresh capabilities on card updates
4. Configurable auto-discovery settings
5. Tests

### Phase 3: Migrate from brain.yaml tokens

1. Migration script: read `outboundTokens` from brain.yaml, create agent entities with encrypted tokens
2. Update A2A client to check directory before brain.yaml config
3. Deprecate `outboundTokens` in brain.yaml
4. Tests

## Files affected

| Phase | Files | Nature                                                                                 |
| ----- | ----- | -------------------------------------------------------------------------------------- |
| 1     | ~8    | New plugin, entity schema, adapter, tools, a2a client update, brain model registration |
| 2     | ~3    | Jetstream subscription, auto-create, config                                            |
| 3     | ~3    | Migration script, A2A client update, brain.yaml deprecation                            |

## Verification

1. `bun run typecheck` / `bun test`
2. `agent_add { url: "https://yeehaa.io" }` → entity created with Agent Card data
3. `agent_list` → shows the agent
4. `a2a_call { agent: "yeehaa" }` → resolves URL from directory, calls the agent
5. `agent_remove { name: "yeehaa" }` → archives the entity
6. (Phase 2) Brain card on network → auto-discovered as agent entity
7. (Phase 3) Existing brain.yaml tokens migrated to agent entities
