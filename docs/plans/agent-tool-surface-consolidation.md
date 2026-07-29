# Plan: Agent tool surface consolidation

## Status

In progress. Phase 1 audience-boundary work has started, Phase 0 now has an eval CLI surface report plus agent-specific coverage filtering, and Phase 2 has removed the two maintenance tool registrations while retaining their automatic/direct service paths and adding positive agent-directory scan coverage. Preset snapshots and lifecycle consolidation phases remain. The measured reference is Rover's current `full` personal-publishing posture. The implementation should land at the shared tool-registry and capability-package boundaries so the result also applies to the unified brain and its future `core`, `site`, and `publishing` bundles.

## Context

The runtime currently uses one MCP service registry for several different consumers:

- the brain agent's LLM tool set;
- MCP basic and debug protocol surfaces;
- CLI-backed tools;
- API routes and internal plugin dispatch.

Tool visibility filters by caller permission, but there is no separate audience boundary. As a result, interface adapter tools and operator maintenance tools can enter the model's tool set even when they are not useful conversational actions. Normal full mode also differs from eval mode because Rover disables MCP, analytics, and other side-effecting capabilities during eval.

The full-preset inventory measured on 2026-07-28 is:

- 26 tools in `bun run eval:full:coverage`;
- 27 in git-backed full eval execution, where conditional `directory-sync_history` is present;
- 29 in normal git-backed full mode after MCP registers `chat` and `confirm`;
- up to 35 when Cloudflare Analytics, Buttondown, and Unsplash provider tools are configured.

The 191-case full eval used 24 distinct tool names. The coverage report found no assertions for:

- `agent_scan_directories`;
- `content-pipeline_ensure-assets`;
- `obsidian-vault_sync-templates`.

It also marked `directory-sync_history` stale even though the full eval invoked it, showing that coverage boot does not reproduce the git-backed runtime composition exactly.

The latest full eval passed 186/191 cases. Tool-surface symptoms among the failures include:

- an explicit playbook status request answered without the consolidated `playbook_manage` status action;
- an inline playbook transformation incorrectly routed through durable `system_generate` and confirmation;
- repeated playbook status calls returning very large definitions, state, evidence, and guidance payloads.

This is not a reason to collapse every tool. The core read and mutation boundaries are well exercised and encode meaningful safety and intent distinctions. The work should remove audience leakage, hide maintenance operations, and consolidate only coherent lifecycle namespaces.

## Goals

1. Give the brain agent a deliberate tool surface independent of MCP, CLI, API, and internal registration.
2. Reduce the normal git-backed personal-publishing agent surface from 29 tools to 20 before optional provider tools.
3. Preserve caller permissions, confirmation semantics, actor attribution, cancellation, and side-effect metadata.
4. Ask case-by-case before retaining legacy compatibility aliases or migration shims.
5. Consolidate playbook, directory-sync, and publishing lifecycle actions behind typed discriminated unions.
6. Keep tool schemas specific enough for reliable model selection; count reduction alone is not success.
7. Make tool coverage reproduce normal and eval compositions and distinguish agent coverage from protocol coverage.

## Non-goals

- Combining `system_search`, `system_get`, and `system_list` into one generic query tool.
- Combining `system_create`, `system_generate`, `system_update`, and `system_delete` into generic CRUD.
- Removing the underlying maintenance, protocol, or provider functionality.
- Changing entity-action permission policy or confirmation requirements as part of namespace consolidation.
- Reimplementing the typed analytics work already covered by [System analytics tool](./system-analytics-tool.md).
- Completing brain-model unification; this plan must remain compatible with that work rather than depend on its final package move.

## Target model-facing surface

The stable base target is 20 tools:

### Shared system tools — 11

- `system_search`
- `system_get`
- `system_list`
- `system_create`
- `system_generate`
- `system_update`
- `system_delete`
- `system_extract`
- `system_job_status`
- `system_status`
- `system_analytics` after the existing analytics plan; `system_insights` until then

### Agent network — 4

- `agent_call`
- `agent_connect`
- `agent_scan_directories`
- `agent_set_trust_level`

`agent_scan_directories` remains model-facing. The daily recurring scan provides automation, but it does not replace the legitimate explicit intent to refresh the agent network now. Add a behavioral eval for that intent and revisit exposure only if product usage shows the manual action is unnecessary.

### Capability lifecycle — 5

