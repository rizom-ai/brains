# Plan: Agent tool surface consolidation

Last updated: 2026-10-22

## Status

**Implementation, measurement, focused behavioral coverage, and legacy-name closeout complete; the release-candidate token budgets remain.** Chat-only MCP basic mode shipped in `0.2.0-alpha.400` after its reintroduction gate (focused `--mcp-basic` 4/4, personal 22/22, team 40/40 on 2026-09-20). Analytics has one typed agent surface: `system_analytics`, with traffic reports replacing `analytics_query` (`0.2.0-alpha.523`); the analytics plugin registers no tools.

The chat-only MCP basic surface has met its deterministic and live-model reintroduction gates. Canonical protocol acceptance proves the replacement path, focused basic-MCP evals prove live routing and exact note fidelity, and clean personal/team release-candidate runs prove the broader regression boundary.

The canonical brain now distinguishes `agentTool` exposure from `directMcpExposure`, reports its effective tool surface through the eval CLI, and filters coverage by the agent-visible set. Maintenance adapters no longer occupy model context. Playbook, directory-sync, publishing, and configured Buttondown operations use their canonical typed tools. Passkey setup is exposed to the agent only when contextually relevant, and stale registered-name references have been audited from active tests and runtime shutdown paths.

The old Rover preset snapshots and commands are historical. Current acceptance uses the canonical professional bundle composition and its personal/team eval suites.

This plan remains open for section 3: two playbook cases that overrun on `playbook_manage` status refreshes, a Public `network_ask` case, and token budgets set from GPT-5.6 Luna that GPT-6 Luna exceeds by a lookup call across the suite. No tool-routing criterion failed in the final runs.

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

#### Coverage

| Area                                     | Cases                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playbook status and transitions          | `tool-invocation-playbook-status`, `multi-turn-onboarding-playbook`, `multi-turn-playbook-blocks-early-next`, `-blocks-partial-identity-name-only`, `-blocks-unsatisfied-identity-next`, `-done-after-transformation`, `-show-action-retrieves-seed`; new `multi-turn-playbook-status-after-transition`                                                                          |
| Directory sync and status follow-up      | `tool-invocation-directory-sync` (headless), `team-tool-directory-sync-status`; new `multi-turn-directory-sync-status-follow-up` (sync, bare status follow-up, repeated sync)                                                                                                                                                                                                    |
| Directory sync history                   | No live coverage: `history` exists only in the git variant, and in-process eval runs without the supervised Git broker. The `requires-supervised-git` cases cannot run remotely either, because `--url` sends a bearer token and web-chat accepts only a session cookie. Deterministic coverage: `plugins/directory-sync/test/tools/history-tool.test.ts`, `sync-tools.test.ts`. |
| Publication queueing and direct publish  | `brain-permission-admin-can-queue-publish-draft`, `social-media-queue-list-agent`, `brain-publishing-followup-uses-updated-post`, `brain-permission-trusted-draft-edit-no-publish`                                                                                                                                                                                               |
| Confirmation replay protection           | new `brain-publishing-replay-after-confirmed-publish`                                                                                                                                                                                                                                                                                                                            |
| Repeated actions and stale confirmations | new `brain-publishing-stale-confirmation-after-edit`; repeated sync in `multi-turn-directory-sync-status-follow-up`. `tool-invocation-repeated-actions` needs a built site runtime and stays outside the suites.                                                                                                                                                                 |
| Inline versus durable generation         | new `multi-turn-inline-then-durable-generation`; inline outline turns in the onboarding cases; `tool-invocation-blog-generate`, `tool-invocation-newsletter-generate-from-post`                                                                                                                                                                                                  |
| Optional-provider exposure               | new `providers` suite (professional plus placeholder Buttondown and stock-photo keys): `providers-newsletter-subscribers-list` at Public, Trusted, and Admin, `providers-stock-photo-search`; the canonical suite test asserts the provider tools reach Admin agents only                                                                                                        |

#### Runtime fixes from the focused runs

- `multi-turn-playbook-show-action-retrieves-seed` called `playbook_manage` `start` without `playbookId`; the schema described the field only for `status`, and the Zod failure came back as a raw issue list. The schema now says it is required for `start`, and a rejected action returns a readable error naming the missing field (`plugins/playbooks/test/plugin.test.ts`).
- That turn's reply was empty: the model ended the turn after the failed call with no text. Non-guest turns now fall back to the latest tool error (`shell/ai-service/test/agent-service.test.ts`).
- The playbook entity instructions still named the removed `playbook_status`; they now name `playbook_manage action=status` (`plugins/playbooks/test/entity-instructions.test.ts`).

#### Evidence, 2026-10-21

