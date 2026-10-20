# Plan: Agent tool surface consolidation

Last updated: 2026-10-20

## Status

**Implementation and measurement complete; focused behavioral evidence and legacy-name closeout remain.** Chat-only MCP basic mode shipped in `0.2.0-alpha.400` after its reintroduction gate (focused `--mcp-basic` 4/4, personal 22/22, team 40/40 on 2026-09-20). Analytics has one typed agent surface: `system_analytics`, with traffic reports replacing `analytics_query` (`0.2.0-alpha.523`); the analytics plugin registers no tools.

The chat-only MCP basic surface has met its deterministic and live-model reintroduction gates. Canonical protocol acceptance proves the replacement path, focused basic-MCP evals prove live routing and exact note fidelity, and clean personal/team release-candidate runs prove the broader regression boundary.

The canonical brain now distinguishes `agentTool` exposure from `directMcpExposure`, reports its effective tool surface through the eval CLI, and filters coverage by the agent-visible set. Maintenance adapters no longer occupy model context. Playbook, directory-sync, publishing, and configured Buttondown operations use their canonical typed tools. Passkey setup is exposed to the agent only when contextually relevant, and stale registered-name references have been audited from active tests and runtime shutdown paths.

The old Rover preset snapshots and commands are historical. Current acceptance uses the canonical professional bundle composition and its personal/team eval suites.

This plan remains open for:

- the focused behavioral coverage in section 3, beyond the release-candidate suites; and
- closing legacy names (section 4): none is registered, and the unregistered `createQueueTool` (`publish-pipeline_queue`) and `createPublishTool` (`publish-pipeline_publish`) factories are removed from `plugins/content-pipeline/src/tools/`.

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
- Cloudflare traffic reaches the model only through `system_analytics` reports; no raw query tool is registered.
- Passkey setup URL retrieval is agent-visible only while setup is incomplete.

## Remaining work

### 1. Finish analytics consolidation — done

