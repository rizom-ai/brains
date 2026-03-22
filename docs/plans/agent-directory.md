# Plan: Agent Directory Plugin

## Context

A2A lets brains talk to each other, but there's no discovery or contact management. You need to know an agent's URL upfront, and tokens are hardcoded in brain.yaml.

The A2A authentication plan (`docs/plans/2026-03-15-a2a-authentication.md`) established bearer tokens for trust. This plan builds the **next layer**: instead of hardcoding agent URLs and tokens in brain.yaml, manage them as entities with encrypted tokens. Each brain maintains its own directory of known agents.

## Design

### New entity type: `agent`

Follows the link plugin pattern (URL + metadata as entity).

```yaml
---
name: Yeehaa
url: https://yeehaa.io
status: trusted # testing | trusted | archived
organization: Rizom
description: Personal knowledge brain for Yeehaa
discoveredAt: "2026-03-22T00:00:00.000Z"
discoveredVia: manual # manual | shared | registry
outboundToken: "enc:a1b2c3d4..." # AES-encrypted with AGENT_ENCRYPTION_KEY
skills:
  - note_create
  - blog_publish
  - system_search
---
Professional brain managing essays, presentations, and portfolio projects.
```

**Tokens encrypted in the entity** — outbound tokens are AES-encrypted with a brain-specific key (`AGENT_ENCRYPTION_KEY` in `.env`). The encrypted token lives in the entity frontmatter. At runtime, decrypted to get the actual bearer token. One secret in `.env`, all agent tokens self-contained and portable (sync via git, useless without the key).

### New plugin: `plugins/agent-directory/`

A CorePlugin (read-only entity service) or ServicePlugin (full CRUD) with:

**Tools:**

- `agent_add` — add an agent by URL. Fetches the Agent Card from `{url}/.well-known/agent-card.json`, stores name/description/skills/organization. Status defaults to `testing`.
- `agent_list` — list known agents, optionally filtered by status or skill
- `agent_trust` — change agent status to `trusted`
- `agent_remove` — archive or delete an agent contact
- `agent_discover` — fetch and refresh an agent's capabilities from its Agent Card

**Integration with A2A client:**
The existing `a2a_call` tool (in `interfaces/a2a/src/client.ts`) currently takes a raw URL. Update it to also accept an agent name from the directory:

```
a2a_call { agent: "yeehaa" }        → looks up URL from directory
a2a_call { agent: "https://..." }   → direct URL (current behavior)
```

### Entity schema

```typescript
const agentFrontmatterSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  status: z.enum(["testing", "trusted", "archived"]).default("testing"),
  organization: z.string().optional(),
  description: z.string().optional(),
  discoveredAt: z.string().datetime(),
  discoveredVia: z.enum(["manual", "shared", "registry"]).default("manual"),
  outboundToken: z.string().optional(), // AES-encrypted, "enc:..." prefix
  skills: z.array(z.string()).default([]),
});

const agentMetadataSchema = agentFrontmatterSchema.pick({
  name: true,
  status: true,
  organization: true,
});
```

### How discovery works

1. User says "add yeehaa.io as an agent"
2. `agent_add` fetches `https://yeehaa.io/.well-known/agent-card.json`
3. Extracts name, description, organization, skills from the card
4. Creates an `agent` entity with status `testing`
5. User can test with `a2a_call { agent: "yeehaa" }`
6. User says "trust yeehaa" → `agent_trust` sets status to `trusted`

### Future: ranger as central registry

Not in this plan, but the path is clear:

- Ranger exposes a `registry_search` tool via A2A
- Brains call `a2a_call { agent: "ranger", message: "find agents that know about design" }`
- Ranger returns matching agents from its hosted rover registry
- User picks ones to add to their local directory

## Package structure

```
plugins/agent-directory/
  src/
    index.ts
    plugin.ts           # ServicePlugin, registers entity type + tools
    schemas/agent.ts    # Entity schema
    adapters/agent-adapter.ts
    tools/index.ts      # add, list, trust, remove, discover
  test/
    agent-directory.test.ts
  package.json
```

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

With agent directory, this becomes entities:

- `outboundTokens` moves into agent entities (encrypted)
- `trustedTokens` (inbound) stays in brain.yaml — that's "who do I let in", not "who do I know"
- A2A client resolves outbound tokens from the directory instead of config

## Key files to modify

| File                           | Change                                        |
| ------------------------------ | --------------------------------------------- |
| `plugins/agent-directory/`     | New plugin (entity + tools)                   |
| `interfaces/a2a/src/client.ts` | Support agent name lookup from directory      |
| `brains/rover/src/index.ts`    | Add agent-directory to capabilities + presets |
| `brains/ranger/src/index.ts`   | Same                                          |
| `brains/relay/src/index.ts`    | Same                                          |

## Verification

1. `bun run typecheck` / `bun test`
2. Via MCP: `agent_add { url: "https://yeehaa.io" }` → entity created with Agent Card data
3. Via MCP: `agent_list` → shows the agent
4. Via MCP: `a2a_call { agent: "yeehaa" }` → resolves URL from directory, calls the agent
5. Via MCP: `agent_remove { name: "yeehaa" }` → archives the entity
