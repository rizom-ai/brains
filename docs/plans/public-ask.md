# Plan: Public `/ask` and the Brain landing-page chat

## Status

Implementation started on `feat/public-ask` in an isolated worktree. The user approved implementation of the product scope below, not policy defaults, release or deployment. No live guest access is enabled.

This scopes the visitor posture anticipated in Phase 5 of [Studio Chat integration](studio-chat-integration.md). The current restriction is intentional until `/ask` is scoped and its safeguards implemented; it is not a requirement that visitors must sign in.

## Review and implementation checkpoint

The architecture remains appropriate: reuse Web Chat and the existing agent runtime, with a distinct server-owned guest scope. Do not equate an authenticated `public` principal with a visitor.

Initial review identified these implementation prerequisites:

- Permission-filtered tools are not a reviewed guest allowlist. Guest restrictions must also cover context providers and tool dispatch before anonymous generation is admitted.
- Runtime state originally offered only atomic `setIfNotExists`. Quotas need a shared, restart-safe reservation design; process-local counters are insufficient. The quota stage now adds compare-and-set for an atomic reservation ledger.
- Conversation ownership was authenticated-only at the start. Guest scope must bind every operation, exclude memory/ingestion hooks, and prevent late writes after deletion or expiry.
- Existing same-origin helpers derive origin through forwarded headers. Guest policy now requires an explicit canonical deployment origin; trusted HTTP-host integration must account for TLS termination without trusting arbitrary forwarding headers.

Completed foundation (not yet wired into guest HTTP routes):

- Strict, default-off `guest` policy configuration; enabling the policy requires explicit limits, budget, retention and provider/deletion disclosures. Proposed limits exist only in test fixtures, not deployment defaults.
- Opaque visitor credentials with host-only HttpOnly cookies, digest-only persistent lookup, origin isolation, revocation and expiry denial. Initial credential leases are fixed, bounded by idle expiry; reads do not renew them. Cleanup and admission-time activity renewal remain unfinished.
- Guest conversation ownership/expiry checks and an explicit exclusion from authenticated browser conversation admission, including admin admission.
- Adversarial foundation tests covering fixation, forged/ambiguous credentials, cross-origin mutations, environment isolation, persistence failure, foreign ownership and expiry.

Completed runtime/storage isolation stage (still no guest HTTP admission):

- Shared guest scope and schema-validated visitor ownership. Guest creation rejects authenticated ownership; generic metadata updates cannot reassign a guest owner.
- Guest execution rejects privilege/Anchor escalation, actor/source injection, approvals and uploads. It requires a pre-existing guest conversation and does not recreate one. Authenticated runtime calls cannot access that scope.
- Separate guest agent cache, public-only tool context, and a fixed allowlist of `system_search`, `system_get` and `system_list`. Tools must remain explicitly public, read-only and agent-enabled; SDK conversion and dispatch enforce the restrictions as well.
- Guest model requests exclude character/profile entities, brain/plugin instructions, context providers, history metadata and upload continuity. Unreviewed identity configuration is not assumed public. Only server-owned text history is admitted; injected system/tool messages and files are rejected before provider processing. Provider web search/options are disabled for guest calls.
- Guest tool events are not broadcast to general subscribers, and retrieval failures are normalized without exposing raw storage/provider errors to the model.
- Guest transcripts are excluded from conversation lifecycle/message/digest broadcasts, summary tracking, general list/search APIs and routine conversation logs. Other conversations retain their existing behavior.
- Guest message insertion checks existence and scope in the insertion statement; deletion either wins before insertion or cascades the inserted row. Two-connection tests cover late writes and deletion between lookup and insert. Full expiry/retention enforcement and cleanup are still outstanding.

Validation: targeted AI Service, Conversation Service, shared contracts and Web Chat checks pass, including the real AI SDK with a mocked provider and real SQLite deletion-race tests. No live-provider guest conversation or site integration has been verified.

Completed quota-accounting stage (not connected to HTTP or generation yet):