Complete the typed report registry (see [Analytics reports](../../shell/plugins/README.md#analytics-reports)), fold Cloudflare traffic reporting into it, and prove no duplicate LLM-callable analytics surface remains. Raw provider queries may remain direct-MCP-only for diagnostics.

### 2. Re-measure the canonical composition — done

The earlier 20-tool and 20% reduction targets remain reference budgets, not permission to remove a tool that a current product path needs.

#### Measurement, 2026-10-20

Measured at `cf78a2e7f5` with `bun run eval:professional -- --tool-surface` from `packages/brain-cli`, once without and once with `--mcp-basic`. The eval composition has no Git, because `brain.eval.yaml` keeps Git disabled without the supervised Git broker, and no Buttondown or stock-photo key. No passkey is registered.

Bytes are UTF-8. A description counts as written. A schema counts as `JSON.stringify(z.toJSONSchema(z.object(inputSchema)))`. Instructions count as `AgentService.instructionsFor(level, { isAnchor: false })`, the exact string a non-guest turn sends. The initial prompt is the instructions plus that level's tool descriptions and schemas, before history or retrieved memory.

| Level   | Agent tools | Instructions | Tool descriptions | Tool schemas | Initial prompt |
| ------- | ----------: | -----------: | ----------------: | -----------: | -------------: |
| Public  |           7 |     31,185 B |           3,312 B |      6,849 B |       41,346 B |
| Trusted |          14 |     31,054 B |          12,473 B |     24,945 B |       68,472 B |
| Admin   |          26 |     31,233 B |          15,443 B |     30,111 B |       76,787 B |

`--mcp-basic` leaves every agent figure unchanged. The Anchor variant of the instructions is 106 bytes shorter at each level.

Admin tokens were counted once with the o200k_base encoding (`gpt-tokenizer` 4.1.0). The configured model, `gpt-6-luna`, is an OpenAI model. The counts cover the text; the provider's own tool framing is not included.

| Admin text                                                         | o200k tokens |
| ------------------------------------------------------------------ | -----------: |
| Instructions                                                       |        6,355 |
| Tool descriptions                                                  |        3,041 |
| Tool schemas                                                       |        6,712 |
| Tool definitions as one JSON array of name, description and schema |       10,032 |
| Instructions plus tool definitions                                 |       16,387 |

| Surface                  | Public | Trusted | Admin |
| ------------------------ | -----: | ------: | ----: |
| MCP basic                |      0 |       0 |     0 |
| MCP basic, `--mcp-basic` |      2 |       2 |     2 |
| MCP debug                |      7 |      14 |    26 |
| MCP debug, `--mcp-basic` |      9 |      16 |    28 |

The internal registry holds 26 tools, or 28 with MCP; 6 are CLI tools. Without `--mcp-basic` the bundle eval-disables the MCP interface, so nothing is direct-MCP-only and MCP debug equals the agent surface at each level. With `--mcp-basic`, `chat` (148 B description, 355 B schema) and `confirm` (119 B, 375 B) are direct-MCP-only at every level, on both basic and debug.

`playbook_manage` status for `playbookId: onboarding`, called through the tool handler on the booted eval app after seed jobs drained and serialized with `JSON.stringify`:

- before any run: 310 B;
- with an active run in its first state, `brain-identity`: 7,795 B, the same size as the `start` result. The result carries the run under both `runs` and `activeRun`, plus the current state's prompt, instructions, transitions and guidance.

Conditional differences:

| Condition                   | Effect                                                                                                                                                           | Method                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git configured              | `directory_sync` takes its git variant with `history`: description 246 → 651 B, schema 286 → 739 B. Admin grows 858 B; counts unchanged.                         | Built both variants with `createDirectorySyncTools` and the report's byte formula; the non-git variant matches the eval report. Eval cannot enable Git. |
| Passkey registered          | `auth-service_get_passkey_setup_url` (75 B, 119 B) leaves the agent surface and stays on Admin MCP debug as direct-MCP-only.                                     | Code: `getTools` in `shell/auth-service/src/auth-service-plugin.ts` sets `agentTool: false` once credentials exist.                                     |
| Buttondown configured       | Adds `newsletter_subscribers` (204 B, 896 B) to Admin agent and MCP debug. `newsletter_signup` registers with no agent or MCP exposure.                          | Eval override: placeholder `plugins.newsletter.provider` in an uncommitted edit of `brain.eval.yaml`.                                                   |
| Stock-photo key configured  | Adds `stock-photo_search` (156 B, 411 B) and `stock-photo_select` (175 B, 1,069 B) to Admin agent and MCP debug.                                                 | Same override run, placeholder `plugins.stock-photo.apiKey`.                                                                                            |
| Both providers configured   | Admin: 29 tools, 15,978 B descriptions, 32,487 B schemas, 79,698 B initial prompt. Public, Trusted and instructions unchanged.                                   | Same override run.                                                                                                                                      |
| Cloudflare configured       | No surface change. The analytics plugin registers its three traffic reports in `system_analytics` either way; Cloudflare adds live data and the beacon.          | Code: `onRegister` in `plugins/analytics/src/index.ts`; the plugin registers no tools.                                                                  |
| MCP interface enabled       | Adds `chat` and `confirm` to MCP basic and debug only.                                                                                                           | `--mcp-basic` run.                                                                                                                                      |
| Other eval-disabled members | `chat`, `web-chat`, `email`, `faq`, `webserver`, `dashboard` and `atproto` register no tools and no plugin instructions. Social media registers no tools either. | Code: none of those packages overrides `getTools` or `getInstructions` or creates a tool.                                                               |

Combining the measured parts, the git-backed professional posture with a registered passkey and no optional providers has 25 Admin agent tools, 15,773 B of descriptions, 30,445 B of schemas and a 77,451 B initial prompt.

Against the reference budgets:

- 20 tools: Admin has 26 agent tools in eval, 25 git-backed with a registered passkey, and 28 with both optional providers as well.
- 20% reduction: no pre-change serialized size was recorded, so the percentage has no measured baseline; this is the first recorded serialized size. The earlier count reference, 29 model tools on 2026-07-28, was Rover's git-backed `full` posture with `chat` and `confirm` still agent-visible, a different composition.

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
- [x] prove the MCP `chat` payload preserves the retrieved note body exactly in both agent text and structured `toolResults`;
- [x] exercise a write, confirmation, and read-back entirely through `chat` and `confirm`;
- [x] cover authenticated HTTP permission propagation alongside the canonical basic-mode surface checks; and
- [x] run the affected read, verbatim-note, write, confirmation, and follow-up behavioral evals plus the nominated full release-candidate suite with release credentials.

The eval runner now supports `--mcp-basic`, which restores the eval-disabled MCP interface, rejects any surface beyond `chat` and `confirm`, and routes every selected case through the real protocol adapter. The canonical protocol cases are `mcp-basic-verbatim-note` and `mcp-basic-write-confirm-read-back`; the verbatim case uses a byte-for-byte response criterion rather than a case-insensitive substring check.

### MCP reintroduction evidence

Live evidence was recorded on source `48b8e93aff57c56f3b4ff181aa6ab0b3676f60eb` with `gpt-5.6-luna`; full-suite quality scoring used `gpt-5.4-mini`.

| Run                                                                | Result | Saved result                    |
| ------------------------------------------------------------------ | -----: | ------------------------------- |
| Focused `--mcp-basic` read, verbatim note, write/confirm/read-back |    4/4 | `2026-09-20T17-19-20-882Z.json` |
| Personal release-candidate suite, clean full rerun                 |  22/22 | `2026-09-20T17-30-02-781Z.json` |
| Team release-candidate suite, clean full rerun                     |  40/40 | `2026-09-20T17-47-08-024Z.json` |

The first personal run had one nonpersistent update-routing miss; its focused rerun passed before the clean 22/22 full rerun. The first team run had one nonpersistent judge-only helpfulness miss; its focused rerun passed before the clean 40/40 full rerun. The final runs have zero accepted failures, so this gate no longer blocks merging the staged chat-only default.

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
