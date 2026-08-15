# Plan: Useful Inbox follow-up workflows

## Status

**Proposed — 2026-08-15. Awaiting implementation approval.** The destination registry, navigation, source detail reader, revisioned reply drafts, and approval-gated threaded delivery have shipped. This plan corrects the product behavior after runtime review showed that the three primary follow-ups do not yet carry enough intent or context to be useful.

**Baseline correction (runtime review, 2026-08-15).** On committed `main` the follow-ups do **not** navigate at all — the premise that they "navigate successfully" holds only with two uncommitted fixes described under _Current baseline_ below. Phase 0 must land them first, because every later phase assumes a working launch.

The plan must land on `main` before implementation begins. Implementation should then happen in a dedicated worktree and integrate directly into `main` without a pull request.

## Goal

Make each Inbox follow-up produce an immediately useful, understandable workflow:

- **Discuss in chat** starts a fresh chat with the selected Inbox item attached as live, source-backed context.
- **Capture as note** opens an editable note containing useful content-safe context and a source backlink.
- **Draft reply** creates the first reply draft automatically, while preserving explicit review, save, and send confirmation boundaries.

The result should feel like one correspondence workflow rather than three unrelated destination links.

## Current baseline

The underlying capabilities are present:

1. `InboxFollowUpRegistry` resolves destination-owned launches and validates bounded handoff state.
2. Inbox sources retain item ownership and may expose abortable, permission-checked `resolveDetail()` reads.
3. The email source resolves original mailbox content through a private locator store without persisting the original body, subject, addresses, or transport identifiers in Brain entities.
4. Web Chat accepts normal agent turns with attachments and tracks authenticated conversations.
5. CMS can prefill a new note editor from one-shot history state.
6. `@brains/email-workflows` owns source-backed reply generation, revisioned authored drafts, optimistic saves, explicit send confirmation, threaded delivery, and revision-scoped idempotency.

Two defects found in runtime review block the baseline and are fixed but not yet
committed:

1. **Launch navigation is clobbered.** `replaceWorkspaceUrlQuery` runs the
   workspace's URL canonicalisation unconditionally, so it fires while the
   operator is navigating away and rewrites the launched route back to the
   workspace. Captured live: `pushState → /cms/entities/note?mode=create` with a
   correct `cmsCreatePrefill` payload, immediately followed by
   `replaceState → /cms/workspaces/inbox`. Chat is worse — `/chat` is not a CMS
   target, so it uses `pushState` then `location.reload()`, and the canonicalising
   replace wins the race, meaning the reload re-fetches the Inbox and
   `webChatPrefill` is discarded. Fixed by guarding the replace to no-op when the
   workspace is no longer the open route. This escaped CI because
   `follow-up-navigation.test.ts` drives injected `routerPush`/`browserPushState`/
   `reload` fakes, so the canonicalisation effect never runs in test.
2. **CMS cannot save any non-public entity.** `resolveCmsVisibility` reads
   `visibility` out of the payload but leaves it in, and the payload then reaches
   the strict domain frontmatter schema, which rejects it
   (`Unrecognized key: "visibility"`, HTTP 400). Public entities omit the key, and
   every existing save test used `visibility: "public"`, so nothing caught it.
   This affects both restricted types in play here: `mail-item` and
   `email-reply-draft`, so the Email Reply Drafts collection is currently
   uneditable through the generic entity API. Fixed by stripping the system key
   before domain validation, reusing the existing `stripCmsPolicyMetadata`.

The remaining failures are at the handoff and interaction layer:

- Chat receives only a title/entity-reference sentence, so the agent cannot inspect the email being discussed.
- Capture creates an unsaved title plus a `Source:` line, so the operator still has to reconstruct the useful note.
- Draft reply opens the correct workspace but requires a second click before any draft exists.
- The reply workspace does not clearly distinguish source loading, initial generation, unsaved edits, saved revisions, and send readiness.
- Existing tests prove routing, schema bounds, and approval gates, but not useful end-to-end outcomes.

## User-facing acceptance contract

### Discuss in chat