- `auth-service_get_passkey_setup_url`
- `publishing_manage`
- `directory_sync`
- `playbook_manage`
- `site-builder_build-site`

The passkey tool should eventually be contextually exposed only while setup is required, producing a steady-state base of 19. Optional configured capabilities may add:

- `newsletter_subscribers`;
- `stock-photo_search`;
- `stock-photo_select`.

Cloudflare traffic should add no separate model tool once it is represented through `system_analytics`. The resulting configured maximum is 23, or 22 after contextual passkey exposure.

## Settled design decisions

### Tool registration and agent exposure are separate contracts

Extend `Tool` metadata with an explicit audience contract, conceptually:

```ts
type ToolAudience = "agent" | "protocol";

interface Tool {
  audiences?: ToolAudience[];
  // Existing visibility, sideEffects, annotations, cli, schemas, handler...
}
```

For backward compatibility, omitted `audiences` initially means both `agent` and `protocol`. CLI exposure remains controlled by existing `tool.cli` metadata; API and internal message-bus dispatch continue to resolve registered tools independently of audience.

Add explicit registry views rather than filtering ad hoc:

- `listAgentToolsForPermissionLevel(level)` — audience `agent` plus permission;
- protocol registration — audience `protocol` plus current basic/debug and permission policy;
- `getCliTools()` — existing CLI metadata;
- `listTools()` — complete internal registry for diagnostics and dispatch.

`AgentService` must build `BrainAgent` only from the agent-specific view. MCP protocol registration must continue to use the protocol-specific view.

### Compatibility aliases are case-by-case

Do not keep legacy names by default when lifecycle tools are consolidated. Ask case-by-case whether any supported protocol, CLI, or external consumer needs a compatibility shim; if not, remove the old registered tools outright.

Evals and agent instructions migrate to canonical names immediately so legacy names never inflate the model surface.

### Core entity tools stay separate

Keep read and mutation tools separate because they carry different intent, visibility, and confirmation semantics. In particular:

- `system_create` persists supplied material;
- `system_generate` creates durable generated content or artifacts;
- inline transformations are responses, not durable generation;
- `system_delete` retains its isolated Admin and confirmation boundary.

Do not merge `system_generate` further. Instead, shorten its repeated prose, retain the typed operation union, and add contextual suppression where an active workflow explicitly requires an inline response.

### Consolidated tools use discriminated unions

Each consolidated tool has a strict action discriminator and action-specific schema. Avoid a loose `{ action: string, args: Record<string, unknown> }` contract.

Confirmation responses must return the canonical consolidated tool name and frozen canonical action arguments. Existing confirmation token, content-hash, expiry, and replay protections remain in force.

## Phases

### Phase 0 — Reproducible inventory and budgets

1. Add a tool-surface report that boots a selected brain composition and prints:
   - complete internal registry;
   - agent tools at Public, Trusted, and Admin levels;
   - MCP basic/debug tools at each level;
   - CLI tools;
   - conditional tools and the capability that registered them;
   - serialized tool schema and description byte counts.
2. Fix tool-coverage environment preparation so git-backed configuration registers `directory-sync_history` consistently.
3. Add checked snapshots for Rover `core`, `default`, and `full` while those presets exist. Move the same assertions to unified-brain bundle compositions when model unification lands.
4. Record the pre-change Admin agent count and serialized definition size as the comparison baseline.

Exit gate: inventory and coverage agree on `directory-sync_history`, and normal full mode visibly distinguishes agent tools from protocol tools.

### Phase 1 — Audience boundary

1. Add audience metadata and registry filtering in `@brains/mcp-service`.
2. Change `AgentService` to use `listAgentToolsForPermissionLevel`.
3. Mark MCP interface adapters as protocol-only:
   - `chat`;
   - `confirm`.
4. Add tests proving:
   - the model cannot recursively call MCP `chat` or `confirm`;
   - MCP basic mode still exposes read-only tools plus `chat` and `confirm`;
   - MCP debug mode still exposes supported protocol tools according to permission;
   - CLI discovery is unchanged.

Exit gate: normal full mode no longer gives the brain agent `chat` or `confirm`, with no external MCP behavior regression.

### Phase 2 — Remove non-user maintenance tool definitions

Stop registering these operations as tools at all:

- `content-pipeline_ensure-assets`;
- `obsidian-vault_sync-templates`.