- Shared runtime-state `compareAndSet` atomically replaces a schema-serialized value; the ledger uses monotonically increasing revisions. Independent database connections cannot both spend the same remaining capacity.
- One admission transaction reserves per-visitor/global rolling minute/day quotas, conversation turn limits, one active turn per visitor, deployment concurrency and the configured worst-case turn spend. All replicas must use the **same transactional backing database**; independent local/embedded replicas are not deployment-wide coordination.
- Spend uses integer microdollars with conservative rounding. Active work remains funded across day boundaries; terminal work remains charged for 24 hours after settlement, without failure refunds. **This accounting does not yet prove actual provider cost fits `maxTurnUsd`**: bounded runtime execution and provider/tool pricing verification remain admission gates.
- Duplicate submissions never yield a second execution lease. Reusing an ID with changed text is rejected; terminal outcomes remain discoverable without keeping response text in the quota ledger.
- The shared operator kill switch and policy fingerprint survive restart. Explicit policy changes retain existing usage; replicas with mismatched policies fail closed. Applying policy is an operator-only action, not a startup reset or guest endpoint.
- Storage failures, ambiguous commits, bounded CAS contention and clock rollback fail closed. Timeout/disconnection is not settlement: uncertain active reservations keep their concurrency and budget until genuine termination is established. Recovery needs verified reconciliation, not timer-based refunds.
- Quota records contain hashes rather than raw visitor/conversation/submission IDs or transcripts. Terminal references expire after both conversation deduplication and 24-hour accounting windows. Uncertain active references remain until reconciliation; these limits need inclusion in operator-approved retention disclosures. The cleanup method still needs lifecycle scheduling.
- Tests cover competing real SQLite connections, restart, duplicate retries, new-cookie bypass attempts, rolling-window boundaries, monetary rounding, policy mismatch, shared disablement, failures and terminal-reference cleanup.

Completed execution-guard stage (still no guest HTTP admission or verified live-provider cost bound):

- Shared, strict execution policy requires message/context-byte/context-token/output limits, model-step/tool-call/result limits, a request deadline and an integer microdollar ceiling. Admission leases carry the policy snapshot and the amount actually reserved; the public agent adapter and runtime carry these server-owned values without deriving them from browser model settings.
- Guest execution rejects missing limits and oversized input before writes. Each guest turn gets a separate SDK agent and budget; authenticated behavior is unchanged. Final model requests are byte-checked and require a trusted token/cost quote before provider execution. Output allowance decreases across model steps; uncertain provider failures cannot return it for reuse. Automatic SDK retries are disabled, and overlapping model calls cannot spend the same output allowance.
- Actual public retrieval executions share the model cost allowance, including parallel calls. Tool inputs are bounded and oversized results are replaced with a safe failure before they enter model context. Guest tool dispatch cannot run without a budget. These result guards do **not** yet bound retrieval allocation/work at its source.
- Accounting errors, unsupported model adapters and invalid quotes fail closed; no bytes-to-token heuristic or fallback price permits generation. Accounting must itself be non-billable, model/pricing-specific and transcript-safe. **No production accounting adapter is installed yet.** The callback contract and mocked quotes are not a proof that actual provider/tool costs fit the reservation.
- Deadlines request cancellation through the model and tool signals. Accounting or provider work that ignores cancellation remains pending; late accounting cannot start new work after abort. Disposed budgets reject reuse. A local abort/provider failure is not proof of remote termination and must not release an uncertain admission reservation.
- Provider/accounting failures are sanitized, and failed guest execution rejects rather than masquerading as a successful error-text answer. Native provider streaming is explicitly denied until equally guarded; existing Chat transport streaming/idle handling is still to be integrated.
- Tests cover real SDK calls with mocked providers, cumulative output, step/call limits, parallel cost reservations, missing/invalid accounting, input/context/result bounds, disabled retries, deadline/cancellation races, closed-budget reuse and propagation through shared/runtime contracts.

Completed storage-expiry and maintenance-primitives stage (still no guest HTTP admission):

