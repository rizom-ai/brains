# MCP external redesign — CQRS split (raw queries, agent-gated commands)

## Status

In progress. Work started on `feat/mcp-external-redesign`. The MCP command path is implemented through `chat`/`confirm`, the protocol server now defaults to `basic` mode (read-only tools plus `chat`/`confirm`), and `debug` preserves raw-tool exposure for authenticated/local anchor use. MCP confirmations resolve through `agent.confirmPendingAction`, and the response adapter surfaces `toolResults` plus read-your-writes handles. The stale `/api/chat` assumption has been refreshed: `/api/chat` is outside MCP scope and belongs to web-chat / remote-agent follow-up if needed.

## Background

External MCP access bypasses the brain's agent. Today the `interfaces/mcp`
transport registers individual plugin tools on the MCP server and lets the
external client's LLM orchestrate them. Read tools (`search`, `get`, `list`,
`job_status` — the only ones marked `visibility: public`) hit the
entity/job services directly, which is fine — they're read-only. But there is no
gated path for _mutations_: a write tool exposed the same way would let an
external model invoke a state change with no system prompt, no persona, and no
confirmation. The brain is a passive tool bag; the caller's model does all the
reasoning.

Every other external surface already works differently. Matrix, Discord, CLI, and
WebChat extend `MessageInterfacePlugin`
(`shell/plugins/src/message-interface/message-interface-plugin.ts`) and turn an
inbound message into `context.agent.chat(message, conversationId, { userPermissionLevel, interfaceType, ... })`
(e.g. `interfaces/discord/src/discord-interface.ts:555`). The agent runs with the
system prompt intact and orchestrates its own internal toolset, filtered to the
caller's permission level. MCP is the only external interface that skips this for
actions.

### Why CQRS

The right split is not "one tool vs many tools" — it's **command/query
responsibility segregation**, because the brain is _already_ CQRS on the data
layer:

- **Queries** (reads) are cheap, deterministic, structured, and safe to expose
  raw. They're the part an external agent composes well into its own loop —
  interleaving `search` with its own steps, parsing structured results, deciding
  what to fetch next. Routing these through the agent would add a full LLM turn,
  double the token cost, and downgrade structured data to prose for no security
  gain (retrieval needs no persona).
- **Commands** (writes/actions) need orchestration, the system prompt, and
  confirmation. They aren't enumerable as tools and must not bypass the agent.

Crucially, the command side is **already async and eventually-consistent**: writes
enqueue jobs (`shell/job-queue`), and the read model (entity DB / search index)
catches up separately. That is literally why `job_status` exists — it's the
read-your-writes bridge between the command and query models. The brain became
CQRS the moment writes went through the job queue; this plan just exposes that
split at the MCP boundary instead of hiding it.

The plumbing to do this already exists:

- The agent service filters its available tools by permission level at call time —
  `getToolsForPermission: (level) => this.mcpService.listToolsForPermissionLevel(level)...`
  (`shell/ai-service/src/agent-service.ts:341`). Gating is the
  agent's job, not the caller's.
- The agent entrypoint already exists for every message-style interface:
  `context.agent.chat(...)` and `context.agent.confirmPendingAction(...)`. MCP's
  command tools are thin adapters onto those same calls.
- The MCP interface owns only command adapters (`chat`/`confirm`); raw query
  tools continue to come from the system/plugin tool registry.
- The read tools already exist and are already `visibility: public`
  (`shell/core/src/system/entity-read-tools.ts`, `job-tools.ts`) — they _are_ the
  query side, ready to keep.

## Goal

External MCP exposure follows a CQRS split, with two explicit modes:

- **`basic`** (default, the only thing remote callers get):
  - **Query side** — the existing read tools (`search`, `get`, `list`,
    `job_status`) stay exposed raw, each marked `readOnlyHint`. Structured,
    cheap, composable. Gated only by permission level + entity visibility (no
    change to that filter).
  - **Command side** — `chat` routes the query through the brain's agent via
    `context.agent.chat(...)`, system prompt and persona intact; `confirm`
    resolves pending approvals through `context.agent.confirmPendingAction(...)`.
    This agent path is the _only_ way an external caller mutates state.
- **`debug`** (local/anchor only): the current behaviour — _all_ plugin tools
  (including raw write tools) registered on the MCP server, bypassing the system
  prompt. A development/inspection escape hatch, refused on any transport a
  remote/public caller could reach.

The three permission levels (`anchor` / `trusted` / `public`) stay as config.
They gate the query tools (which reads are visible) and gate what the agent may do
inside `chat` — they no longer carry the _whole_ command/query distinction.

## Non-goals

- **ACP (Zed Agent Client Protocol) is out of scope.** It targets a human driving
  the brain through an editor UI, with a contract built around code editing
  (diffs, file ops, terminals). The brain is a knowledge/content agent, so that
  contract doesn't fit. Because `chat`, A2A, and a future ACP are all skins over the
  _same_ agent entrypoint, the ACP slot stays open at near-zero cost and can be
  added later without touching this design. Not built here.
- No new published `@rizom/*` package. Changes are confined to `interfaces/mcp`
  plus a small registration/marking tweak in `shell/mcp-service` and the system
  tools in `shell/core`.
- No change to the permission model or the entity-visibility filter.
  `anchor` / `trusted` / `public` and `permissionService.getUserLevel(...)` remain
  authoritative.
- Not consolidating the query tools into one polymorphic `query` tool. They are a
  small, fixed, distinctly-typed set that external LLMs select among better as
  explicit tools; entity-type variation is already handled by parameters
  (`get(type, id)`, `list(type)`), not tool count.

## Architectural decisions

### 1. Split by command/query, not by tool count

The asymmetry is deliberate and is the design: a **fine-grained typed read API**
(many explicit query tools) and a **single intelligent write funnel** (`chat`,
with `confirm` only resolving pending approvals). Reads want composability; writes want orchestration. Forcing symmetry in either
direction is wrong — consolidating reads loses structured composability;
exploding writes loses the system prompt.

### 2. The command/query axis is explicit, not proxied by `visibility`

Today `visibility` (`public` vs `anchor`) accidentally correlates with read vs
write. That's a _who-can-see-it_ axis, not a _does-it-mutate_ axis, and the
correlation won't always hold. Mark tools with MCP's standard
`readOnlyHint` / `destructiveHint` annotations (add to the `Tool` type in
`shell/mcp-service/src/types.ts`). `basic` mode exposes read-only-hinted tools raw
and routes commands through `chat`/`confirm`. `visibility` continues to do its
separate job (which reads a given permission level may see).

### 3. One agent entrypoint; MCP needs an adapter, not a custom path

`chat`'s handler calls `context.agent.chat(...)` **verbatim** — the same method
`MessageInterfacePlugin` subclasses call (`message-interface-plugin.ts:264`,
`discord-interface.ts:555`) and that `/api/chat` calls. There is **one** agent
entrypoint (`agent.chat` + `confirmPendingAction`,
`shell/plugins/src/contracts/agent.ts:94`); every interface is a thin adapter
over it. MCP is not an exception — a custom agent path would duplicate gating that
then drifts and break the "MCP is just another message interface" thesis. Query
tools remain direct service calls. MCP becomes "a message interface for commands,
a tool server for queries."

The MCP-specific work is therefore a **response adapter**, not custom agent logic:
`AgentResponse` → MCP `ToolResponse`. `ChatContext` (`agent.ts:76`) maps almost
field-for-field from the handler's `ToolContext` (`userPermissionLevel`,
`interfaceType: "mcp"`, `channelId`; `userId` maps into `actor` — `ChatContext`
has no `userId` field). The adapter is the only
genuinely new code here; nothing in `shell/mcp-service` or `interfaces/mcp`
bridges these two types today.