1. Clicking **Discuss in chat** opens Web Chat in a fresh client-side conversation, not an unrelated existing thread.
2. The composer contains a concise editable prompt and shows a removable Inbox-context chip with the safe item label.
3. While that context is attached, each submitted turn resolves the current source detail on the server using the authenticated actor and an `AbortSignal`.
4. The agent can accurately summarize, assess, and discuss the original email without the browser receiving the source body.
5. Starting a new chat, selecting another conversation, or removing the chip detaches the Inbox context.
6. If source detail is expired or unavailable, Web Chat shows a fixed safe error, preserves the operator's text for retry, and does not silently run the turn without the requested context.

The browser may carry only bounded routing fields (`sourceId`, `itemId`, and a content-safe label). The source body remains server-side.

### Capture as note

1. Clicking **Capture as note** opens the note editor with:
   - the Inbox item title;
   - the existing content-safe derived summary when present; and
   - a human-readable source section containing the canonical entity backlink.
2. No original email body, subject header, sender address, raw message ID, or private source locator enters the handoff or note draft.
3. The note remains unsaved until the operator reviews and saves it. The action must not create durable content merely by navigating.
4. Missing optional summary content degrades to a title and source section rather than a malformed or empty editor.

### Draft reply

1. Opening **Draft reply** for an item with no draft starts initial generation automatically and presents explicit source-loading and generation progress.
2. Initial generation is idempotent: remounts, React development effects, duplicate requests, or concurrent tabs return the first existing draft instead of creating extra revisions.
3. Opening an item with an existing draft never regenerates it automatically.
4. Manual **Generate again** remains available as an explicit new revision. It cannot silently discard unsaved edits.
5. The workspace uses a clear correspondence layout: source message and metadata are visually distinct from the authored reply editor, with a stacked mobile layout.
6. **Save draft** is enabled only for unsaved changes. **Send reply** is disabled while edits are unsaved, while another action is running, or after the revision has been sent.
7. The confirmation dialog identifies the actual destination and subject from fresh server-side source truth. Confirmation never trusts browser-provided recipient or threading data.
8. Sending remains Admin-only, explicit, threaded, revision-scoped, and retry-safe. Nothing in this plan introduces automatic sending.

## Architecture decisions

### 1. Destinations continue to own workflow launches

Do not move Chat, note capture, or reply behavior into `@brains/unified-inbox`.

- `@brains/web-chat` owns the `discuss-in-chat` launch contract and source-context request handling.
- `@brains/cms` owns the `capture-as-note` launch contract and note-editor prefill.
- `@brains/email-workflows` owns reply intent, source reads, draft generation, revisioning, and delivery.
- Inbox sources continue to own item listing, source detail, and source actions.

The shared follow-up registry remains a resolver, not a workflow engine.

### 2. Chat source context is live and session-scoped, not copied

Version the strict Web Chat handoff contract rather than accepting parallel legacy shapes. It should carry bounded source/item identifiers and a safe display label, not source content.

The Web Chat client consumes history state once, starts a fresh local conversation, and keeps the source reference only in memory for that attached chat session. Each turn sends the bounded reference to the authenticated Web Chat endpoint. The endpoint:

1. validates the reference;
2. resolves the registered Inbox source at request time;
3. calls `resolveDetail(itemId, actor, signal)`;
4. wraps returned text as explicitly untrusted inbound content; and
5. supplies it to the agent as a transient text attachment for that turn.

Do not append source text to the user message, conversation history, request logs, or metadata. Do not assign the transient attachment a reusable upload source reference. Normal assistant responses remain normal conversation history because the operator explicitly requested discussion, but the prompt must instruct the model not to reproduce or quote the source unless asked.

A page reload may detach the source context; this phase does not add durable conversation-to-mail bindings. Durable bindings require a separate retention and authorization decision.

### 3. Source reads fail closed

The source registry and source's own authorization remain authoritative. Web Chat must not infer an email reader, bypass source permissions, or query mail-item storage directly.