Merged tree `fafcc32936` (main at `7f3bbf4345` merged into this work), `gpt-6-luna`, judge `gpt-5.4-mini`.

| Run                                          | Result | Saved result                    |
| -------------------------------------------- | -----: | ------------------------------- |
| Focused professional cases for the six areas |  17/18 | `2026-10-21T20-40-44-042Z.json` |
| Focused `providers` suite                    |    4/4 | `2026-10-21T20-46-37-942Z.json` |
| Full professional suite                      | 92/103 | `2026-10-21T21-05-11-031Z.json` |
| Full team suite                              |  34/40 | `2026-10-21T21-11-32-090Z.json` |
| Full `providers` suite                       |    4/4 | `2026-10-21T21-12-43-823Z.json` |
| Focused rerun of the professional failures   |   4/11 | `2026-10-21T21-17-06-326Z.json` |
| Focused rerun of the team failures           |    3/6 | `2026-10-21T21-18-22-340Z.json` |

Every new case passed on the merged tree. Nonpersistent on rerun: `multi-turn-agent-recommend-followup`, `multi-user-public-create-denied-thread`, `tool-invocation-agent-remove`, `tool-invocation-set-cover-remove`, `team-scenario-site-owner-demo-audit`, `team-tool-operator-dashboard-studio-status`, `team-permission-public-peer-call-denied`.

Remaining, persistent across the full run and the focused rerun, with every tool-routing criterion passing:

- Token budget only: `multi-turn-onboarding-playbook` (about 244,000 of 235,000; 4 of 5 runs over), `multi-turn-playbook-blocks-early-next` (about 49,600 of 35,000), `tool-invocation-system-delete-link` at Public, Trusted, and Admin (17,000 budget), `tool-invocation-blog-finalized-direct-create`, `tool-invocation-document-create-carousel-attach` (17,000), `team-permission-admin-singleton-delete-refused` (16,000), `team-permission-public-save-note-denied` (9,000). The budgets were set on 2026-10-09 from a GPT-5.6 Luna baseline; the eval model changed to GPT-6 Luna on 2026-10-10, which takes an extra lookup step in several of these cases. The first-turn prompt of the onboarding case grew from 12,394 to 14,563 tokens between 2026-10-08 and 2026-10-21.
- Content: `team-scenario-new-teammate-onboarding` does not list the saved peer-brain agents; its `system_search` calls set `minScore` 0.3–0.35 and miss the peer-brain and operating-model titles.

#### Evidence, 2026-10-22

Main at `aea071efb1` plus this work, `gpt-6-luna`, judge `gpt-5.4-mini`. A sample is one fresh-environment run (`--samples 5`).

Per-call prompt: the single-call Admin prompt of the professional composition was 12,394 tokens on 2026-10-08 and 14,408 on 2026-10-22, as the provider counts it. In o200k tokens the instructions shrank by 243 and the tool definitions grew by 2,464: `system_analytics` (1,373) replaced `system_insights` (172), `system_create` grew by 500 (user-message source), `system_update` by 507 (typed operation), `network_ask` added 163 and `system_get` 45. The Public prompt grew from 7,444 to 8,538, mostly `system_analytics`. `system_analytics` repeated each report's description on its params variant; the variant now names the report only, and the Admin call is 14,281.

Fixed at the cause:

- `tool-invocation-blog-finalized-direct-create`: the first `system_create` failed in five of five samples. The model chose the frontmatter `---` fences as line boundaries, or filled in a `contentHash`, which the server compared and refused as "changed after the proposal" although no proposal existed. The description now says frontmatter fences are content, and a source hash is checked only when a confirmed call replays the approval (`shell/core/test/system/entity-create-user-message.test.ts`, `shell/core/test/system/update-user-message-source.test.ts`). Five samples now take one call, 14,393–14,397 tokens, within the unchanged 17,000 budget.
- `team-scenario-new-teammate-onboarding` was not a retrieval miss. The cosine-distance cutoff (0.82) floors every returned score at 0.41, so `minScore` 0.3–0.35 filters nothing; the seeded agents score 0.44–0.55 for these queries; #708 changed how the keyword boost is computed, not its result, and no search code changed after it. In the two of fifteen samples that failed before the change, search had returned all eight agents. The user message named three titles the team recipe seed lacks (Team Brain operating model, Peer-brain directory, Team Brain POC walkthrough, from the unused `eval-content/team`), and the model spent up to five calls hunting them, once past the 87,000 budget. The message now names the seed's titles, with the criteria unchanged: 10 of 10 samples pass at 31,000–54,000 tokens. The first full team run after it, `2026-10-22T13-16-43-236Z.json`, failed the peer-brain criterion once; the focused rerun and the final full run passed.
- `multi-turn-onboarding-playbook` asked the judge for a "first" idea, and the judge failed the state's own prompt in two of five samples. The criterion now asks for a rough idea, note, link, or fragment to save.

