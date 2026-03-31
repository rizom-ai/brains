# Plan: Agent Directory

## Context

A2A lets brains talk to each other, but there's no contact management. `a2a_call` fetches the Agent Card every time, forgets everything after the call, and requires a full URL. There's no way to ask "which agents do I know?" or "call yeehaa" by name.

A2A authentication Phase 1 (bearer tokens) is complete. This plan builds the **contact layer**: manage known agents as entities, resolve by name, and remember who you've talked to.

## What exists today

- `a2a_call { agent: "https://yeehaa.io", message: "..." }` — fetches Agent Card, calls agent, forgets
- Agent Card fetch via `/.well-known/agent-card.json` — discovery works
- Bearer tokens in `brain.yaml` (`outboundTokens`) — auth works
- No persistence, no name resolution, no trust management

## What Phase 1 adds

- **Persistence** — agents stored as entities representing brain+anchor pairs
- **Name resolution** — `a2a_call { agent: "yeehaa" }` instead of full URL
- **Browsability** — `system_list agent`, `system_get agent yeehaa.io`
- **Richer Agent Card** — includes anchor profile info for better directory entries

## Design

### Entity type: `agent`

An EntityPlugin in `entities/agent-directory/`. Every agent represents a **brain + anchor pair** — a system and the person or organization behind it. The directory is a contact list, not a service registry.

Entity ID is the domain (e.g. `yeehaa.io`, `ranger.rizom.ai`) — naturally unique, subdomains work fine.

```yaml
---
# The anchor (who)
name: Yeehaa
organization: Rizom

# The brain (what)
brainName: Yeehaa's Brain
url: https://yeehaa.io
did: "did:web:yeehaa.io"

# Relationship
status: active
discoveredAt: "2026-03-31T00:00:00.000Z"
discoveredVia: manual
---

## About

Yeehaa is the founder of Rizom. His brain manages essays about institutional
design, presentations on agent-to-agent communication, and a portfolio of
education technology projects.

## Skills

- **Content Creation** — Create blog posts and newsletters [blog, writing]
- **Knowledge Search** — Search and retrieve from a personal knowledge base [search, knowledge]

## Notes

We first connected when testing A2A communication between our brains.
Reliable collaborator — responds quickly with high-quality content.
```

The **frontmatter** is structured data the system needs — identity, endpoint, relationship status. The **body** has three sections:

- `## About` — who the anchor is, what the brain does (populated from Agent Card)
- `## Skills` — structured capability list parsed from markdown (keeps frontmatter short)
- `## Notes` — personal notes about the relationship (user/agent editable)

All sections get embedded for semantic search — "which of my contacts works on education?" searches naturally.

### Entity schema

```typescript
const agentFrontmatterSchema = z.object({
  // Anchor
  name: z.string(),
  organization: z.string().optional(),

  // Brain
  brainName: z.string().optional(),
  url: z.string().url(),
  did: z.string().optional(),

  // Relationship
  status: z.enum(["active", "archived"]).default("active"),
  discoveredAt: z.string().datetime(),
  discoveredVia: z.enum(["atproto", "manual"]).default("manual"),
});
```

Metadata (for DB queries): `name` and `status`.

Skills live in the body as structured markdown — parsed by the adapter when needed programmatically, but primarily consumed via embedding search.

### Why two packages

The agent directory needs both an entity type (schema, adapter) and custom tools (`agent_add`, `agent_remove`). These map to two plugin types:

- `entities/agent-directory/` — **EntityPlugin** defining the schema, adapter, and frontmatter
- `plugins/agent-directory/` — **ServicePlugin** with tools for adding and removing agents

This follows existing precedent: `entities/blog/` defines blog entities, while `plugins/directory-sync/` and `plugins/content-pipeline/` operate on them. The `agent_add` tool fetches Agent Cards over HTTP and creates entities — that's service behavior, not entity definition.

### Tools

**`agent_add { url: "yeehaa.io" }`**
Fetches Agent Card from `https://{url}/.well-known/agent-card.json`. Agent Card includes anchor profile info (name, organization, description). Creates entity with domain as ID. Populates frontmatter from card data. Builds About section from description, Skills section from capabilities. Sets `status: active`, `discoveredVia: manual`. Fails gracefully if card unreachable.

**`agent_remove { agent: "yeehaa.io" }`**
Sets status to `archived`. Entity remains in DB and on disk, but `a2a_call` refuses to call archived agents. Uses `findEntityByIdentifier` so name works too.

### A2A client integration

Update `a2a_call` resolution:

```
a2a_call { agent: "https://yeehaa.io" }  → direct URL (backward compatible)
a2a_call { agent: "yeehaa.io" }          → entity lookup → url + token
a2a_call { agent: "yeehaa" }             → findEntityByIdentifier fallback
```

Resolution order:

1. Starts with `http://` or `https://` → use as URL directly
2. Otherwise → look up entity by ID or name → get url from entity
3. Token from `brain.yaml` `outboundTokens` (keyed by domain)

`a2a_call` refuses archived agents.

**Auto-create on first contact:** When `a2a_call` succeeds with a direct URL and no entity exists, fetches Agent Card and creates a full entity with `status: active`. The agent is no longer forgotten.

### Agent Card extension (spec-compliant)

The A2A spec has a built-in extension mechanism via `capabilities.extensions`. Each extension is identified by a URI and can expose structured data. We use this to advertise anchor profile info without adding custom top-level fields to the Agent Card.

