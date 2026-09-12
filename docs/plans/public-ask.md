# Plan: Public `/ask` and the Brain landing-page chat

## Current position

**The user reported the manual localhost `/ask` test working.** The standalone guest UI and HTTP flow are wired and tested with mocks: establish a session, ask, follow up, reload history, deliberately retry and delete an owned conversation. Independent provider/billing verification and complete live follow-up/history/deletion verification remain.

- Work remains isolated on `feat/public-ask`; nothing from this branch has been merged or deployed.
- **Use the existing `#brain-chat` hero box from `feat/rizom-brain-landing` (`9a8329cca4`). The separate panel was rejected.** Its site-design diff has been applied to this integration worktree, without merging branches or changing the original site worktree. Rejected panel work is archived in `/tmp/public-ask-rejected-panel`; it is no longer the active implementation.
- Guest access is **default-off**. The opt-in localhost test requires trusted loopback transport, a supported profile, index readiness and admission; production HTTPS admission remains default-closed.
- Implementation of the product scope is approved. Production limits, provider/spending policy, disclosures, release and deployment are **not approved**.
- Latest code commit: `1a8f8df4a3` (Brain landing/local network). Incremental snapshots were checked independently of the remaining working-tree changes, and normal commit hooks passed. The canonical same-brain browser check used synthetic providers, not paid calls.
- Committed integration uses `/api/chat/guest`, the existing Chat client/protocol, Markdown presentation and agent/conversation namespaces. New conversations require fresh admission; retries retain submission identity and pin the server locator once known. Delivery includes text and bounded search/get source cards, never action or attachment cards. The existing sources component is reused; projected citations persist in owned history and survive refresh. Raw provenance, context cards and unsafe navigation are dropped. This projection is not an authorization mechanism: public visibility still comes from the guest-scoped read tools.
- When guest policy is enabled, the configured page (default `/ask`) renders the guest presentation even for signed-in operators. Standalone authenticated Chat remains at `/ask/authenticated` (relative to the configured page); operator discovery and Inbox links point there. With guest policy off, the existing authenticated page is unchanged. Studio `/chat` is not modified.
- The UI shows provider/retention/deletion disclosures before first send, preserves visible partial replies on failure, distinguishes new conversation from confirmed deletion, and stores only conversation locators in tab-scoped session storage. Markdown images, executable HTML and unsafe links are blocked. No generation occurs on mount.
- HTTP-stage checks passed: Web Chat 295 tests, contracts and plugin suites, changed-package lint, and all 101 repository typecheck tasks. UI-stage checks pass: 304 Web Chat tests, package lint, its typecheck/build dependency graph, and docs checks; these include DOM interaction and guest/authenticated page routing. These are harness checks, not a running-app, visual-browser or real-provider demonstration.
- The elapsed-time/clock follow-up remains **paused and uncommitted**, untouched by the HTTP work. It has not been reviewed or validated as a feature; dependency typechecks are not that review. Do not resume, discard or treat it as a milestone dependency without reviewing its necessity.

This plan covers the visitor posture anticipated in Phase 5 of [Studio Chat integration](studio-chat-integration.md). The current sign-in restriction is temporary, not the intended visitor experience.

## Next milestone: a real conversation at `/ask`

**A visitor can open `/ask` without an account, send a real question, receive an answer grounded in public sources, and ask a follow-up in the same conversation in an isolated test app.**

This milestone includes safe refresh/history, owned deletion, expiry and honest failure states. It does not include the landing panel or production enablement.

Use one explicitly selected, narrowly supported provider/model and retrieval configuration first. Do not build a universal provider, proxy or recovery framework before proving this slice. Choosing the test configuration does not approve production defaults.

### Approved initial test slice

Use localhost and the canonical `packages/brain-cli` `start:personal` posture, with OpenAI-only initial live support. Connect the HTTP flow and `/ask` using mocked-agent integration tests while verifying live support. Official OpenAI documentation now confirms the configured `gpt-5.6-luna` model and published pricing. Account access was untested at the initial preflight. Canonical core wiring now installs the paired OpenAI profile for `gpt-5.6-luna`, enabled `text-embedding-3-small` indexing at 1536 dimensions, and a configured key. Guest readiness also requires a ready index. A read-only agent-namespace signal allows automatic Web Chat readiness only for an enabled loopback-HTTP policy; HTTPS deployments remain closed by default. This verifies profile selection, not a successful live provider turn. The user approved the localhost-only $2-per-turn/$4-total guest test ceiling, conditional on accounting and corpus/host verification. No authenticated provider API calls had been made at that initial gate; later runs are recorded separately.

There is no scope expansion into additional providers, production proxy frameworks, automatic recovery or clock work. The HTTP addition includes only the session/request/status DTOs and client handling needed for this flow. A trusted host readiness check defaults closed; setting it true in a mock harness does not establish production readiness.