- Guest ownership now requires a schema-validated retention snapshot. Creation pins it durably; resuming a conversation and generic metadata updates cannot extend or replace it. Existing guest rows without valid retention are unavailable, not unlimited. No compatibility fallback assigns them guessed lifetimes.
- Guest history, range reads, counts and conversation lookups exclude expired rows. Browser ownership checks also honor the pinned bounds when current policy allows longer retention. Authenticated conversation behavior is retained.
- Guest insertion and activity renewal are transactional. SQL checks scope, metadata and expiry at statement execution time, including after waiting for another writer; a failed renewal rolls back the message. Hard lifetime never moves. Metadata writes recheck the same live-row condition. Deletion remains available for expired rows.
- Trusted conversation maintenance deletes genuinely expired guest rows in bounded batches with FK cascade, without broadcasting or enumerating transcripts. Malformed leases and future-dated activity fail closed for access but are not treated as proof of expiry; these anomalies require operator reconciliation, not guessed cleanup deadlines.
- Runtime-state listing supports bounded, key-ordered cursor pages and literal prefixes before schema parsing. Binary key decoding prevents embedded-NUL truncation from breaking cursor progress or targeting another record. Credential cleanup uses these pages and each immutable lease's stored expiry, even when admission is disabled; it does not renew credentials or release uncertain quota reservations.
- Real SQLite tests cover exact idle/hard boundaries, two-connection expiry races, transactional rollback, expiry-safe reads, immutable retention, cascading cleanup and pagination. Credential cleanup and policy-loosening tests pass in the shared state harness.
- **Still outstanding:** host lifecycle scheduling/monitoring of maintenance, credential activity/rotation and issuance abuse controls, owned deletion/revocation coordination, and delivery-time ownership/expiry checks. These primitives alone are not a complete operational retention guarantee.

Completed maintenance-lifecycle stage (no guest HTTP admission):

- A shared maintenance-daemon adapter reuses the existing scheduler. Registration performs no cleanup or scheduling; startup is idempotent, callbacks do not overlap, and stop/restart drains admitted work. Health reports sanitized failures, overdue/stalled cycles and aggregate counters, without retaining callback exceptions or private state.
- The shell registers `shell:guest-retention` in the host/combined process, not an execution-only worker. It starts with normal runtime services, never in register-only mode. Each minute it removes at most 100 expired conversations. Synchronous construction rollback abandons the unstarted daemon; runtime shutdown drains it before conversation storage closes.
- Installed Web Chat registers `web-chat:guest-maintenance` even with guest admission disabled. Each minute it processes one page of up to 100 credentials and one origin's accounting ledger. Credential and ledger failures are isolated so one does not starve the other. This cadence and batching are maintenance implementation choices, not approved launch limits or a physical-deletion SLA.
- Ledger cleanup uses the same receipt-retention rule as admission and bounded CAS retries. It preserves concurrent reservations, policy fingerprints and kill switches; it never recreates a removed ledger, adopts policy, settles uncertain work or refunds spend. Failed ledger writes are revisited on later sweeps.
- Lifecycle tests cover registration, start/stop/restart, stalled work, sanitized failure/recovery, execution-only workers, synchronous construction rollback and shutdown-before-database-close. An installed Web Chat test confirms cleanup runs while anonymous Chat remains forbidden. Shared conversation-service fixtures now include the trusted maintenance operation.
- Cycle health is not proof that the backlog meets a retention SLA. Issuance/storage caps, throughput verification and admission behavior when maintenance is unhealthy remain launch gates. Removing Web Chat also requires an explicit closeout of its owned credential/accounting state, especially uncertain work; its daemon cannot run after the interface is uninstalled.

Completed credential-issuance capacity stage (guest HTTP admission still inaccessible):

- Enabled policy now requires explicit issuance requests-per-minute, requests-per-day and stored-credential caps; test values are not launch defaults. One CAS ledger covers all origins sharing the transactional runtime-state database. Replicas must agree on issuance policy; only an explicit operator update changes it, without resetting held capacity or recent requests.
- Every fresh random credential reserves both rolling request windows and a storage slot before one materialization attempt. Cookie resets, preview origins, concurrent replicas and restarts do not bypass these caps. Revocation/deletion releases storage only after an acknowledged delete; it never refunds request windows. Lowering limits blocks further admission rather than evicting existing leases.
- A reservation remains pending until the original credential writer acknowledges completion. Ambiguous reservations/writes keep their slots, even if no row is visible or the credential lifetime has elapsed. Cleanup never interprets expiry or absence as proof a pending write cannot still commit. Expired pending reservations raise a sanitized maintenance warning across pagination until reconciled.
- Credential records now bind to their issuance ticket. Resolution checks issued state and matching pinned lifetime; revocation marks the ticket deleting before touching the row. Concurrent cleanup/revocation is idempotent, and uncertain deletes remain charged until retry obtains an acknowledged absence. Scheduled cleanup prunes expired request timestamps even when issuance is disabled.
- Unaccounted/pre-ledger credentials are not adopted or granted compatibility access. Bootstrap refuses unaccounted rows; anomalous state requires explicit reconciliation, not guessed deletion. Complete, consistent backing-store snapshots and no out-of-band mutation of credential/issuance records are prerequisites for the capacity invariant.
- Real competing SQLite connections and restart tests cover the global cap. Additional tests cover rolling boundaries, no refunds, delayed/ambiguous writes, ambiguous deletes/reservations, bounded CAS contention, policy changes, clock rollback, cleanup races and safe errors.
- **Still outstanding:** trusted ingress/per-network abuse controls, admission gating on maintenance/backlog health, credential activity/rotation, owned conversation deletion coordination and verified reconciliation of uncertain credential writes. This does not establish a physical-deletion SLA or approve production policy.