Our card declares the extension:

```json
{
  "name": "Yeehaa's Brain",
  "url": "https://yeehaa.io",
  "description": "Personal knowledge brain",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://rizom.ai/ext/anchor-profile/v1",
        "description": "Anchor (operator) identity for this brain",
        "params": {
          "name": "Yeehaa",
          "organization": "Rizom",
          "did": "did:web:yeehaa.io",
          "description": "Founder of Rizom, working on institutional design and education technology"
        }
      }
    ]
  },
  "skills": [...]
}
```

Remote agents that don't understand the extension simply ignore it. Non-brain A2A agents won't have it — `agent_add` gracefully falls back to card-only data (brain name, skills, description).

### Card staleness

`a2a_call` already fetches the Agent Card on every call. We use this to keep directory entries fresh:

1. On each `a2a_call`, compare fetched card against stored entity
2. If key fields changed (name, skills, description, anchor info), update the entity silently
3. No extra HTTP requests, no background jobs — refresh piggybacks on existing fetches

Inactive contacts go stale, but that's fine — you only need up-to-date info for agents you're actually talking to.

### Auth and trust

- **Tokens** stay in `brain.yaml` (`outboundTokens`) — the directory never stores secrets
- **Trust** is a token concern, not a status concern — if there's a token, the call is authenticated
- **DID** field is stored on the entity for future DID-based auth (DIDs are public, safe to store)
- **Status** is `active | archived` — not a trust indicator

### Relationship to AT Protocol

The `agent` entity type is shared with [AT Protocol Integration Phase 4](./atproto-integration.md). Both plans write to the same entity — `discoveredVia` tracks the input path (`"manual"` for `agent_add`, `"atproto"` for firehose discovery).

When both are available for a given agent, AT Protocol is the richer source (cryptographic identity, signed profile from PDS). The A2A anchor extension is the fallback for non-AT Protocol agents. Both refresh paths (A2A piggyback and firehose push) update the same entity.

The `did` field stores the brain DID (the agent endpoint). Anchor DID can be added as a separate field when AT Protocol identity lands.

### What this does NOT include

- **AT Protocol discovery** — Phase 2 of [atproto-integration](./atproto-integration.md). Automatic discovery via `io.rizom.brain.card` records on the firehose. Same entity type, different input path.
- **Plugin-declared skills** — separate concern. Changing how _our_ Agent Card is generated (from plugins instead of tool dumps) is a follow-up.
- **DID-based auth** — depends on A2A auth Phase 2+. The `did` field is stored but not used for auth yet.

## Steps

### Step 1: Agent entity type

1. Create `entities/agent-directory/` package (EntityPlugin)
2. Schema (`agentFrontmatterSchema`, `agentEntitySchema`)
3. Adapter with body section parsing (About, Skills, Notes)
4. Tests for adapter roundtrip and section parsing

### Step 2: Agent Card anchor extension

1. Define anchor-profile extension URI (`https://rizom.ai/ext/anchor-profile/v1`)
2. Add extension to Agent Card generation (`interfaces/a2a/src/agent-card.ts`) — populate `params` from brain identity/profile
3. Update Agent Card fetch in A2A client to extract anchor data from `capabilities.extensions` when present
4. Tests — card with extension, card without extension (graceful fallback)

### Step 3: Agent tools

1. Create `plugins/agent-directory/` package (ServicePlugin)
2. `agent_add` — fetch extended Agent Card, build full entity with sections
3. `agent_remove` — archive via `findEntityByIdentifier`
4. Tests for each tool handler (mock fetch, mock entity service)

### Step 4: A2A client patch

1. Update `a2a_call` to accept name/domain, resolve from entity service
2. Refuse archived agents
3. Auto-create entity on successful first contact (full Agent Card fetch)
4. Refresh existing entity when fetched card differs from stored data
5. Backward compatible — full URLs still work
6. Tests for resolution, auto-create, refresh, and archived refusal

### Step 5: Register in brain models

1. Add both packages to rover `minimal` preset (A2A interface is already there)
2. Verify: `system_list agent` works, `agent_add` works, `a2a_call` resolves by name

## Files affected

| Step | Files | Nature                                               |
| ---- | ----- | ---------------------------------------------------- |
| 1    | ~4    | EntityPlugin package: schema, adapter, plugin, tests |
| 2    | ~3    | Agent Card generation, schema, tests                 |
| 3    | ~4    | ServicePlugin package: tools, plugin, fetch, tests   |
| 4    | ~2    | A2A client patch, client tests                       |
| 5    | ~2    | Rover brain model registration                       |

## Verification

1. `bun run typecheck` / `bun run lint` / `bun test` after each step
2. `agent_add { url: "yeehaa.io" }` → entity created with About, Skills, Notes sections
3. `agent_remove { agent: "yeehaa.io" }` → status set to archived
4. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory
5. `a2a_call { agent: "yeehaa" }` → resolves by name via findEntityByIdentifier
6. `a2a_call { agent: "https://unknown.io" }` → auto-creates full entity after success
7. `a2a_call { agent: "https://yeehaa.io" }` → direct URL still works
8. `a2a_call` refuses archived agents
9. Agent Card at `/.well-known/agent-card.json` includes anchor-profile extension in `capabilities.extensions`
10. `agent_add` for a non-brain A2A agent (no anchor extension) still creates a valid entity
11. `a2a_call` silently updates entity when remote card has changed
12. Existing A2A tests still pass