### 4. Permission level rides the call

For query tools, exposure is filtered by permission level exactly as today
(`filterToolsForPermission`, `mcp-registration.ts:86`). For `chat`, the handler
reads `context.userPermissionLevel` (populated from `extra._meta` by
`mcp-registration`) and forwards it to `agent.chat`, which gates the agent's
internal tools via `listToolsForPermissionLevel`. The level is derived exactly as
today — stdio → anchor, http+auth → anchor, http no-auth → configured/public
(`interfaces/mcp/src/mcp-interface.ts:248`).

### 5. Read-your-writes is acknowledged, not hidden

Commands return an acknowledgment (an `AgentResponse`), not the written data —
classic CQRS. Because writes are async (job queue), an external agent that does
`chat("save this note")` then `search` may hit the consistency gap. The existing
`job_status` query tool is the bridge. The caller's read-your-writes handle
is likely already present: `AgentResponse.toolResults[]` carries
`{ toolName, args, jobId, data }` (`shared/contracts/src/agent-response.ts:138`),
so the write tool's result —
entity ref + `jobId` to poll — should surface to the caller **through the response
adapter** rather than via a new contract field. Only if `toolResults` proves
insufficient do we extend `AgentResponse`.

### 6. Reads are _separated_, not _trusted_

CQRS does not make queries inherently safe. A raw `search`/`get` at `public` is
only as safe as the permission level + entity-visibility filter behind it
(semantic search can still leak existence/structure). This is the _same_ guarantee
the read tools have today — no regression — but the plan claims separation of
concern, not inherent safety.

### 7. Permission level is the enforcement boundary; confirmation over MCP is advisory

Over Discord/Matrix, `pendingConfirmations` reaches a human who clicks yes or no.
Over MCP, the "user" is the caller's LLM — nothing forces it to relay a
confirmation to its human before calling back, so a careless or adversarial client
can auto-confirm. **No security claim rests on the confirmation flow at this
boundary.** What actually protects the brain is the permission level: every write
tool is `visibility: "trusted"` (create/update/generate/extract,
`entity-create-tool.ts:649`) or `"anchor"` (delete, `entity-delete-tool.ts:120`),
so a `public` caller's `chat` runs an agent that has no write tools at all. Writes
via `chat` are possible only for trusted/anchor callers — who are semi-trusted by
definition. The confirmation variant is still mapped through the adapter: it is
good UX for well-behaved clients and keeps parity with the other interfaces, but
it is a courtesy, not a guardrail.

### 8. Write-side schemas are enforced inside, not advertised outside