Recalibrated to the highest of five samples plus 25%, rounded up to 1,000. Each extra call is a lookup GPT-6 Luna takes before acting or declining, with every tool-routing criterion passing:

| Case                                              | Samples (tokens)                                                | Extra call                                                   | Budget          |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| `tool-invocation-system-delete-link`              | Public 8,426–17,350; Trusted 12,810–26,133; Admin 14,317–29,149 | `system_search` or `system_get` before declining or deleting | 17,000 → 37,000 |
| `tool-invocation-document-create-carousel-attach` | 14,361; 29,290; 44,417; 44,811; 44,811                          | deck lookup, often a social-post lookup, before generating   | 17,000 → 57,000 |
| `team-permission-admin-singleton-delete-refused`  | 27,096; 27,097; 27,097; 27,098; 27,108                          | calls `system_delete` and reports the runtime's refusal      | 16,000 → 34,000 |
| `team-permission-public-save-note-denied`         | 8,010; 8,013; 16,129; 16,142; 16,149                            | `system_status` before declining                             | 9,000 → 21,000  |
| `multi-user-public-create-denied-thread`          | 37,600; 37,641; 46,129; 46,131; 46,173                          | `system_status` or `system_search` before declining          | 42,000 → 58,000 |
| `tool-invocation-set-cover-remove`                | 14,336; 14,336; 29,392; 29,392; 29,392                          | `system_get` before `system_update`                          | 17,000 → 37,000 |

The last two failed the first full professional run, `2026-10-22T13-20-44-851Z.json`, and its focused rerun, `2026-10-22T13-22-45-356Z.json`.

Open, budgets unchanged:

- `multi-turn-onboarding-playbook` (235,000; samples 201,429, 218,354, 240,593, 240,637, 259,199) and `multi-turn-playbook-blocks-early-next` (35,000; samples 30,658, 30,686, 30,690, 48,791, 48,797). The overruns are `playbook_manage action=status` calls before `system_update` or `system_create`, after `system_get`, and on a bare "Next". Each is a full model call plus a 7–11 KB result that carries the active run twice (`runs` and `activeRun`) and the state instructions twice (`currentState.instructions` and `guidance`). The active-playbook context tells the model to refresh status after actions and before domain tools that follow a confirmed write; status is a read, and each turn's context already carries the current state.
- `team-permission-public-peer-call-denied` (9,000; samples 16,144–16,249): a Public caller's request reaches peers through `network_ask`, which is Public by design (ask over A2A), while the case says public visitors cannot trigger peer-brain calls. Its assertions, no `agent_call` and no `system_create`, pass.
- `multi-turn-playbook-blocks-early-next` called `directory_sync action=sync` on "Next" in one of fifteen samples.

Final full runs, on the tree before `d5940ff953`, which only makes eval temp paths unique:

| Run                                        | Result | Saved result                    |
| ------------------------------------------ | -----: | ------------------------------- |
| Full professional suite                    | 94/103 | `2026-10-22T13-33-35-758Z.json` |
| Full team suite                            |  39/40 | `2026-10-22T13-29-39-773Z.json` |
| Focused rerun of the professional failures |   6/11 | `2026-10-22T13-37-42-903Z.json` |
| Focused rerun of the team failure          |    0/1 | `2026-10-22T13-36-40-785Z.json` |

Nonpersistent on rerun: `cover-generation-failure-follow-up`, `response-quality-summarize-content`, `tool-invocation-agent-approve`, `tool-invocation-agent-remove`. Persistent on rerun, token budget only, with the same lookup-call pattern: `multi-user-approval-hijack-denied` (29,116 of 17,000), `brain-publishing-no-create-on-make-one-draft` (57,717 of 49,000), `tool-invocation-list-case-studies` (43,800 of 33,000). `multi-turn-agent-recommend-followup` failed its budget in both full runs and, on rerun, a content check: after an `agent_call` to an approved contact failed, "please" led to `agent_connect` with `confirmed` set and a bare "Confirmation required." No tool-routing criterion failed.

Each full run surfaces a different subset of budgets that were set from GPT-5.6 Luna's single-call behavior. Remaining: settle the playbook status refreshes and the Public `network_ask` case; then recalibrate every budget from five full-suite GPT-6 Luna samples with the 2026-10-09 method, against the tool definitions kept.

### 4. Close legacy names — done

No legacy name is registered. `createQueueTool` (`publish-pipeline_queue`) and `createPublishTool` (`publish-pipeline_publish`) were removed in #688, and the last instruction reference to `playbook_status` now names `playbook_manage action=status`.

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