Apply existing source bounds plus a destination-side text ceiling before model submission. Forward request cancellation. Unavailable, unauthorized, expired, malformed, and aborted reads produce one fixed public outcome without leaking provider, locator, or mailbox details.

### 4. Capture persists only already-safe derived content

Extend the strict CMS create-prefill contract with a bounded body field populated from `InboxItem.summary`. This is existing derived Inbox content, not a new source read.

The browser handoff remains below the registry's state limit. The editor combines the summary and canonical entity backlink into the unsaved markdown body. It must not accept arbitrary source detail or mailbox fields.

### 5. Separate initial reply creation from regeneration

Add an operator operation with explicit ensure semantics, such as `ensureInitialDraft()`:

1. authorize and validate the mail item;
2. enter the existing keyed serial queue;
3. return the existing draft immediately when present;
4. otherwise read fresh source content, generate authored reply text, validate it, and persist revision 1.

Keep explicit regeneration as a separate action that intentionally creates a new revision. Do not make generic `generate()` ambiguously serve both idempotent initialization and revision creation.

### 6. Preserve approval and source-truth boundaries

Automatic generation is safe because clicking **Draft reply** expresses drafting intent and does not send externally. Delivery remains a separate confirmed action.

The unconfirmed send step should resolve fresh source truth for a useful confirmation summary. The confirmed step must independently re-read source truth and retain the existing stable per-revision idempotency key. Browser recipient, subject, message IDs, and references remain non-authoritative.

### 7. Reply drafting is an item-scoped destination, not a rail workspace

The drafting surface itself is justified — source message, authored reply,
revisions, and a confirm-gated send need room, and a panel inside the Inbox
detail would be worse. What is wrong is its **shape**: in CMS a workspace _is_ a
top-level rail entry, so a destination reachable only from one Inbox item gets
permanent billing beside Inbox and Sync, and opening it cold renders an empty
state (`mailItemId: null`). With the Email Reply Drafts collection alongside it,
the rail now carries three mail entries — the duplication the email-triage fold
removed one phase ago.

The underlying gap is in the follow-up contract: kinds need **deep-link
destinations that are not rail workspaces**. Resolve it one of two ways before
Phase 3 polishes the surface:

- **(a) Deep-link-only workspaces.** Add a registration flag so CMS mounts the
  route and renderer without a rail entry. Smallest change, keeps the bespoke
  renderer, and benefits every future item-scoped destination.
- **(b) Standard entity editor.** Drop the custom workspace and have
  `draft-reply` open the existing `email-reply-draft` entity in the normal
  editor with a confirm-gated Send action, leaving the existing collection as
  the browse surface. Removes a renderer and a rail entry, but requires an
  entity action that can carry send confirmation — verify that before choosing.

Recommendation: **(a)** unless entity actions already support confirmation, in
which case **(b)** is the smaller system. Either way the reply workspace stops
being a rail destination.

Predicates for any destination narrow on **item shape** — `entityRef.entityType`,
declared context, actor permission — never on `sourceId`. A destination testing
`sourceId` against known sources reintroduces the coupling the registry exists to
remove; one such clause has already been removed from the `draft-reply`
predicate.

### 8. Make state visible in the UI

Use the existing CMS and Web Chat design systems rather than introducing a separate visual language. The distinctive interaction should be a compact correspondence desk:

- visible attached-context treatment in Chat;
- useful prefilled markdown in Capture;
- source/reply separation, restrained status treatments, and one obvious next action in Draft reply;
- accessible labels, focus movement, live status announcements, disabled-state explanations, and keyboard operation;
- no decorative redesign that obscures dense operational information.

## Privacy and persistence matrix

| Data                                        | Browser                                  | Agent turn       | Conversation history     | Note entity after save | Reply-draft entity |
| ------------------------------------------- | ---------------------------------------- | ---------------- | ------------------------ | ---------------------- | ------------------ |
| Source ID + Inbox item ID                   | bounded                                  | routing          | no                       | backlink only          | mail item ID only  |
| Content-safe Inbox title/summary            | yes                                      | prompt UI        | user/assistant text only | yes, explicit save     | no                 |
| Original email body                         | reply workspace only; never Chat handoff | transient        | no raw payload           | no                     | no                 |
| Sender/recipient address and subject        | reply workspace/confirmation only        | only when needed | no automatic copy        | no                     | no                 |
| Raw message ID, references, private locator | no                                       | no               | no                       | no                     | no                 |
| Authored reply text                         | yes                                      | generation       | no                       | no                     | yes                |