`basic` mode deliberately stops advertising entity schemas at the boundary: the
caller sees `chat(message)`, not `entity_create`'s zod shape. What is lost is
advertisement, not enforcement — the brain's agent still makes schema-validated
tool calls against the same shapes. The caller compensates through the query side
(`list`/`get` reveal what types exist and their real shape) and through the
response adapter's `toolResults` (see what the agent actually did, `get` the
entity, correct in a follow-up turn — lossy-but-verifiable). Field-level
deterministic writes are `debug`-mode or A2A territory, not this surface's job.
If external callers prove bad at NL writes, the escape hatch is advertising
entity types/shapes as a read-only MCP **resource** (or in `chat`'s description) —
restoring discoverability without restoring raw write tools.

## Design

### Query side (unchanged surface, new marking)

Keep `search`, `get`, `list`, `job_status` registered as today. Add
`readOnlyHint: true` to each (`shell/core/src/system/entity-read-tools.ts`,
`job-tools.ts`) and thread the hint through registration
(`shell/mcp-service/src/mcp-registration.ts`) so the MCP server advertises it.
`basic` mode registers exactly the read-only-hinted tools that pass the
permission-level filter.

### Command side — the `chat` tool

`createMCPTools` (`interfaces/mcp/src/tools/index.ts`) returns the command entrypoint:

```ts
{
  name: "chat",
  description:
    "Talk to the brain to make changes or get reasoned answers. Use this for " +
    "ANY change (create/update/delete) or any question needing reasoning across " +
    "content. For simple lookups, use search/get/list directly.",
  inputSchema: { message: z.string(), conversationId: z.string().optional() },
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: async (input, context) => {
    const ctx = getContext();
    const response = await ctx.agent.chat(   // the shared entrypoint, verbatim
      input.message,
      input.conversationId ?? context.conversationId, // client-supplied wins; else session id
      {
        userPermissionLevel: context.userPermissionLevel ?? "public",
        interfaceType: "mcp",
        channelId: context.channelId,
        actor: { actorId: context.userId, interfaceType: "mcp", role: "user" },
      },
    );
    return agentResponseToToolResponse(response); // the one new piece of code
  },
}
```

### conversationId — default to the transport session id (decision 6)

A client-supplied `conversationId` always wins (multi-turn threading is the
client's to control). When absent, default to the transport's session identifier so
turns within one connection share context: HTTP already mints an `MCP-Session-Id`
per session (`http-server.ts:265`); stdio is one connection = one session, so a
stable per-process id suffices. This needs a small addition — `mcp-registration.ts`
does **not** currently extract `conversationId` from `extra._meta` (it extracts
`interfaceType`/`userId`/`channelId` at `:112`), and the transports must inject the
session id into `_meta`. Scoped, mechanical, no agent change.

### Response adapter (`AgentResponse` → MCP `ToolResponse`)

The only genuinely new code. `AgentResponse` is
`{ text, toolResults[], cards[], pendingConfirmations[], usage }`
(`shared/contracts/src/agent-response.ts:153`),
shaped for chat UIs; the MCP `ToolResponse` is a tighter success/error/confirmation
union (`shell/mcp-service/src/types.ts:101`). The adapter flattens:

- `pendingConfirmations` → MCP's **native confirmation variant** of `ToolResponse`.
  The shape already exists, so the approval flow has a clean home — no invention.
- `text` → the primary text content.
- `toolResults[]` → structured content. **Confirmed sufficient** (decision 4): a
  create tool returns `data: { entityId, status, jobId }`
  (`shell/core/src/system/entity-create-tool.ts:510`), so the adapter exposing
  `toolResults` hands the caller the `entityId` to `get` and the `jobId` to poll —
  no `AgentResponse` contract change. The adapter also derives a convenience
  `readYourWrites[]` handle list and reads `jobId` from both `ToolResultData.jobId`
  and nested `data.jobId`.
- `cards[]` → UI affordances (buttons, previews) meaningless to a non-UI LLM
  caller; flatten to text or drop.
- `usage` → drop (or map to `_meta`).

### Mode selection

`interfaces/mcp/src/config.ts` gains `mode: z.enum(["basic", "debug"]).default("basic")`.
In `mcp-interface.ts` startup:

- `basic` → register the read-only-hinted query tools (permission-filtered) **plus**
  the `chat` command tool. Do not register write/anchor plugin tools externally.
- `debug` → current behaviour: full tool set at `anchor`. Reject at startup if the
  transport is `http` without auth, with a clear error.

### Approval flow

`chat`'s `AgentResponse.pendingConfirmations` maps onto the MCP `ToolResponse`
confirmation variant (above). The `confirm` MCP tool resolves it via
`confirmPendingAction(conversationId, confirmed, approvalId, context)`
(`shell/plugins/src/contracts/agent.ts:94`). This is a thin adapter over existing
agent behaviour. Per decision 7, this flow is advisory at the MCP boundary — the caller's
LLM can auto-confirm, and safety rests on the permission level, not on this
round-trip.

### Progress (deferred enhancement, not Phase 1)

`agent.chat` is fire-and-wait — it returns post-execution. Intermediate tool status
is published to the message bus (`tool:invoking` / `:completed` / `:failed`,
`shell/ai-service/src/tool-events.ts:97`), which `MessageInterfacePlugin`
subscribes to (`setupToolActivityHandler` / `handleProgressEvent`,
`message-interface-plugin.ts:434`). MCP could
forward those to `ToolContext.sendProgress`, but that is _reusing the existing bus_,
not custom agent code. The walking skeleton blocks and returns the final result;
streaming progress is a later enhancement.

### `/api/chat` follow-up (moved out of MCP scope)

Earlier drafts treated `/api/chat` as part of `interfaces/mcp`. That endpoint has
since moved out of the MCP transport; `interfaces/mcp` now intentionally returns
404 for `/api/chat` and `/api/chat/confirm`. Any remaining `/api/chat` compatibility
or remote-agent-evaluation work belongs to the web-chat / remote-agent surface, not
to this MCP external redesign. The MCP command path is `chat` + `confirm` over the
MCP tool protocol.

## Phasing (thin vertical slices)

Tests written before implementation (TDD).

### Phase 0 — Refresh stale `/api/chat` assumptions

- Tests first: MCP HTTP keeps returning 404 for `/api/chat` and `/api/chat/confirm`.
- Implement: remove `/api/chat` from MCP scope in this plan. Track any remote-agent
  compatibility work separately under the web-chat / evaluation surface.

### Phase 1 — Walking skeleton: `chat` command over stdio at anchor

- Tests first: a stdio MCP client sees the read tools **and** `chat`; calling `chat`
  returns a `ToolResponse` whose text came from `agent.chat` (assert the agent path
  ran — persona/system-prompt evidence — not a direct service hit).
- Implement: `createMCPTools` returns the `chat` tool; handler calls
  `context.agent.chat` verbatim and passes the result through
  `agentResponseToToolResponse` (text only for now). Hardcode `anchor`. Extract
  `conversationId` from `extra._meta` in `mcp-registration.ts` and inject the
  session id from each transport, so absent-conversationId calls thread per-session.

### Phase 2 — Mark and gate the query side

- Tests first: read tools advertise `readOnlyHint`; in `basic` a `public` caller
  sees only permission-permitted read tools; write tools are absent.
- Implement: add `readOnlyHint` to read tools + thread through registration;
  `basic` mode registers only read-only-hinted tools + `chat`/`confirm`.

### Phase 3 — Permission level flows into `chat`

- Tests first: `chat` at `public` runs the agent with only public-level tools; at
  `anchor`, full toolset. Assert via the forwarded level driving
  `listToolsForPermissionLevel`.
- Implement: read `context.userPermissionLevel`, forward to `agent.chat`.

### Phase 4 — Full response adapter: confirmations + read-your-writes

- Tests first: a `chat` that writes returns the MCP confirmation variant; a confirm
  resolves it via `confirmPendingAction`; the adapter surfaces the write's
  `toolResults` entry (entity ref + `jobId`) so the caller can `get`/poll it.
- Implement: complete `agentResponseToToolResponse` (map `pendingConfirmations` →
  confirmation variant, expose `toolResults` and derived `readYourWrites`); wire
  confirm path. Extend `AgentResponse` only if `toolResults` proves insufficient.

### Phase 5 — `basic` vs `debug` switch

- Tests first: `mode: "debug"` exposes raw write tools over stdio/anchor and is
  **refused** on unauthenticated http; `basic` never exposes write tools.
- Implement: `mode` config, conditional registration, startup guard.

### Phase 6 — Docs

- Update operator docs and example `brain.yaml` (modes, the `chat`/`confirm` tools,
  the read-your-writes handles, and the advisory nature of MCP confirmations per
  decision 7).

## Validation

1. In `basic`, a stdio MCP client lists the four read tools (each `readOnlyHint`)
   plus `chat`/`confirm`, and no raw write tools.
2. A raw `get`/`search` returns structured data without invoking the agent (cheap
   query path intact).
3. Any mutation requires `chat`; `chat` runs the agent with the system prompt.
   Writes are possible only at `trusted`/`anchor` (permission gating is the
   enforcement boundary, decision 7); confirmations surface via the MCP
   confirmation variant for well-behaved clients.
4. `chat` at `public` cannot perform privileged actions; at `anchor` it can —
   gating matches what Discord/Matrix produce for the same level.
5. After `chat("create …")`, the response carries the new entity's ref and a
   follow-up `get` retrieves it (read-your-writes bridge works).
6. `mode: "debug"` exposes raw write tools over stdio/anchor and is refused on
   unauthenticated http.
7. MCP HTTP keeps `/api/chat` out of scope; `/api/chat` compatibility work is
   tracked separately under web-chat / remote-agent evaluation if needed.
8. No new published package; changes confined to `interfaces/mcp`,
   `shell/mcp-service`, `shell/core`.

## Decisions

All items previously open are resolved (each verified against the code):

1. **Tool name → `chat`.** The honest name (the handler _is_ `agent.chat`); covers
   writes and reasoning-reads. Rejected `ask` (most read-flavored verb, sits beside literal
   query tools, invites routing reads to it and wasting the cheap path) and `query`
   (collides with the CQRS query side). `chat`'s one risk — reading as "casual
   conversation" — is carried by the description, which does the real routing.
2. **`job_status` stays a standalone query tool.** It's genuinely read-only
   and is the read-your-writes bridge. Folding job status into the `chat` flow would
   force an agent/LLM turn just to poll a job — defeating the cheap-query purpose
   the CQRS split exists to protect.
3. **`/api/chat` is outside MCP scope.** `interfaces/mcp` intentionally serves only
   the MCP protocol and returns 404 for `/api/chat` paths. Any remote-agent
   compatibility work for `/api/chat` belongs to web-chat / evaluation follow-up,
   not this MCP external redesign.
4. **No `AgentResponse` contract change.** Verified: a create tool returns
   `data: { entityId, status, jobId }` (`entity-create-tool.ts:510`), so the
   response adapter exposing `toolResults` already hands the caller the
   read-your-writes handle (`entityId` to `get`, `jobId` to poll). The adapter also
   derives `readYourWrites[]` and reads `jobId` from both `data` and
   `ToolResultData`'s own `jobId` field (`agent-response.ts:141`).
5. **Read-only `basic` mode rejected — the command side ships.** The strongest
   alternative was a `basic` mode with no `chat` tool at all (queries only;
   mutations via the brain's own interfaces or A2A) — simpler, no adapter, no
   confirmation bridge. Rejected because writing to the brain from external LLM
   sessions ("save this to my brain" from Claude Desktop/Code) is a required
   capability, and `chat` is the only mutation path that keeps the persona,
   validation, and job handling in the loop. Given decision 7, the value `chat`
   adds over raw write tools is _quality of mutation_ for semi-trusted callers;
   the security was always the permission level.
6. **conversationId → client-supplied wins, else the transport session id.** HTTP
   already mints `MCP-Session-Id` per session; stdio is one-connection-one-session
   (stable per-process id). Requires extracting `conversationId` from `extra._meta`
   in `mcp-registration.ts` (not done today) and injecting the session id from each
   transport — scoped, mechanical, folded into Phase 1.

## Related

- `shell/plugins/src/message-interface/message-interface-plugin.ts` — the
  `agent.chat` pattern `chat` mirrors.
- `shell/ai-service/src/agent-service.ts` — already does the permission-gated tool
  filtering the command side relies on.
- `shell/job-queue` — makes the command side async, which is what makes the
  data layer CQRS in the first place.
- `docs/plans/a2a-request-signing.md` — A2A is the brain↔brain skin over the same
  agent entrypoint; ACP would be the (deferred) editor skin.