**Next:** implement and verify supported provider token/pricing adapters and source-level retrieval bounds; finish credential activity/rotation, transport issuance abuse controls, trusted HTTP-origin handling, stream-idle handling and verified uncertain-work reconciliation; then connect admission, owned history, streaming, retries and deletion through the existing Chat API. Configuration alone currently grants no guest access. The first reviewable product milestone below is **not yet complete**.

## Approved product scope

`/ask` is a public encounter with Rizom’s actual Brain: visitors can explore its public knowledge, approach and work, ask follow-up questions, and use that knowledge to develop their own thinking.

- No account required.
- Public-source retrieval, answers and synthesis; visitors may supply text in their questions.
- No editing the Brain’s content, publishing, administration or unrestricted tool access.
- The Brain landing-page panel is a compact presentation of the same conversation available at `/ask`.
- Visitor conversations remain isolated and do not automatically become the Brain’s knowledge.
- Not a scripted sales bot, a support-only interface, or public access to Studio.

“Public” describes the accessible Brain knowledge. It does **not** mean visitor messages are published.

## Existing foundation

Reuse rather than replace:

- `interfaces/web-chat`: `/ask`, `/api/chat/*`, browser conversation access, streaming, history and session handlers.
- `shared/contracts/src/chat.ts`: schema-validated chat contracts, `createChatClient` and `readChatProtocolEvents`.
- Existing agent runtime and permission-aware retrieval.
- Studio’s authenticated `/chat` remains a separate presentation of the Chat domain.

Current handlers admit trusted/admin actors and reject anonymous callers. Route registration with `public: true` does not grant guest permission. Anonymous conversation ownership is not implemented by simply accepting `permissionLevel: public`.

Do not create another chat engine, route around admission through A2A, embed Studio in an iframe, or ship Studio’s application bundle to the landing page.

## 1. Define and approve the guest policy

Introduce a schema-first, server-owned visitor posture in Web Chat. Keep it default-off, with an operational kill switch. Enabling it must require complete limits and retention configuration.

### Identity and conversation ownership

- Issue an opaque visitor credential; use a host-only, HttpOnly, Secure cookie in production with an appropriate SameSite policy. Do not expose credentials in URLs or local storage.
- Mint conversation IDs on the server and bind them to that visitor. An ID in a URL is a locator, never authorization.
- Bind every history read, stream, retry and deletion to the visitor and guest conversation scope. Reject forged, foreign, expired or deleted conversations without revealing their contents.
- Keep guest identity distinct from authenticated Public, Trusted and Admin principals. Guest execution is never anchor execution.
- An owner testing `/ask` while signed in must still get the guest/public experience. Authenticated cookies must not silently upgrade a visitor conversation.
- Preserve existing authenticated Chat admission. No guest access to Studio, operator sessions, Inbox context or session enumeration across visitors.
- Use the existing Web Chat API ownership and shared contracts. Finalize guest request discrimination during contract design; if a separate API subpath is needed for isolation, it must reuse the same Chat implementation.
- Enforce same-origin mutation protection; do not trust a caller-supplied origin, actor ID, role or conversation owner.

### Knowledge and tools