The Chat model may produce derived discussion that becomes conversation history. Tests must distinguish this operator-requested output from persistence of the original source payload.

## Implementation phases

### Phase 0 — Unblock the baseline, then characterize

0. Land the two baseline fixes with their regression tests: the navigation guard
   in `replaceWorkspaceUrlQuery`, and the system-key strip before domain
   frontmatter validation in `editor-entities`. Nothing downstream is verifiable
   until a launch survives its own navigation.
1. Add failing tests for the three user-facing outcomes before product code.
2. Version and bound the Web Chat handoff/request schema.
3. Extend and bound the CMS note-prefill body schema.
4. Split idempotent initial reply generation from explicit regeneration in the action schema.
5. Preserve strict parsing; do not add compatibility aliases for ephemeral history state.

Gate:

- A launch reaches its destination with handoff state intact, proven by a test
  that exercises real router/history navigation rather than injected fakes.
- A restricted entity round-trips through load and save without the system
  `visibility` key reaching a strict domain schema.
- Tests demonstrate the current hollow behavior and the intended privacy boundaries.
- No original source content appears in browser handoff fixtures or persisted-message fixtures.

### Phase 1 — Source-backed Chat

1. Start a fresh local conversation when consuming an Inbox handoff.
2. Add the visible, removable context chip and editable initial prompt.
3. Send the bounded source reference with attached turns.
4. Resolve source detail server-side with current actor authorization, cancellation, bounds, and untrusted-content framing.
5. Preserve input/context on a failed read and clear context on detach/session change.

Gate:

- A route test proves the agent receives real source detail.
- A persistence test proves stored conversation messages contain no original source text, address, subject, raw ID, locator, or reusable attachment reference.
- Prompt-injection fixtures remain inert source content.

### Phase 2 — Useful note capture

1. Populate the handoff body from the safe Inbox summary.
2. Render summary plus source section in the unsaved note draft.
3. Cover absent summaries, hostile-looking text, state consumption, state limits, and schema mismatch.

Gate:

- The editor opens with useful markdown and never auto-saves.
- Raw source and classifier-only private fields cannot enter the prefill contract.

### Phase 3 — Automatic initial reply draft

0. Settle the destination shape from decision 7 first — polishing a rail
   workspace that is about to stop being one wastes the work.
1. Implement serialized `ensureInitialDraft()` behavior.
2. Trigger it once when an empty reply destination opens.
3. Keep explicit regeneration separate and protect unsaved edits.
4. Make source, generation, dirty, save, confirmation, send, sent, retry, and unavailable states explicit.
5. Generate the send confirmation summary from fresh source truth.

Gate:

- Strict-mode/remount and concurrent-request tests produce one revision.
- Existing drafts are not regenerated.
- Dirty text cannot be bypassed by sending an older saved revision from the UI.
- Delivery still occurs only after explicit confirmation.

### Phase 4 — Integrated UX verification

1. Run the canonical unified Inbox app with its existing posture command.
2. Use only the dedicated synthetic mailbox and preserve user-managed runtime configuration.
3. Rebuild app-managed outputs through the running app when required before inspection.
4. Verify all three workflows in an authenticated browser, including URL/history state, visible progress, keyboard/focus behavior, console errors, and network failures.
5. Capture evidence for narrow and wide layouts. Cancel the send confirmation; do not send a live message merely to verify UI.

Gate:

- **Discuss in chat:** the agent answers a question that requires the original synthetic email body.
- **Capture as note:** the editor contains the safe summary and backlink and remains unsaved.
- **Draft reply:** one initial draft appears without a second click and cannot send without review/save/confirmation.
- No claim of UI completion is based only on route inspection or unauthenticated `curl` output.