### Configuration: conventions first

Guest access is off when omitted or set to `false`. The controlled test is one opt-in:

```yaml
plugins:
  web-chat:
    guest: local-test
```

The default origin is `http://127.0.0.1:8080`. For a different local port, use `guest: { preset: local-test, origin: "http://127.0.0.1:18180" }`. Limits, retention, disclosures and the approved $2/turn/$4 test ceiling are internal conventions, not author-facing knobs. Saved configuration stays compact; the old expanded policy block is not accepted as configuration. Full policy objects remain internal runtime/test contracts.

Local guest routes require trusted loopback socket metadata from the HTTP host. Webserver captures Bun’s `requestIP` before routing and passes it separately from the Request; missing or non-loopback peers fail closed, regardless of Host, Origin or forwarding headers. Other hosts must supply trusted transport context to serve local guest routes. Bind the test webserver to loopback as defense in depth. Keep embeddings enabled: guest query embeddings are prepaid inside the turn cap, separately from background indexing. Runtime accounting and atomic admission still gate execution. No production preset or public-launch approval is implied.

Regression checks cover IPv4/IPv6/mapped loopback addresses, missing peers, forged forwarding headers and all guest API methods. A native wildcard-listener fixture using the real ServerManager and guest handler rejects a non-loopback TCP request with forged localhost headers (403), while a local request reaches body validation. No credentials or model calls are used by that fixture.

### Approved live-test slice — verification incomplete

**Capability advanced:** `createOpenAiGuestProfile` now couples the fixed model with non-billable conservative accounting, without a tokenizer or remote quoting service. `createBrainAgentFactory` accepts the paired profile for guests while leaving authenticated generation unchanged. Mocked tests exercise the real SDK's wire format and a two-step public-read/answer loop. This is not account-access, live billing or app-readiness verification.

The wire guard restricts the endpoint, standard tier, model, output cap, text/function inputs and three reviewed read tools; disables response storage and cache writes; rejects reference-only inputs, native provider tools/options, streaming and redirects; and checks returned processing-tier/model metadata. Requests are bounded before fetch and provider errors are sanitized. The earlier profile required an embeddings-disabled host assertion. That restriction is superseded by the bounded semantic-search accounting described below. Preflight ran through canonical `start:personal` with a nonfunctional key: the actual listener was `127.0.0.1:18180`, readiness returned 200, disabled guest admission 503 and unauthenticated MCP 401. Two operator-curated notes based on public Green Software Foundation guidance were created through normal MCP confirmations. The small corpus was inspected; embeddings remained empty and only a recurring-check job was observed. Bootstrap prompts and brain character were restricted; the public Anchor placeholder contains only `Unknown`. These observations are scoped to this isolated app, not general production proofs.

The user provisioned `AI_API_KEY` locally; its value was not displayed. The compact-preset app subsequently ran on loopback, with the paused clock changes excluded from the build and restored unchanged afterward. A real Chromium browser verified the pre-send disclosures and submitted one question. It received the agent's static “knowledge base getting ready” response, not a model answer: the semantic-index gate incorrectly blocked lexical mode before model execution or message persistence. No follow-up or retry was submitted; refresh/deletion checks were not reached. The app was stopped and the original personal posture restored.

The minimal correction is to install the semantic readiness gate only when embeddings are enabled. A regression reproduces the failure and verifies that lexical requests now reach normal validation without a provider call, while semantic mode keeps its warmup gate. Live re-verification remains outstanding. The original receipt is retained unchanged as `completed` with a $2 reservation; this is not measured provider spend or proof of a sourced answer. Do not reset it to obtain more attempts. Browser evidence for that failed first attempt is in `/tmp/public-ask-preflight.KAgIeX/browser-report.json` and `ask-result.png`.

After the readiness fix, the app was restarted at the user's request for one remaining question, with an automatic 30-minute shutdown. The user reported it working and requested immediate shutdown; port 18180 was confirmed closed. This is user-reported success, not an independently inspected answer or provider bill. The original posture was restored, the paused clock files preserved, and no further generation was submitted by the assistant. Source-card persistence, transport, projection safety and UI refresh subsequently passed mocked regressions; those changes were not part of the user's earlier browser test.

Subsequent Chromium checks used the built guest UI with fully intercepted, mocked HTTP—not a running app or provider. They verified source display, follow-up locator reuse, refresh with sources, composer focus, locator-only storage, acknowledged fixture deletion and mobile overflow. Inspection found and fixed the missing shared console stylesheet in guest HTML; colors, typography and borders now resolve from the existing theme. Evidence: `/tmp/public-ask-preflight.KAgIeX/guest-ui-browser-report.json`, `guest-sources-desktop.png` and `guest-sources-mobile.png`.

