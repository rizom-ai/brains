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

- **Persistence** — agents stored as entities (name, URL, skills, when discovered)
- **Name resolution** — `a2a_call { agent: "yeehaa" }` instead of full URL
- **Trust management** — `status: testing | trusted | archived`
- **Browsability** — `system_list agent`, `system_get agent yeehaa.io`

## Design

### Entity type: `agent`

An EntityPlugin in `entities/agent-directory/`. Entity ID is the domain (e.g. `yeehaa.io`) — naturally unique.

```yaml
---
name: Yeehaa
url: https://yeehaa.io
status: testing
description: Personal knowledge brain
discoveredAt: "2026-03-31T00:00:00.000Z"
discoveredVia: manual
skills:
  - id: content-creation
    name: Content Creation
    description: Create blog posts and newsletters
---
Professional brain managing essays and portfolio projects.
```

### Entity schema

```typescript
const agentSkillSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
});

const agentFrontmatterSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  status: z.enum(["testing", "trusted", "archived"]).default("testing"),
  description: z.string().optional(),
  discoveredAt: z.string().datetime(),
  discoveredVia: z.enum(["atproto", "manual"]).default("manual"),
  skills: z.array(agentSkillSchema).default([]),
});
```

### Why two packages

The agent directory needs both an entity type (schema, adapter) and custom tools (`agent_add`, `agent_trust`, `agent_remove`). These map to two plugin types:

- `entities/agent-directory/` — **EntityPlugin** defining the schema, adapter, and frontmatter
- `plugins/agent-directory/` — **ServicePlugin** with tools for adding, trusting, and removing agents

This follows existing precedent: `entities/blog/` defines blog entities, while `plugins/directory-sync/` and `plugins/content-pipeline/` operate on them. The `agent_add` tool fetches Agent Cards over HTTP and creates entities — that's service behavior, not entity definition.

EntityPlugin's `tools: []` is hardcoded intentionally to enforce this separation. If a combined EntityPlugin+ServicePlugin pattern becomes common, a `CompositePlugin` abstraction can emerge from real usage later.

### Tools

**`agent_add { url: "yeehaa.io" }`**
Fetches Agent Card from `https://{url}/.well-known/agent-card.json`. Creates entity with domain as ID, skills from card, `status: testing`, `discoveredVia: manual`. Fails gracefully if card unreachable.

**`agent_trust { agent: "yeehaa.io" }`**
Sets entity status to `trusted`. Uses `findEntityByIdentifier` so name/title also works.

**`agent_remove { agent: "yeehaa.io" }`**
Sets status to `archived` (soft delete). Entity remains for history.

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

**Auto-create on first contact:** When `a2a_call` succeeds with a direct URL and no entity exists, create one with `status: testing`. The agent is no longer forgotten.

### What this does NOT include

- **AT Protocol** — Phase 2. Automatic discovery via `io.rizom.brain.card` records on the network. Same entity, different input path. Depends on AT Protocol Phases 3-6.
- **Plugin-declared skills** — separate concern. Currently Agent Card dumps tool names as skills. Fixing that (plugins declare semantic skills, shell aggregates) is a follow-up that touches every plugin.
- **DID-based auth** — depends on A2A auth Phase 2+.
- **Token migration from brain.yaml** — tokens stay in brain.yaml for now. Directory resolves URLs only.

## Steps

### Step 1: Agent entity type

1. Create `entities/agent-directory/` package (EntityPlugin)
2. Schema (`agentFrontmatterSchema`, `agentEntitySchema`)
3. Adapter (toMarkdown, fromMarkdown, extractMetadata)
4. Tests for adapter roundtrip

### Step 2: Agent tools

1. Create `plugins/agent-directory/` package (ServicePlugin)
2. `agent_add` — fetch Agent Card, create entity (constructor DI for fetch)
3. `agent_trust` — update status via `findEntityByIdentifier`
4. `agent_remove` — archive via `findEntityByIdentifier`
5. Tests for each tool handler (mock fetch, mock entity service)

### Step 3: A2A client patch

1. Update `a2a_call` to accept name/domain, resolve from entity service
2. Auto-create entity on successful first contact with unknown agent
3. Backward compatible — full URLs still work
4. Tests for resolution logic

### Step 4: Register in brain models

1. Add both packages to rover `minimal` preset (A2A interface is already there)
2. Verify: `system_list agent` works, `agent_add` works, `a2a_call` resolves by name

## Files affected

| Step | Files | Nature                                                        |
| ---- | ----- | ------------------------------------------------------------- |
| 1    | ~4    | EntityPlugin package: schema, adapter, plugin, tests          |
| 2    | ~4    | ServicePlugin package: tools, plugin, Agent Card fetch, tests |
| 3    | ~2    | A2A client patch, client tests                                |
| 4    | ~2    | Rover brain model registration                                |

## Verification

1. `bun run typecheck` / `bun run lint` / `bun test` after each step
2. `agent_add { url: "yeehaa.io" }` → entity created with Agent Card data
3. `agent_trust { agent: "yeehaa.io" }` → status changes to trusted
4. `a2a_call { agent: "yeehaa.io" }` → resolves URL from directory
5. `a2a_call { agent: "https://unknown.io" }` → auto-creates entity after success
6. `a2a_call { agent: "https://yeehaa.io" }` → direct URL still works
7. Existing A2A tests still pass
