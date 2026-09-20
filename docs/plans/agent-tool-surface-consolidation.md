# Plan: Agent tool surface consolidation

Last updated: 2026-09-20

## Status

**Implementation substantially complete; analytics and final eval closeout remain.**

MCP `basic` mode is now the teammate surface: it advertises only `chat` and `confirm`, while raw tools remain available to Admin operators in `debug` mode. Tools must explicitly opt into `basic`; omitted `directMcpExposure` defaults to `debug`.

The canonical brain now distinguishes `agentTool` exposure from `directMcpExposure`, reports its effective tool surface through the eval CLI, and filters coverage by the agent-visible set. Maintenance adapters no longer occupy model context. Playbook, directory-sync, publishing, and configured Buttondown operations use their canonical typed tools. Cloudflare query is direct-MCP-only, passkey setup is exposed to the agent only when contextually relevant, and stale registered-name references have been audited from active tests and runtime shutdown paths.

The old Rover preset snapshots and commands are historical. Current acceptance uses the canonical professional bundle composition and its personal/team eval suites.

This plan remains open for:

- completing [system-analytics-tool.md](./system-analytics-tool.md) so analytics has one typed agent surface;
- recording final tool-count/schema-size evidence on the nominated composition;
- rerunning affected behavioral evals and the full release-candidate eval without a routing regression; and
- deciding case by case whether any old direct-MCP registered name is retained or removed.

## Goal

Keep three independently enumerable surfaces:

1. tools the model may call during a conversation;
2. tools direct MCP clients may call; and
3. CLI/maintenance operations that are not model tools.

Reduce model context without hiding useful capability, weakening authorization, moving business logic into adapters, or silently breaking a supported protocol client.

## Shipped surface

- MCP `basic` mode advertises only the `chat` and `confirm` protocol adapters; raw tools remain on the Admin-only `debug` surface.
- Publish-asset reconciliation and Obsidian metadata sync run through their automatic/maintenance paths rather than registered model tools.
- `agent_scan_directories` remains agent-visible and behaviorally covered.
- Playbook lifecycle actions use `playbook_manage`.
- Directory synchronization, status, and history use `directory_sync` with composition-aware variants.
- Publication queueing and direct publication use `publishing_manage`, retaining confirmation and target-reuse rules.
- Configured Buttondown subscriber actions use `newsletter_subscribers`.
- Stock-photo search and selection remain separate because selection must bind prior provider metadata.
- Cloudflare's raw query remains available only to Admin operators through debug MCP.
- Passkey setup URL retrieval is agent-visible only while setup is incomplete.

## Remaining work

### 1. Finish analytics consolidation

Complete the typed report registry in [system-analytics-tool.md](./system-analytics-tool.md), fold Cloudflare traffic reporting into it, and prove no duplicate LLM-callable analytics surface remains. Raw provider queries may remain debug-MCP-only for diagnostics.

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

## Invariants

- Permission and agent/protocol exposure are separate checks.
- Omitted `directMcpExposure` defaults to `debug`; basic exposure is always an explicit opt-in.
- A consolidated discriminated union enforces action-level authorization and confirmation.
- Business logic stays in existing services; tools remain adapters.
- CLI commands and supported direct-MCP capabilities are not removed silently.
- Conditional variants are assembled only after capability registration is complete.
- Compact defaults do not hide full diagnostic output from an explicitly authorized debug path.

## Validation

- registry enumeration and permission/exposure filtering;
- agent construction from agent-visible tools only;
- exact `chat`/`confirm` MCP basic snapshots and unchanged debug protocol snapshots;
- strict action-union validation and side-effect annotations;
- confirmation mismatch, expiry, replay, and stale-content tests;
- conditional directory/provider schemas;
- compact-result checks; and
- focused plus full canonical evals.

## Completion

Delete this plan after analytics has one model surface, final canonical measurements and evals are recorded, the chat-only basic MCP surface is validated on the release candidate, and every legacy registered name has an explicit disposition.