Normal same-origin tabs now serialize session opening with one browser Web Lock. Only queued acquisition is abortable; an in-flight issuance holds the lock until its response settles, even if its view unmounts. This avoids overlapping cookie installation without exposing or storing credentials in JavaScript. Unsupported browsers fail closed; no compatibility fallback or new author configuration was added. Four Chromium fixtures cover concurrent tabs, acquired/queued cancellation and missing Web Locks (`guest-locks-browser-report.json` in the same artifact directory). These checks do not establish recovery after a browser crash or an ambiguous network outcome. Server ownership and admission remain the authority.

An ambiguous first send without a received server locator now fails closed in the UI: it preserves the visible question but disables replay, including form submission. Reusing that submission after a cookie replacement could otherwise create a new visitor-scoped turn. A known locator remains mandatory for UI retries; replacement credentials cannot read, delete or rerun its in-flight conversation. Regression tests and a Chromium fixture cover these cases without generation or state resets. This is deliberate non-recovery, not a claim that lost credentials can be restored.

The existing 255-second host timeout covers the 90-second turn lifetime. Guest HTTP now closes its idle wait at the policy limit without treating cancellation as remote completion; a regression covers ignored cancellation and late fulfillment. Guest instructions now advise short literal search phrases after preflight exposed the lexical fallback's phrase-matching behavior.

Activation regressions pass: all 101 repository typecheck tasks and 99 test tasks, plus changed-package lint. The real-SDK wire checks run in a child process within the ordinary suite because existing AI service tests replace provider modules process-wide. Full working-tree regressions include the untouched paused clock files; this is not review or approval of that patch.

Official references reviewed:

- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna): 1,050,000-token context window; standard short-context prices are $0.20/M input, $0.25/M cache writes, and $1.20/M output. Long-context prices are $0.40/M input, $0.50/M cache writes and $1.80/M output.
- [Pricing](https://developers.openai.com/api/docs/pricing): Fast mode and regional processing can cost more. Do not assume the account's default tier is standard.
- [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create): omitted `service_tier` uses project settings; omitted `store` defaults to true. The installed SDK also honors `OPENAI_BASE_URL`. A guest-specific profile must explicitly bind the official endpoint, standard tier and `store: false`, rather than inheriting those defaults.
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): explicit-only mode without breakpoints does not use caching or create cache writes. The proposed profile must enforce this on the actual outgoing request, not merely claim it in its quote.
- [Counting tokens](https://developers.openai.com/api/docs/guides/token-counting): the counting endpoint includes structural/tool overhead; output caps include non-visible tokens. Its billing has not been established here, so it is **not** being used as a purportedly free preflight.

Approved controlled test (the runtime/host prerequisites below are still mandatory):

1. Keep canonical `gpt-5.6-luna`, on localhost `start:personal`, using only a bounded, inspected public-source corpus in an isolated app. Keep embeddings enabled. Every guest search reserves one query embedding from its turn budget; background indexing requires its own allowance. Verify loopback binding, startup/background work and corpus work bounds before any paid call.
2. Implement and install one OpenAI-specific guest profile, not a general provider framework (implementation, mocked SDK checks and canonical same-brain activation with synthetic providers are verified; live acceptance remains separate): fixed official endpoint, standard tier, response storage disabled, cache writes disabled, no native provider tools or retries. Verify the actual SDK HTTP payload with mocked fetch before enabling it. `store: false` does not promise deletion of abuse-monitoring records or other provider retention.
3. Quote each call conservatively at the full documented 1,050,000-token context ceiling, using long-context input/output prices. With cache writes disabled, a call allowing 1,200 output tokens reserves at most `1,050,000 × $0.40/M + 1,200 × $1.80/M = $0.42216`. Three calls reserve at most **$1.26648 per turn**, before rounding up to the proposed admission ceiling. Each semantic search additionally reserves **164 microUSD ($0.000164)**: the full 8192-token embedding input ceiling at $0.02/million, rounded up. The fixed endpoint/model/dimensions, single input and zero retries are enforced. Each SDK search execution receives a one-use, cancellation-bound embedding capability after its tool quote is charged. Missing capabilities fail closed without falling back to the shared provider. Background indexing stays on its separate provider path; this does not introduce an autonomous background spending cap or reopen its closed allowance.
4. The user approved **$2 per turn and $4 total guest-test ceiling**, enough for the first question and follow-up. Reservations deliberately overestimate expected usage; this is not a claim about measured spend. No automatic retry or budget reset to obtain additional paid attempts. Stop the test app and disable admission after the approved run; a rolling daily ledger is not permission for another day's test spend.
5. Retain the 32,000-byte model-payload guard, 4,000-character message limit, 1,200 cumulative output-token limit, three model steps/tool calls and existing bounded read transfers. The controlled test's context-token quote allowance would use the documented full-window ceiling instead of the fixture's 8,000-token allowance. These are internal local-test conventions, not new production defaults.

**Remaining milestone blockers:** independent live follow-up/history/deletion verification. Recovery after losing both credential and locator is deliberately unavailable; the UI does not replay that request. Source-card and normal tab-lifecycle browser checks pass with mocked HTTP, not a live provider. A further paid test requires fresh approval, not a budget reset. Public access remains closed. The v3 hero box has an app-managed, generation-disabled preview build; full live acceptance still needs separate verification. The clock patch and broader provider/proxy/recovery work remain out of scope.

### Delivery order

1. **Specify the supported test slice and remaining safety requirements.** Identify the provider/model, verified token/pricing bounds, capped test spend, public-source configuration and origin/hosting posture. Separate concrete blockers from improvements. Present the scope before extending shared infrastructure.
2. **Connect the guest backend through the existing Chat API.** Wire credentials, conversation ownership, atomic admission, execution and outcomes. Test the boundary with mocked providers while live-provider support is being completed; do not wait to integrate everything until every operational improvement exists.
3. **Connect standalone `/ask`.** Reuse the existing client, protocol and presentation. Verify the real question-and-follow-up flow in the selected test app. Mocked answers do not satisfy the milestone.
4. **Review the working experience and remaining launch gates with the user.** Only then proceed to the compact landing panel. Production approval remains separate.

### What is already implemented

These components and the combined synthetic-provider flow are tested; this is **not production-release approval**.

| Area                | Implemented                                                                                                                                             | Remaining integration or limitation                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Architecture        | Existing Web Chat, Chat contracts/client, agent runtime, entity service and scheduler are reused.                                                       | Guest API and standalone UI are wired; live-host/browser verification remains.                                           |
| Guest isolation     | Distinct server-owned guest scope; public-only context; fixed read-tool allowlist; no operator tools, approvals, uploads or automatic memory ingestion. | Verify these boundaries through real HTTP requests and the final composition.                                            |
| Ownership           | Opaque, digest-backed visitor credentials; guest conversation ownership; authenticated and guest scopes separated.                                      | Owner binding and UI transport are harness-tested; verify canonical host and browser lifecycle.                          |
| Admission           | Atomic request/concurrency/turn/spend reservations; deduplication; shared policy/kill switch; restart persistence.                                      | Fresh reservations alone execute through HTTP; actual provider cost remains unverified.                                  |
| Credential capacity | Atomic issuance rate/storage caps across shared-store replicas and origins; conservative handling of uncertain writes and deletes.                      | Transport abuse controls, recovery procedure and final credential-lifecycle policy.                                      |
| Retention           | Pinned expiry, expiry-aware reads/writes, deletion-race protection and scheduled cleanup with health reporting.                                         | Owned deletion and delivery-time rechecks are wired. Operational backlog/admission verification and deletion SLA remain. |
| Runtime limits      | Input/context/output/tool/cost guards, cancellation signals, no guest model retries or native provider-streaming bypass.                                | Canonical profile selection is wired/tested, not live-verified. Uncertain work stays reserved.                           |
| Retrieval           | SQL result-count and stored-row byte guards; bounded lookup paths; no image expansion; cancellation propagation and reduced diagnostics.                | SQL engine scans/allocations, adapter execution and embedding/retry costs are not fully bounded or verified.             |

### Required for the first test milestone

- [ ] Select and document the supported provider/model and test spending ceiling. Verify actual token, output, tool/embedding and retry costs fit reservations. Unsupported configurations must remain unavailable.
- [ ] Establish adequate retrieval-work bounds for the selected public-source configuration, including the database and adapters. Result-size limits alone are insufficient.
- [x] Wire same-origin guest issuance and request discrimination without browser-role or forwarded-header authority; covered in the HTTP harness. Final loopback host verification remains part of the running-app check.
- [x] Mint conversations on the server; authorize guest history, sends, retries and deletion. Signed-in authority does not upgrade the guest surface in the harness.
- [x] Execute only fresh reserved leases. Duplicate submissions return validated status/locator, retained by the shared client for history recovery, rather than another generation.
- [ ] Finish transport verification: remaining live partial/disconnected delivery checks. Source-card browser inspection passes with mocked HTTP. Bounded source cards, owned-history restoration, idle handling and ownership/expiry rechecks have regression coverage. Native provider streaming remains unavailable.
- [x] Wire settlement only on fulfilled runtime completion. Empty fulfilled responses settle as failed; rejected or unacknowledged work remains reserved. Provider failures, aborts and deletion races are harness-tested without refund/cancellation promises.
- [x] Expose the fixed visitor expiry and configured disclosures through the session contract. Refresh does not renew the credential. UI expiry presentation is still required below.
- [ ] Complete `/ask` acceptance in a running browser. Core states and controls are implemented and DOM-tested, including safe Markdown, refresh, fixed-expiry blocking, preserved partial replies, deliberate retry, and distinct new/delete actions. Visual/mobile/keyboard review and full browser-to-runtime composition remain.
- [ ] Verify a real public-source answer, follow-up, refresh and owned deletion in the running canonical test app, plus isolation and failure tests.

### Required before unattended public launch

These are not waived by the test milestone. They need a concrete solution for the chosen deployment, not necessarily a generalized subsystem.

- Approve exact provider/spend, request, concurrency, issuance, retention and timeout policy, together with provider/deletion disclosures.
- Validate the actual HTTPS/origin/proxy posture, network-level abuse controls and production identity isolation.
- Verify cleanup throughput and admission behavior when maintenance or storage is unhealthy. Specify backup, provider and security-log retention limitations.
- Resolve the production credential activity/rotation policy. Expired credentials have regression coverage, and normal first-session tab races have native Chromium coverage. Verify cookie loss during an ambiguous first send and crash/navigation behavior without weakening ownership. UI retry requires a known conversation locator. Without one, it preserves visible text and disables replay; recovering both a lost credential and lost first response is deliberately unsupported.
- Specify a verified operational recovery procedure for uncertain execution/credential work and anomalous state. Recovery must not reset usage or release work merely because time passed.
- Verify the kill switch and already-running work behavior, authenticated Chat regressions, operational visibility and rollback.
- Obtain explicit experience, release and deployment approval. Passing tests is not that approval.

### Later hardening and explicitly deferred work

Do not turn these into first-milestone prerequisites without identifying a concrete safety or acceptance failure and explaining the scope change.

- More provider/model combinations and additional deployment/proxy topologies.
- Automatic reconciliation beyond the verified recovery procedure required for launch.
- More elaborate credential renewal/recovery UX beyond the chosen policy.
- Cleanup throughput optimizations, richer operational dashboards and broader scale testing beyond the selected deployment's requirements.
- Additional timing abstractions. Review the paused clock patch against the chosen runtime's actual deadline requirements before deciding whether to keep it.
- Landing-panel integration: a separate product milestone after standalone `/ask` works, not a substitute for it.

No item here permits weakening public-only access, ownership, cost controls, expiry or truthful cancellation semantics.

## Approved product scope

`/ask` is a public encounter with Rizom’s actual Brain: visitors can explore its public knowledge, approach and work, ask follow-up questions, and use that knowledge to develop their own thinking.

- No account required.
- Public-source retrieval, answers and synthesis; visitors may supply text in their questions.
- No editing the Brain’s content, publishing, administration or unrestricted tool access.
- The Brain landing-page panel is a compact presentation of the same conversation available at `/ask`.
- Visitor conversations remain isolated and do not automatically become the Brain’s knowledge.
- Not a scripted sales bot, a support-only interface, or public access to Studio.

“Public” describes the accessible Brain knowledge. It does **not** mean visitor messages are published.

## Architecture and non-negotiable boundaries

Reuse rather than replace:

- `interfaces/web-chat`: standalone presentation, Chat routes, browser access, streaming and history handling.
- `shared/contracts/src/chat.ts`: schema-validated Chat contracts, `createChatClient` and `readChatProtocolEvents`.
- Existing agent runtime, permission-aware retrieval, transactional storage and scheduler.
- Studio’s authenticated `/chat` remains a separate presentation of the Chat domain.

Authenticated Chat handlers still reject anonymous callers. The guest API uses its own credential-bound routes and remains closed without explicit policy and trusted runtime readiness for new admission. Route registration with `public: true`, or accepting `permissionLevel: public`, does not establish guest ownership or authority. If guest discrimination needs a separate API subpath, it must reuse the existing Chat implementation.

Do not create another chat engine, bypass admission through A2A, embed Studio in an iframe, or ship Studio’s application bundle to the landing page.

### Identity, knowledge and tools

- Use opaque visitor credentials in host-only, HttpOnly, Secure production cookies with an appropriate SameSite policy; never put credentials in URLs or local storage.
- Conversation IDs are server-minted locators, not authorization. Reject forged, foreign, expired or deleted conversations without revealing their contents.
- Keep guests distinct from authenticated Public, Trusted and Admin principals. Guest execution is never Anchor execution, including when an owner tests `/ask` while signed in.
- Apply public visibility filtering before model context is assembled, including metadata, excerpts, attachments and tool results. Retrieved content is data, not authority.
- Allow only reviewed public read/search operations. Installing another plugin must not automatically grant its tools to guests.
- Deny content writes, publishing, administration, scheduling, remote agents, arbitrary URL fetching, uploads and approval execution.
- Do not accept browser-provided system instructions, operator context, owner IDs, roles, approval responses or tool permissions.
- Exclude visitor transcripts from automatic memory, indexing, summarization and shared-knowledge ingestion, including future hooks.
- Show validated returned public sources where available; never manufacture verified citations.

### Accounting, cancellation and retention

- Reserve capacity before generation and fail closed if a required mechanism is unavailable. Cookie resets, parallel tabs, retries and restarts must not evade caps.
- Deployment-wide coordination requires replicas to use the same transactional backing database. Mismatched policies fail closed; operator updates retain existing usage.
- Disconnection, expiry or a local abort is not proof remote work ended. Expose “stop waiting” rather than a false cancellation promise when genuine cancellation is unavailable.
- Distinguish completion, partial delivery, denial, expiry, budget exhaustion and provider failure through the existing protocol where possible.
- Pinned retention cannot be lengthened by resume, metadata changes or policy loosening. Deletion/expiry must prevent late writes from resurrecting conversations.
- Malformed or unaccounted state requires reconciliation, not guessed lifetimes or destructive cleanup. Preserve uncertain reservations until their outcome is verified.
- Keep raw prompts, replies, credentials and conversation identifiers out of routine analytics/error logs. Operational metrics should be aggregate and access-controlled.
- Before first send, identify the Brain/provider, retention and deletion limitations; discourage sensitive material. Do not promise local processing, provider non-training or deletion beyond what the system controls.

## Policy proposals — not approved defaults

| Policy              | Proposal                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Input               | Text only; no uploads/private attachments; maximum 4,000 characters per message.           |
| Output              | Maximum 1,200 generated tokens per turn.                                                   |
| Conversation        | Maximum 20 user turns, plus a bounded model-context token budget.                          |
| Concurrency         | One active generation per visitor and a separate deployment-wide cap.                      |
| Rate                | Five submissions per minute and 20 per day per visitor, plus network-level abuse controls. |
| Duration            | 90-second request bound with explicit idle-timeout handling.                               |
| Retention           | Expire after 24 hours of inactivity, with a hard seven-day maximum from creation.          |
| Browser persistence | No transcript in local storage; restore only authorized, unexpired server history.         |
| Budget              | An operator-approved daily provider-spend ceiling and global caps; no unlimited fallback.  |

These are proposals, not deployment configuration or claims of complete enforcement. Exact global, issuance, retrieval and provider limits require review and representative-turn measurements. Test fixtures are not launch approval. In particular, current fixed credential leases do not implement the proposed activity-based renewal behavior.

## Standalone `/ask` acceptance

Do not redesign the landing page during this milestone.

- Send a question, deliver the actual answer and allow a follow-up in the same conversation.
- Render safe Markdown and public source links; no executable HTML, unsafe URL schemes or unsupported action buttons.
- Preserve submitted text and received partial responses on failure. Make retries deliberate and deduplicated.
- Show waiting, completion, interruption, unavailable, expired and limit-reached states honestly. When guests are disabled, do not present a form that can never succeed.
- Provide distinct new-conversation and delete-conversation controls. Creating another conversation is not deletion.
- Support refresh and multiple tabs without mixing conversations or bypassing concurrency limits.
- Keep focus predictable and announcements accessible; do not announce every token or force scrolling while someone reads earlier messages.

**Exit:** standalone `/ask` works without Studio or an account, against the explicitly supported test posture, with its required safeguards verified.

## Existing hero chat box: approved v3 implemented; live acceptance outstanding

The user approved UX mockup v3 in `/tmp/brain-box-ux-review/index.html` and explicitly requested implementation. The UI remains the original `/brain` hero's `#brain-chat` box: its frame, brand bar, authored title, single-line-height composer, arrow and topic hints. Desktop height is fixed at 640px; mobile uses the visual viewport. Only the middle scrolls. The composer grows inward, the welcome title retires after sending, and About plus optional Full chat sit in the original brand bar. The separate panel, its launcher, `askTopics` schema and conversation-management controls have been removed from the active landing integration. No new marketing or topic copy was added to `rizom-content`.

The page's `/brain-chat.js` bootstrap lazily loads the guest entry on interaction and enhances only `.talk-body`. Topic buttons fill the input; only the send arrow or Enter submits. A deliberate first send while assets are loading pins the draft and authorizes exactly one send after readiness; a failed connection ends that intent. Focus, topics, availability checks and later recovery never send automatically. The textarea preserves oversized pasted text and shows inline validation instead of truncating it. The existing `GuestApp` owns the same guest transport, state, ownership checks and limits, while a shared transcript renderer shows answers and sources within the original box. Follow-ups use the same conversation. There is no second chat engine or additional panel.

`GuestBox` is presentation; `GuestApp` still owns transport, history and admission-facing state. Drafts stay editable during work and survive answers and failures. Earlier text is kept in memory when the visitor explicitly confirms a separate start. That action checks availability, changes only the active local selection, and never deletes, refunds, resets a limit or replays a question. Unavailable saved history now requires this explicit action instead of silently dropping its locator. Full chat is offered only with a saved locator and while not waiting for delivery. No production-backend fallback or transcript-bearing URLs.

“Check answer” is GET-only. Shared `getGuestHistory(id, submissionId)` reads the existing owned history endpoint with an optional submission-ID query and returns a bounded, exact receipt projection. `GuestAdmission.status` only reads the existing ledger: it cannot reserve, settle or clean up. Matching question text or message counts is not used to infer that a pending request completed, since another tab can have asked an identical question. Restored history without a pending local submission uses the stable server user-message ID. HTTP and UI tests cover active/completed distinction, cross-visitor denial, deletion, no replay and unchanged quota enforcement.

A separate guest entry avoids importing disabled rich-rendering plugins while retaining Streamdown. The lazy bundle is approximately 532 KB gzip, guarded by a 600 KB compressed-size regression; the site bootstrap remains a small, page-owned asset. CLI builds package the new assets, which are not served when guest access is disabled.

Built-UI Chromium fixtures at `/tmp/public-ask-v3-browser/report.json` cover lazy loading, a first pre-mount send, topics without sending, draft preservation during delivery, same-conversation follow-ups, read-only receipt/history checks, uncertain separate starts, source presentation, fixed-height hydration, reduced mobile viewport and unavailable access. These use mocked HTTP, not a provider.

The integrated site was also rebuilt through `site-builder_build-site` on a running canonical `start:publishing` app, with embeddings disabled, placeholder keys and general model traffic blocked at loopback port 9. The paid guest profile was unavailable. The app was stopped after the build; its original YAML and paused clock files were restored. The actual generated site and built UI are served at `http://127.0.0.1:8416/brain` with generation deliberately disabled. `/tmp/public-ask-v3-preview/check.json` verifies the actual page without mocked routes, fixed height, editable unavailable-state draft and zero question submissions. No paid turn, budget reset, merge or deployment was performed for this implementation.

Remaining acceptance criteria:

- Keep the hero, input and topic suggestions. Suggestions only fill the input; Send transmits text.
- Load a small chat bundle on interaction using shared contracts/transport. Keep presentation state local to the site.
- Keep the approved fixed-height shell across states, with real answers and sources in its scrolling middle and the composer anchored below.
- “Continue in `/ask`” uses the same guest identity and conversation locator. Load authorized history; do not copy transcripts into URLs or create a replacement conversation.
- Handle navigation during generation without automatic replay. Verify stream reattachment before promising it; report continuing or interrupted work honestly.
- Isolate preview and production identities. Use an explicitly configured test backend, never silent production requests.
- Shared URLs and expired credentials must not reveal someone else’s transcript.
- No canned answers, invented source cards, premature “Live” labels or automatic generation on page load.

Authoritative public copy and privacy wording belong in `rizom-content`. Rendering, assets and contracts belong in `brains`; use the existing asset/build/fingerprinting pipeline.

**Exit:** a visitor can begin in the existing hero box and continue the same conversation at `/ask`, with identical guest policy enforcement.

## Semantic query accounting and same-brain mocked verification

Embedding is core functionality. The former embeddings-off guest restriction has been replaced with prepaid, single-use query embeddings through the existing tool budget. This does not charge background indexing to guest turns or introduce a new background spending allowance.

A canonical `start:publishing` app was run with embeddings enabled, an isolated XDG data/cache directory and copied public site content. Its default preview was rebuilt through MCP on the running app. Both the generated native network section and Guest Chat used that **same publishing brain**; the loopback preview file server relayed chat only to that backend. No browser routes were mocked. Provider HTTP was intercepted into a local synthetic server with no upstream transport and a placeholder key.

Chromium submitted one **synthetic-provider-only** fixture question. The actual shared guest runtime completed two mocked model requests and one prepaid query embedding. Background indexing separately made 38 mocked embedding requests; those are not the earlier 38 paid indexing requests or measured provider billing. Unsupported background generation was blocked. The native map correctly showed **“No indexed agents yet.”** No agent nodes were invented. The box remained 640px and there were no page errors.

Artifacts: `/tmp/public-ask-semantic-app/{report.json,chat.png,network.png,provider.jsonl}`. The initial isolated output needed a temporary `node_modules` symlink for Tailwind resolution; the app-managed rebuild then succeeded. All fixture servers are stopped. SHA-256 checks confirm the publishing YAML, both paused clock files and the closed embedding ledger were restored or unchanged. No paid allowance was reopened/reset, and nothing was staged or committed. This verifies combined operation with synthetic providers, not new live-provider acceptance or a populated real agent network.

Full-tree validation: 101 typecheck tasks, 99 test tasks and targeted lint passed. Regressions cover pre-call exhaustion, retained failure reservations, no retries, cancellation, one-use capabilities, embedding model/usage bounds, public visibility, index readiness and search/projection coexistence. These checks still do not validate future individual commit partitions.

## Commit delivery

The approved groups were validated as incremental source snapshots in `/tmp/public-ask-commit-validation`, with independently installed workspace dependencies—not links into the dirty integration worktree. The snapshots used the committed budget implementation, excluding its paused clock patch, the untracked deadline test and both retired network captures. Normal commit hooks were also run without bypasses.

- `539524ac57`: reconcile existing workspace lock metadata, without the new site dependencies.
- `bac03800c7`: trusted transport context and loopback binding.
- `551efbd108`: accounted semantic runtime, source projection and shared client/history contracts.
- `3acf67dbca`: owned guest HTTP, standalone/shared UI and build assets.
- `1a8f8df4a3`: landing composition, native local map, three site dependencies and retained Studio captures.

The runtime snapshot passed all 101 typecheck and 99 test tasks. Transport, HTTP/UI and site snapshots passed their relevant checks; the HTTP/UI snapshot also built UI and CLI assets. The landing snapshot built the site package and ran canonical `start:publishing` with a fresh isolated fixture database, then rebuilt preview via MCP on the running app. Chromium verified one synthetic guest question, two mocked model requests, one query embedding and the native empty local map. Both retired network SVGs were absent from the generated preview. Evidence: `/tmp/public-ask-commit-site/report.json`; check and hook logs: `/tmp/public-ask-commits/`.

The hooks identified an unsorted site dependency list and two undocumented recovery catches; these were corrected in their respective groups and the hooks rerun normally. Original capture files were not deleted. SHA-256 checks preserved the paused files, retired captures, original publishing YAML and closed embedding ledger. Fixture servers are stopped. No merge, release, deployment, paid call or allowance reset was performed.

The three paired Markdown changes in `/home/yeehaa/Documents/rizom-content-worktrees/brain-landing/site-content/brain/{hero,capture,connect}.md` remain uncommitted in that separate content repository. They must accompany the site before deployment; committing them is a separate delivery action. The original `feat/rizom-brain-landing` worktree remains unchanged.

## Verification and delivery

### Boundary tests

- Guest versus authenticated Public/Trusted/Admin admission; signed-in owners cannot upgrade guests.
- Two visitors cannot read, delete, continue or enumerate each other’s conversations.
- Forged tokens/IDs, fixation, expiry, CSRF and injected privilege/context fail safely.
- Private knowledge, Inbox data, other conversations, private metadata and artifacts never reach guest model context or replies.
- Prompt injection cannot enable denied/newly installed tools. Guest conversations never become shared knowledge automatically.
- Cookie resets, parallel requests, retries, restarts, replicas and spoofed forwarding headers cannot bypass applicable quotas or authority checks.
- Expiry/deletion, late writes, partial delivery, timeout, provider failure and uncertain cancellation behave as disclosed.

### Product tests

- Real answers, follow-up, source rendering, refresh, deletion and explicit retry.
- Split/malformed protocol frames and unsupported cards fail safely.
- Keyboard-only use, screen readers, mobile layouts and both themes.
- No requests before Send, exposed provider keys, transcript-bearing URLs or raw-conversation analytics.
- Authenticated Chat still works; verify Chat without Studio.
- After box integration, verify continuity before, during and after generation, including navigation and expiry.

### Delivery discipline

1. Use targeted checks first; broaden when shared contracts change. Mock-provider and SQLite tests do not establish live-provider pricing or product readiness.
2. Start an isolated canonical test app using `packages/brain-cli` posture scripts, not invented startup commands. Fixtures belong in mocks/in-memory harnesses, not durable app data.
3. Verify the real public-source conversation in that running app before declaring the milestone complete.
4. For site verification, trigger the preview rebuild on the running app through its command surface before inspecting `dist/site-preview`. Production output is separate.
5. Review the actual experience and policy with the user. Tests are not design, release or deployment approval.
6. Release core/site changes through their respective lanes only with explicit approval. Publication rebuild and deployment are separate actions.
7. Verify deployment behavior, aggregate failures/limits/cost and rollback via the guest kill switch without disrupting authenticated Chat.

## Progress reporting and scope control

Use this document as the current status, not an accumulating sequence of technical completion reports.

Every implementation checkpoint should state:

1. **Capability advanced:** what a visitor can now do, or the exact blocker removed if nothing is user-visible yet.
2. **Milestone blockers:** the remaining items from the first-test checklist.
3. **Scope changes:** why any new shared infrastructure is necessary; obtain agreement before expanding the work.

Detailed historical implementation notes remain in Git history through `51b218fe11`. They are evidence of completed engineering work, not an authoritative current backlog. The old chronological notes included outstanding items that later commits completed; this consolidated plan replaces that ambiguity.