Preserve their underlying service behavior without routing it through the shared tool registry:

- publish-asset reconciliation remains automatic during publishing; if manual backfill is required, provide an authenticated operator command that invokes `PublishAssetPreflight` directly rather than registering an MCP/model tool;
- Obsidian metadata sync remains an automatic `onReady` lifecycle operation; test the lifecycle and sync service directly.

Keep `agent_scan_directories` agent-visible. It already runs as a daily recurring check, but an operator may also explicitly ask to refresh the network immediately. Add a positive behavioral eval for that request and retain the existing direct service tests.

Update coverage rules so non-tool maintenance operations are covered by unit/integration tests and no longer appear in tool coverage.

Exit gate: the two maintenance operations no longer register `Tool` definitions, their automatic paths and direct tests remain intact, and an explicit agent-network scan reliably invokes `agent_scan_directories`.

### Phase 3 — Consolidate playbooks

Introduce `playbook_manage` with a strict union:

```ts
type PlaybookManageInput =
  | {
      action: "status";
      runId?: string;
      playbookId?: string;
      lifecycle?: string;
    }
  | { action: "start"; playbookId: string; lifecycle?: string }
  | {
      action: "send-event";
      runId: string;
      event: string;
      fromState: string;
      context?: Record<string, unknown>;
    };
```

1. Reuse the existing run store, locks, evidence, goal checks, and transition methods.
2. Make status output compact by default:
   - run/playbook IDs;
   - status and current state;
   - completed states;
   - valid and blocked events;
   - unmet current-state requirements;
   - final-state indicator.
3. Do not return full markdown, parsed playbook body, all historical runs, or complete guidance unless an explicit non-agent/debug option requests it.
4. Remove `playbook_start`, `playbook_status`, and `playbook_send_event` rather than keeping compatibility aliases.
5. Migrate playbook instructions and eval assertions to `playbook_manage`.
6. Add a contextual tool rule for inline transformation states: `system_generate` remains unavailable unless the operator explicitly asks to save or persist the result.

Exit gate: the targeted onboarding and playbook evals pass repeatedly, explicit status requests always invoke `playbook_manage`, and normal status results remain compact.

### Phase 4 — Consolidate directory sync

Introduce `directory_sync`:

```ts
type DirectorySyncInput =
  | { action: "sync" }
  | { action: "status" }
  | {
      action: "history";
      entityType: string;
      id: string;
      sha?: string;
      limit?: number;
    };
```

1. Delegate to the existing sync request, status, and git history implementations.
2. Include the history branch only when git is configured; the generated union and description must reflect actual runtime capability.
3. Normalize sync operation identifiers and status output so the model does not need prose explaining that a sync job ID is not a system batch ID.
4. Ask before retaining or removing the existing three registered tool names.
5. Preserve the existing `sync` CLI command unless separately directed.

Exit gate: sync, status follow-up, and history evals use only `directory_sync`; conditional coverage is accurate with and without git.

### Phase 5 — Consolidate publishing

Introduce `publishing_manage` with actions for:

- `queue-list`;
- `queue-add`;
- `queue-remove`;
- `queue-reorder`;
- `publish`.

1. Reuse the queue manager, publication queue service, provider registry, publish executor, and current confirmation implementation.
2. Keep publish as an Admin external side effect with content-hash and expiry validation.
3. Preserve per-action entity permission checks; one tool-level visibility must not replace action-level authorization.
4. Ask before retaining or removing existing registered publishing tool names.
5. Keep publish-asset reconciliation out of the agent union.

Exit gate: queue and direct-publish evals pass through `publishing_manage`, including follow-up target reuse and confirmation replay protection.

### Phase 6 — Optional provider cleanup

1. Complete [System analytics tool](./system-analytics-tool.md), folding `analytics_query` into typed `system_analytics` reports.
2. Replace configured Buttondown tools with one `newsletter_subscribers` action union:
   - `subscribe`;
   - `unsubscribe`;
   - `list`.
3. Correct Buttondown metadata:
   - list is read-only;
   - subscribe/unsubscribe are external mutations;
   - add confirmation if product policy requires approval for mutating another person's subscription.
4. Keep stock-photo search and selection separate because selection must reference provider metadata from a prior search result.
5. Expose `auth-service_get_passkey_setup_url` to the agent only while passkey setup is incomplete; retain protocol/admin access for diagnostics.