## Validation matrix

### Focused tests

- Web Chat follow-up resolution, handoff consumption, fresh-session behavior, source authorization, source unavailability, cancellation, request bounds, prompt-injection framing, and conversation persistence.
- CMS follow-up resolution, create-prefill parsing, markdown assembly, one-shot consumption, and no-auto-save editor behavior.
- Email workflow operator serialization, ensure-versus-regenerate semantics, revision conflicts, source failure, confirmation source truth, idempotent delivery replay, and UI state transitions.
- Unified Inbox rendering for follow-up labels, ordering, and launch-state bounds.
- Navigation exercised through the real router and history rather than injected
  `routerPush`/`browserPushState`/`reload` fakes, since fakes are exactly what
  hid the canonicalisation race.
- Save-path coverage for a **strict** frontmatter schema on a **non-public**
  entity. The CMS test harness previously registered only non-strict schemas and
  only public fixtures, so it could not express either half of that bug; a strict
  type now exists in the harness and should be used for policy-boundary tests.

### Repository checks

- targeted package tests first;
- `bun run typecheck`;
- `bun run lint`;
- formatting and changeset validation when implementation changes packages;
- full repository checks only if shared contracts or exported package boundaries change.

### Runtime checks

- `/health/live` and `/health/ready` are healthy before browser verification;
- authenticated browser reproduction for every follow-up;
- synthetic source content only;
- no credential, mailbox-body, or private locator logging.

## Non-goals

- Automatic email sending.
- Copying original email content into notes, conversations, reply-draft entities, or follow-up history state.
- Turning inbound email into a conversational interface.
- Persisting a durable conversation-to-mail association in this phase.
- Replacing the Inbox registry or centralizing destination behavior in `@brains/unified-inbox`.
- General-purpose CMS creation templates.
- Redesigning all CMS or Web Chat navigation.
- Fixing unrelated email-classification fallbacks.
- Supporting legacy handoff-state versions.

## Risks and mitigations

- **Inbound email prompt injection reaches the agent.** Frame source text as untrusted data, keep operator instructions separate, and test adversarial source bodies.
- **Chat leaks source content through persistence.** Keep body resolution server-side per turn, do not append it to stored user text, omit reusable attachment references, and inspect persisted messages in tests.
- **A client requests another Inbox item directly.** Validate strict identifiers and re-run source-owned authorization on every read; never treat the launch itself as authorization.
- **Repeated automatic generation creates revisions or spends tokens.** Use a server-side serialized ensure operation that returns an existing draft before any source read or AI call.
- **Automatic generation feels like automatic sending.** Keep drafting, saving, confirmation, and delivery visibly separate; retain explicit confirmation as the only delivery boundary.
- **Capture silently stores private content.** Use only already-derived title/summary plus the entity backlink and keep creation unsaved until operator action.
- **Concurrent work overlaps CMS or email-workflow files.** Implement in a dedicated worktree, rebase on current `main`, and reconcile user-owned changes explicitly rather than copying or overwriting them.
- **A fix verified only through injected fakes is not verified.** Both baseline defects passed their unit suites while failing in the running app. Any behavior asserted about navigation, history state, or entity policy needs at least one test on the real seam, and Phase 4's authenticated browser pass is the backstop.

## Success criteria

- Each follow-up produces a useful state after one click.
- Chat can reason from the selected source while raw source content remains out of browser handoff state and conversation storage.
- Capture produces an editable, useful, content-safe note draft without automatic persistence.
- Reply drafting creates exactly one initial revision automatically and never sends automatically.
- UI states make context, progress, unsaved work, approval, success, and failure obvious.
- Source, destination, permission, and delivery ownership remain in their existing packages.
- Authenticated runtime verification supports every shipped UI claim.

## Related documentation

- [Architecture overview](../architecture-overview.md)
- [Unified Inbox](../../plugins/unified-inbox/README.md)
- [Email workflows](../../plugins/email-workflows/README.md)
- [Web Chat](../../interfaces/web-chat/README.md)
