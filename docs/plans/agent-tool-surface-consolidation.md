# Plan: Agent tool surface consolidation

Last updated: 2026-09-20

## Status

**Implementation substantially complete; live model eval and final release closeout remain.**

The chat-only MCP basic surface is staged for reintroduction but is not release-approved. Canonical protocol acceptance now proves the replacement path deterministically; merging remains blocked until the affected live behavioral evals and nominated release-candidate suite are green.

The canonical brain now distinguishes `agentTool` exposure from `directMcpExposure`, reports its effective tool surface through the eval CLI, and filters coverage by the agent-visible set. Maintenance adapters no longer occupy model context. Playbook, directory-sync, publishing, and configured Buttondown operations use their canonical typed tools. Cloudflare query is direct-MCP-only, passkey setup is exposed to the agent only when contextually relevant, and stale registered-name references have been audited from active tests and runtime shutdown paths.

The old Rover preset snapshots and commands are historical. Current acceptance uses the canonical professional bundle composition and its personal/team eval suites.

This plan remains open for:

- completing [system-analytics-tool.md](./system-analytics-tool.md) so analytics has one typed agent surface;
- recording final tool-count/schema-size evidence on the nominated composition;
- rerunning affected behavioral evals and the full release-candidate eval without a routing regression;
- recording those live-model results before merging the staged chat-only basic surface; and
- deciding case by case whether any old direct-MCP registered name is retained or removed.

## Goal

Keep three independently enumerable surfaces:

1. tools the model may call during a conversation;
2. tools direct MCP clients may call; and
3. CLI/maintenance operations that are not model tools.

Reduce model context without hiding useful capability, weakening authorization, moving business logic into adapters, or silently breaking a supported protocol client.

## Shipped surface

- MCP `chat` and `confirm` are protocol adapters, not recursive model tools.
- Publish-asset reconciliation and Obsidian metadata sync run through their automatic/maintenance paths rather than registered model tools.
- `agent_scan_directories` remains agent-visible and behaviorally covered.
- Playbook lifecycle actions use `playbook_manage`.
- Directory synchronization, status, and history use `directory_sync` with composition-aware variants.
- Publication queueing and direct publication use `publishing_manage`, retaining confirmation and target-reuse rules.
- Configured Buttondown subscriber actions use `newsletter_subscribers`.
- Stock-photo search and selection remain separate because selection must bind prior provider metadata.
- Cloudflare's raw query remains available only to Admin debug-MCP clients.
- Passkey setup URL retrieval is agent-visible only while setup is incomplete.

## Remaining work

### 1. Finish analytics consolidation

Complete the typed report registry in [system-analytics-tool.md](./system-analytics-tool.md), fold Cloudflare traffic reporting into it, and prove no duplicate LLM-callable analytics surface remains. Raw provider queries may remain direct-MCP-only for diagnostics.

### 2. Re-measure the canonical composition

For the current git-backed professional posture, record:

- Admin agent-visible tool count;
- serialized schemas/descriptions and initial prompt tokens;
- playbook status result size;
- direct-MCP-only tool inventory; and
- any conditional differences when git or optional providers are absent.

The earlier 20-tool and 20% reduction targets remain reference budgets, not permission to remove a tool that a current product path needs.

### 3. Complete behavioral evidence

Run coverage and focused evals through the canonical `packages/brain-cli` posture scripts. Cover:

- playbook/onboarding status and transitions;
- directory sync, status follow-up, and history;
- publication queueing, direct publish, and confirmation replay protection;
- repeated actions and stale confirmations;
- inline versus durable generation; and
- configured optional-provider exposure.

Then run the full relevant eval suite against the nominated release candidate. Stochastic content misses may be classified only after focused reruns; persistent tool-routing regressions block completion.

### 4. Close legacy names

For every old registered name:

- verify whether debug MCP or operator automation still calls it without logging arguments/content;
- retain an adapter only after an explicit compatibility decision;
- otherwise remove registration, instructions, eval assertions, and repair logic; and
- document canonical replacements in release notes.

Do not guarantee replay of predeploy pending confirmations across a tool-name change. Fail clearly and request fresh approval.

### 5. Gate chat-only MCP basic mode on evidence

Before removing raw read tools from MCP basic mode:

- [x] snapshot the actual canonical basic and debug protocol surfaces at Public, Trusted, and Admin permissions;
- [x] boot a canonical brain through basic stdio MCP and prove a seeded read succeeds through `chat` while raw tools are absent;
- [x] exercise a write, confirmation, and read-back entirely through `chat` and `confirm`;
- [x] cover authenticated HTTP permission propagation alongside the canonical basic-mode surface checks; and
- [ ] run the affected read, write, confirmation, and follow-up behavioral evals plus the nominated full release-candidate suite with release credentials.

The eval runner now supports `--mcp-basic`, which restores the eval-disabled MCP interface, rejects any surface beyond `chat` and `confirm`, and routes every selected case through the real protocol adapter. The canonical write/confirm/read-back case is `mcp-basic-write-confirm-read-back`.

Do not merge or ship the chat-only default until the remaining live-model eval gate is green.

## Invariants

- Permission and agent/protocol exposure are separate checks.
- A consolidated discriminated union enforces action-level authorization and confirmation.
- Business logic stays in existing services; tools remain adapters.
- CLI commands and supported direct-MCP capabilities are not removed silently.
- Conditional variants are assembled only after capability registration is complete.
- Compact defaults do not hide full diagnostic output from an explicitly authorized debug path.

## Validation

- registry enumeration and permission/exposure filtering;
- agent construction from agent-visible tools only;
- canonical MCP basic/debug protocol snapshots at every permission level;
- strict action-union validation and side-effect annotations;
- confirmation mismatch, expiry, replay, and stale-content tests;
- conditional directory/provider schemas;
- compact-result checks; and
- focused plus full canonical evals.

## Completion

Delete this plan after analytics has one model surface, final canonical measurements and evals are recorded, and every legacy registered name has an explicit disposition.