Exit gate: configured optional providers add at most three model tools—newsletter subscribers and the two-step stock-photo flow—and analytics has no duplicate LLM surface.

### Phase 7 — Audit legacy registered names

1. Instrument or audit debug-protocol and operator usage of old tool names without logging arguments or content.
2. Document canonical replacements in release notes.
3. Ask case-by-case before keeping any protocol-only legacy adapter.
4. Delete obsolete instructions, eval assertions, and tool-name repair logic after legacy-name removal.

## Validation strategy

### Unit and integration checks

- MCP-service audience and permission filtering.
- AgentService construction from agent-only tools.
- MCP basic/debug protocol exposure.
- CLI discovery independence from agent audience.
- Strict discriminated-union validation for each consolidated tool.
- Confirmation token mismatch, expiry, replay, and stale-content tests.
- Action-level permission tests at Public, Trusted, and Admin levels.
- Conditional directory history schema with and without git.
- Compact playbook status result tests.
- Provider side-effect annotation tests.

### Eval checks

Migrate affected assertions and run targeted suites first:

- all playbook and Rover onboarding cases;
- directory sync status/history cases;
- publication queue and direct publish cases;
- repeated-action and confirmation cases;
- `system_generate` inline-versus-durable transformation cases.

Then run:

```bash
cd brains/rover
bun run eval:core:coverage
bun run eval:default:coverage
bun run eval:full:coverage
bun run eval:full
```

Coverage success means:

- every agent-visible tool has a positive behavioral assertion or an explicit justified exemption;
- protocol-only tools are not reported as missing agent assertions;
- no assertion references a tool absent from the tested composition;
- normal-mode surface snapshots separately cover MCP adapter registration.

Because model evals are stochastic, any newly failing affected case gets at least two focused reruns before classification. No phase may add a persistent tool-routing regression.

### Size and latency checks

Track before and after:

- Admin model-facing tool count;
- serialized schemas and descriptions;
- initial prompt tokens for representative core/default/full turns;
- playbook status result tokens;
- average tool calls and duration in the full eval.

Final exit targets:

- 20 base agent tools in normal git-backed personal-publishing composition;
- at least 20% reduction in serialized model tool definitions;
- no `chat`/`confirm` recursion path;
- no duplicate analytics tool;
- compact playbook status by default;
- full eval pass rate no worse than the pre-change baseline, with all affected routing cases green.

## Migration and release safety

- Land audience filtering before any temporary legacy adapter so old names cannot re-enter the model set.
- Migrate one lifecycle namespace per release: playbooks, directory sync, then publishing.
- Keep business logic behind existing services; canonical tools and any explicitly approved legacy adapters are adapters only.
- Update generated docs, feature overview tool tables, eval fixtures, and changelogs in the same release as each canonical tool.
- Do not silently remove a CLI command or MCP basic capability.
- A phase can roll back by restoring the prior agent audience while leaving the shared service implementation unchanged.

## Risks

- **Union complexity:** fewer tool names can still produce a larger or less reliable schema. Size and routing evals gate every consolidation.
- **Confirmation identity:** changing tool names can break pending confirmations across a deploy. Do not guarantee replay of pre-deploy pending confirmations; fail them clearly and request fresh approval.
- **Plugin registration order:** conditional action variants must be assembled only after capability registration is complete.
- **Protocol compatibility:** debug MCP consumers may call old names. Ask whether each old name needs a temporary adapter or can be removed outright.
- **Eval/runtime drift:** eval-disabled interfaces can hide production-only agent leakage. Normal-mode surface snapshots are mandatory.
- **Model-unification overlap:** preset names are temporary. Put implementation in shared registries and capability packages, and move only composition fixtures when bundles replace presets.

## Completion criteria

This plan is complete when:

1. agent, protocol, and CLI surfaces are independently enumerable and tested;
2. normal full mode exposes the 20-tool base target to the model;
3. MCP `chat` and `confirm` are protocol-only;
4. publish-asset reconciliation and Obsidian metadata sync are no longer tools, while `agent_scan_directories` remains agent-visible and behaviorally covered;
5. playbooks, directory sync, and publishing each have one canonical model tool;
6. analytics and Buttondown no longer create duplicate or fragmented model surfaces;
7. affected targeted evals are green and the full eval does not regress;
8. legacy registered names are either removed or intentionally retained after a case-by-case decision.