- Apply public visibility filtering before model context is assembled, including source metadata, excerpts, attachments and tool results—not just the final response.
- Explicitly allow only reviewed read/search operations for guest execution. Installing another plugin must not automatically grant guests its tools.
- Deny content writes, publishing, scheduling, remote-agent calls, arbitrary URL fetching, administrative operations and approval execution in this first slice.
- Do not accept browser-provided system instructions, operator context, approval responses or tool permissions.
- Enforce restrictions in runtime/tool dispatch, not only in a prompt. Treat retrieved content as data, not instructions granting authority.
- Show returned, validated public sources where available. Do not manufacture citations or portray model-written references as verified retrieval evidence.

### Proposed launch defaults — require approval

| Policy              | Proposal                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Input               | Text only; no uploads or private attachments; maximum 4,000 characters per message.                                         |
| Output              | Maximum 1,200 generated tokens per turn.                                                                                    |
| Conversation        | Maximum 20 user turns, plus a bounded model-context token budget.                                                           |
| Concurrency         | One active generation per visitor; a separate deployment-wide concurrency cap.                                              |
| Rate                | Five submissions per minute and 20 per day per visitor, combined with network-level abuse controls.                         |
| Duration            | 90-second maximum request duration; explicit idle-timeout handling.                                                         |
| Retention           | Expire after 24 hours of inactivity, with a hard seven-day maximum from creation.                                           |
| Browser persistence | No transcript in local storage; restore only authorized, unexpired server history.                                          |
| Budget              | Operator-approved daily provider-spend ceiling and global caps are mandatory before enabling guests; no unlimited fallback. |

These are starting proposals, not claims about existing enforcement. Visitor-cookie limits alone are insufficient: repeated guest creation must not evade global quotas. Account for deployment replicas, restarts, concurrent requests and trusted proxy configuration. Bound total model/tool cost, not only displayed output length. Reserve capacity before generation; fail closed when a required quota mechanism is unavailable. Choose exact global caps after measuring representative turns.

### Privacy and deletion

- Before first send, explain that messages reach Rizom’s Brain and its configured AI provider, identify the applicable retention policy, and discourage sharing sensitive material.
- Do not imply local model processing or make unsupported provider-training promises.
- Audit all conversation-memory, indexing, summarization and ingestion paths. Guest transcripts must be excluded from automatic promotion into shared knowledge, including future hooks.
- Provide deletion of the visitor’s own conversation. Starting a new conversation is not deletion; label the actions separately.
- Define cleanup for messages, derived records and retained references. Expiry and deletion must prevent late stream writes from resurrecting a conversation.
- Document any backup, provider or security-log retention that deletion cannot immediately remove. Do not promise deletion beyond what the system controls.
- Keep raw prompts, replies, visitor credentials and conversation identifiers out of routine analytics and error logs. Operational metrics should be aggregate and access-controlled.

**Gate:** approve the policy defaults and operator-specific budget/provider/retention disclosures before production admission is enabled.

## 2. Implement the guest backend first

Work in an isolated worktree from current main. Keep this within the owning interface and existing shared services; identify any missing shared contract before adding site-specific behavior.

1. Add typed guest configuration and actor/conversation ownership contracts.
2. Implement visitor issuance, admission, ownership checks and guest-scoped history/deletion.
3. Carry guest scope through agent execution, retrieval, tool dispatch and stream delivery.
4. Implement quotas, concurrency accounting, expiry/deletion and the kill switch.
5. Define duplicate-submission and retry behavior so reconnects do not replay a completed turn or launch a second paid generation unintentionally.
6. Distinguish response-stream interruption from runtime cancellation. If genuine cancellation is unavailable, expose “stop waiting,” not a false claim that remote work stopped.
7. Specify terminal states for completion, partial response, denial, expiry, budget exhaustion and provider failure using the existing chat protocol wherever possible.

Disabling guest admission must reject new guest work while leaving authenticated Chat intact. Define how already-running guest work is bounded and terminated or allowed to finish; a switch must not imply cancellation it cannot enforce.

**Exit:** anonymous callers can complete an isolated, bounded, public-only conversation through the real runtime. Adversarial tests pass before UI integration is treated as ready.

## 3. Make standalone `/ask` the complete visitor experience

Reuse the existing standalone presentation and shared client/parser. Do not redesign the Brain landing page during this work.

