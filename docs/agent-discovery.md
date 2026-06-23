# Agent Discovery

How a brain discovers capabilities within itself, and how it discovers and
calls _other_ brains across the network. This explains the **shipped**
mechanism, with a fenced-off "What's coming" section at the end for the planned
direction.

There are two independent senses of "discovery" here, and they operate at
different layers:

1. **In-brain capability discovery** — how a brain knows which tools/resources
   it can expose, and to whom. Mature and in production.
2. **Cross-brain (A2A) agent discovery** — how a brain finds other brains,
   reviews them, and is allowed to call them. The manual/seeded path is shipped;
   ambient network discovery is partially shipped (see "What's coming").

---

## 1. In-brain capability discovery

A brain is assembled from plugins. There is **no dynamic registry** — plugins
are declared statically in the brain definition. "Discovery" at this layer means
capability registration at boot, plus permission-filtered listing at runtime.

### Plugins declare capabilities

Each plugin's `register()` returns a `PluginCapabilities`
(`shell/plugins/src/interfaces.ts`):

```ts
interface PluginCapabilities {
  tools: Tool[];
  resources: Resource[];
  instructions?: string;
}
```

A `Tool` carries a `visibility` field that gates who can see and call it:

```ts
interface Tool<TOutput = ToolResponse> {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (input: unknown, context: ToolContext) => Promise<TOutput>;
  visibility?: ToolVisibility; // "public" | "trusted" | "anchor"
}
```

### Registration flow

```
plugin.register() → PluginCapabilities
  → CapabilityRegistrar          (shell/plugins/src/manager/capability-registrar.ts)
      shell.registerTools(pluginId, tools)
      shell.registerResources(pluginId, resources)
      shell.registerInstructions(pluginId, instructions)
  → Shell.registerTools          (shell/core/src/shell.ts)
      → mcpService.registerTool(pluginId, tool)
```

### Listing by permission level

At runtime, tools are filtered by the caller's permission level. Default
visibility is the most restrictive (`anchor`), so a tool is private unless it
deliberately opts down to `trusted`/`public`.

- `Shell.listToolsForPermissionLevel(level)` — `shell/core/src/shell.ts`
- `McpService.listToolsForPermissionLevel(userLevel)` — `shell/mcp-service/src/mcp-service.ts`
- `canExposeTool(permissionLevel, tool)` — `shell/mcp-service/src/mcp-registration.ts`
  (defaults missing `visibility` to `anchor`)

---

## 2. Cross-brain (A2A) agent discovery

Other brains are stored as first-class **`agent` entities** and gated by an
approval lifecycle. A brain can be added three ways: by URL (manual), by an
ATProto signed card (network), or — in future — via firehose. All converge on
the same entity and the same lifecycle.

### The agent entity

`entities/agent-discovery/src/schemas/agent.ts`:

```ts
export const AGENT_ENTITY_TYPE = "agent";

export const agentStatusSchema = z
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");
```

Frontmatter fields include `brainName`, `url`, `status`, `discoveredAt`, and
optional ATProto provenance (`repoDid`, `brainDid`, `cardUri`, `cardCid`).
Stored and queried via `AgentDataSource`
(`entities/agent-discovery/src/datasources/agent-datasource.ts`), which can
filter by `status` and sorts by `discoveredAt DESC`.

### Agent Cards (the A2A wire format)

Each brain serves an Agent Card at the conventional well-known URL:

```
https://{domain}/.well-known/agent-card.json
```

Schema and parser live in `shell/plugins/src/a2a/agent-card-schema.ts`
(`name`, `url`, `description`, `skills[]`, `capabilities.extensions[]`).
Fetching/parsing is `fetchAgentCard(domain, fetchFn)`
(`entities/agent-discovery/src/lib/fetch-agent-card.ts`), which derives the
well-known URL and runs `parseAgentCard()`. An optional anchor-profile extension
(`https://rizom.ai/ext/anchor-profile/v1`) carries operator identity.

### The discovered → approved → callable lifecycle

This is the heart of cross-brain discovery: **discovery never implies access.**

- **Default on discovery is `discovered`.**
  `build-agent-content.ts`: `const status = options.status ?? "discovered";`
- **Calls are gated on `approved`.** The `a2a_call` tool refuses any peer that
  isn't approved (`interfaces/a2a/src/client.ts`):

  ```ts
  if (entity.metadata["status"] !== "approved") {
    return {
      success: false,
      error: `Agent ${agentId} is discovered but not approved yet. Approve it first.`,
    };
  }
  ```

- **Approval** flips the status (via `system_update` with
  `fields: { status: "approved" }`), which the adapter syncs to frontmatter.
- **URL adds are the trusted shortcut.** When a user adds a brain by URL, the
  create interceptor (`agent-create-interceptor.ts`) creates it as `approved`
  immediately, and upgrades an existing `discovered` entry to `approved`. The
  reasoning: if you already know the URL, you've made the trust decision.

So the gate is held in exactly one place — the `a2a_call` tool — and every
discovery path feeds the same `status` field that gate reads.

### ATProto card discovery (the shipped network slice)

A brain publishes a signed `ai.rizom.brain.card` record to its PDS
(`buildBrainCardRecord` in `plugins/atproto/src/records.ts`, published via the
`atproto_publish_card` tool to record key `self`). It carries brain identity
(DID, name, role, purpose), a minimal anchor snapshot, public skills, and the
site URL.

Discovery of _other_ brains is currently **seeded, not ambient**:
`discoverBrainCards()` (`plugins/atproto/src/plugin.ts`) takes a supplied list
of repo DIDs/handles, resolves each PDS, fetches the card via
`com.atproto.repo.getRecord`, validates it against the lexicon, and emits an
`ATPROTO_BRAIN_CARD_DISCOVERED` event. The agent-directory side
(`atproto-card-events.ts`) upserts an `agent` entity from that event —
**preserving an existing `approved` status and only defaulting new entries to
`discovered`** — so a card refresh can enrich a known peer but never silently
grant it call access.

---

## What's coming

> Everything above is shipped. This section is the planned trajectory, owned by
> the plan docs cited in each bullet. Treat it as direction, not current
> behavior — and expect these plans to be deleted once they ship, so verify
> against code before relying on any of it.

- **Ambient network discovery** — `docs/plans/atproto-integration.md`, Phase 4.
  The shipped slice only discovers from _supplied_ repo DIDs. The remaining
  targets add **Jetstream candidate sourcing** and a **firehose subscription**
  for ongoing brain-to-brain awareness, plus **configurable discovery filters**
  (allow/deny domains, anchor DIDs, skill keywords, max cards per run). New
  firehose-sourced brains enter as `discovered`; the approval gate above is
  unchanged.
- **Signed peer identity** — `docs/plans/a2a-request-signing.md`. Replaces
  bearer-token secrets with domain-as-identity: each brain serves a JWKS at
  `/.well-known/jwks.json`, approving a peer records it in `trustedAgents` with
  a permission level, and calls are signed with RFC 9421 HTTP Message
  Signatures. Plugs into the same discovered → approved lifecycle.
- **External tool discovery (CQRS split)** — `docs/plans/mcp-external-redesign.md`.
  For external MCP clients, read tools (`search`/`get`/`list`) stay individually
  exposed and permission-filtered for composability, while writes funnel through
  a single `chat` tool. Refines the in-brain capability layer for outside
  callers.
- **Agents in the core preset** — `docs/plans/relay-presets.md`. The `agents`
  plugin is registered in the `core` preset; "agents phase 2 (ATProto
  firehose) — auto-discover peer brains" is the next named capability.