- Submit a question, stream the actual answer and permit follow-up in the same conversation.
- Render safe Markdown and public source links. No executable HTML, unsafe URL schemes or unsupported action buttons from model output.
- Preserve submitted text and any received partial response on failure; make retries deliberate.
- Provide clear waiting, completion, interruption, unavailable, expired and limit-reached states.
- Offer new-conversation and delete-conversation controls with distinct semantics.
- Keep keyboard focus predictable and announcements accessible; do not announce every streamed token or force scrolling while someone reads earlier messages.
- Handle multiple tabs and duplicate sends without mixing conversations or violating concurrency limits.
- When guest access is disabled, provide an honest unavailable state rather than presenting an anonymous form that can never succeed.

**Exit:** `/ask` works without Studio installed and without an account, only when the approved guest posture is enabled.

## 4. Connect the existing Brain landing-page panel

This is integration into the current product landing page, not another visual-concept exercise.

- Keep the existing hero, input and topic suggestions. Suggestions fill the input; only Send transmits text.
- Load a small chat bundle on interaction, using the shared contracts and transport. Keep presentation state local to the site.
- Expand the existing panel after first submission to show the real answer, sources and follow-up input. Bound its footprint so it does not take over the landing page.
- Provide “Continue in `/ask`” using the same guest identity and conversation locator. History is authorized and loaded, not copied into a URL or recreated as a new conversation.
- Handle navigation during generation: preserve the conversation, do not automatically replay the request, and accurately report whether work continues. Verify server behavior before promising live stream reattachment.
- Keep preview and production identities isolated. The prototype must use an explicitly configured test backend; it must not silently send requests to production.
- For an expired visitor credential or a shared conversation URL, show an unavailable/new-conversation path without revealing the original transcript.
- No canned answers, invented source cards, premature “Live” labels or automatic generation on page load.

Authoritative public copy and privacy wording belong in `rizom-content`. Rendering, client assets and contracts belong in `brains`. Register site assets through the existing build/fingerprinting pipeline.

**Exit:** a visitor can start in the landing-page panel and continue the same conversation at `/ask`; both hosts enforce the identical guest policy.

## 5. Validation and release gates

### Security and isolation

- Anonymous guest, authenticated Public, Trusted and Admin admission matrix; signed-in owners do not upgrade the guest surface.
- Two independent visitor sessions cannot read, delete, continue or enumerate each other’s conversations.
- Forged IDs/tokens, identity fixation, expired credentials, CSRF and caller-supplied privilege/context escalation.
- Private knowledge, Inbox data, other conversations, source metadata and artifacts never enter guest model context or responses.
- Prompt injection and direct requests cannot enable denied operations or newly installed tools.
- No automatic guest-memory ingestion; deletion and expiry include late writes and derived data.
- Quota bypass through new cookies, parallel tabs, retries, restarts, replicas and spoofed forwarding headers; global caps and kill switch behave as specified.

### Product and transport

- Real streaming, follow-up and source rendering; split stream frames, malformed events and unsupported cards fail safely.
- Disconnection, timeout, provider failure, partial response, cancellation semantics and duplicate submission.
- Landing-page-to-`/ask` continuity before, during and after generation, plus refresh and expiry.
- Safe Markdown/links, keyboard-only use, screen-reader announcements, mobile layouts and both themes.
- No requests before Send, no raw-conversation analytics, no browser-exposed provider keys and no transcript-bearing URLs.
- Existing authenticated Studio Chat remains functional; test Chat-without-Studio composition.

### Delivery

1. Targeted Web Chat, contract, access-policy and runtime tests; expand checks when shared contracts change.
2. Run an isolated canonical test app using the repository posture scripts, not an invented startup path. Fixtures belong in mocks/in-memory harnesses, never durable app data.
3. Verify a real public-source conversation in the test deployment without simulated answers or publication side effects.
4. Integrate site/content changes in isolated worktrees. On a running app, trigger the preview site rebuild through its command surface before inspecting `dist/site-preview`.
5. Review the actual experience and policy with the user. Passing tests is not design or release approval.
6. Release core and site changes separately as required by the repository lanes; enable on Rizom only after explicit approval. Rebuild publication separately from deployment.
7. Verify production behavior and watch aggregate failures, limits and cost. Roll back via the guest kill switch without disrupting authenticated Chat.

## First implementation slice

Start with guest policy/contracts, ownership and public-only execution tests—not the landing-page JavaScript. The first reviewable milestone is a real, isolated conversation at `/ask` with safeguards in place. The landing-page panel then becomes a second, smaller presentation of that working experience.
