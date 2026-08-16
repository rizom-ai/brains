# Plan: Useful Inbox follow-up workflows

## Status

**Implemented on `main` in `e9042c9e0` — automated validation complete; authenticated browser acceptance pending.** Runtime review showed that Inbox follow-up routes existed but the destination workflows did not receive enough useful context. The launch-navigation and restricted-entity save defects found during that review landed in `2703663a1`.

This revision deliberately removes reply drafting from the active product scope. The drafting and approval-gated sending implementation is solid enough to retain, but its destination and UI are not ready to expose. The implementation remains dormant and tested while the visible Inbox focuses on two useful follow-ups: Chat and note Capture.

Implementation happens in the dedicated worktree at `/home/yeehaa/Documents/brains-worktrees/inbox-follow-up-workflows` and integrates directly into `main` without a pull request.

## Goal

Make the two visible Inbox follow-ups immediately useful and understandable:

- **Discuss in chat** starts a fresh chat with the selected Inbox item attached as live, source-backed context.
- **Capture as note** opens an editable note containing useful content-safe context and a source backlink.

At the same time, remove the unfinished reply-drafting surface from Inbox and CMS navigation without deleting its backend implementation or existing data.

## Current baseline

The underlying capabilities are present:

1. `InboxFollowUpRegistry` resolves destination-owned launches and validates bounded handoff state.
2. Inbox sources retain item ownership and may expose abortable, permission-checked `resolveDetail()` reads.
3. The email source resolves original mailbox content through a private locator store without persisting the original body, subject, addresses, or transport identifiers in Brain entities.
4. Web Chat accepts authenticated agent turns with attachments and tracks conversations.
5. CMS can prefill a new note editor from one-shot history state.
6. The launch-navigation race and non-public CMS save failure have regression coverage on `main`.
7. `@brains/email-workflows` contains tested source-backed reply generation, revisioning, confirmed sending, threading, and delivery idempotency, but currently registers an unfinished follow-up, workspace, and entity collection.

The remaining product failures are straightforward:

- Chat receives only a title/entity-reference sentence, so the agent cannot inspect the email being discussed.
- Capture creates an unsaved title plus a bare `Source:` line, so the operator still has to reconstruct the useful note.
- Draft reply and its CMS surfaces add unfinished workflow and navigation clutter that should not be exposed for now.
- Existing tests prove routing and schema bounds, but not useful authenticated outcomes.

## User-facing acceptance contract

### Discuss in chat

1. Clicking **Discuss in chat** opens Web Chat in a fresh client-side conversation, not an unrelated existing thread.
2. The composer contains a concise editable prompt and shows a removable Inbox-context chip with the safe item label.
3. While the context is attached, each submitted turn resolves current source detail on the server using the authenticated actor and an `AbortSignal`.
4. The agent can accurately summarize, assess, and discuss the original email without the browser receiving the source body.
5. Starting a new chat, selecting another conversation, or removing the chip detaches the Inbox context.
6. If source detail is expired or unavailable, Web Chat shows a fixed safe error, preserves the operator's text and context for retry, and does not silently run the turn without the requested source.

The browser may carry only bounded routing fields (`sourceId`, `itemId`, and a content-safe label). The source body remains server-side.

### Capture as note

1. Clicking **Capture as note** opens the note editor with:
   - the Inbox item title;
   - the existing content-safe derived summary when present; and
   - a human-readable source section containing the canonical entity backlink.
2. No original email body, subject header, sender address, raw message ID, or private source locator enters the handoff or note draft.
3. The note remains unsaved until the operator reviews and saves it. Navigation alone must not create durable content.
4. Missing optional summary content degrades to a title and source section rather than a malformed or empty editor.

### Reply drafting is dormant

1. Inbox items do not show a **Draft reply** or **Reply** follow-up.
2. CMS does not show a Reply drafts workspace or Email Reply Drafts entity collection.
3. The default `emailWorkflows()` composition does not register the reply-draft entity plugin, resolve the reply-drafting prompt, construct the draft operator, or register draft workspace/follow-up routes.
4. Existing reply-draft files and entities are not deleted or migrated. They remain untouched for a separately approved future recommissioning.
5. Backend operator, schema, threading, confirmation, and delivery tests remain. Dormant does not mean untested.
6. Do not add a public feature flag for an unfinished surface. Re-enabling reply drafting requires a future product plan that defines its destination and UI.

## Architecture decisions

### 1. Destinations continue to own workflow launches

Do not move Chat or note capture behavior into `@brains/unified-inbox`.

- `@brains/web-chat` owns the `discuss-in-chat` launch contract and source-context request handling.
- `@brains/cms` owns the `capture-as-note` launch contract and note-editor prefill.
- Inbox sources continue to own item listing, source detail, and source actions.

The shared follow-up registry remains a resolver, not a workflow engine.

### 2. Chat source context is live and session-scoped, not copied

Version the strict Web Chat handoff contract rather than accepting parallel legacy shapes. It carries bounded source/item identifiers and a safe display label, not source content.

The Web Chat client consumes history state once, starts a fresh local conversation, and keeps the source reference only in memory for that attached chat session. Each attached turn sends the bounded reference to the authenticated Web Chat endpoint. The endpoint:

1. validates the reference;
2. resolves the registered Inbox source at request time;
3. calls `resolveDetail(itemId, actor, signal)`;
4. wraps returned text as explicitly untrusted inbound content; and
5. supplies it to the agent as a transient text attachment for that turn.

Do not append source text to the user message, conversation history, request logs, or metadata. Do not assign the transient attachment a reusable upload source reference. Normal assistant responses remain conversation history because the operator explicitly requested discussion, but the prompt must instruct the model not to reproduce or quote the source unless asked.

A page reload may detach the source context. This plan does not add durable conversation-to-mail bindings; those require a separate retention and authorization decision.

### 3. Source reads fail closed

The source registry and source-owned authorization remain authoritative. Web Chat must not infer an email reader, bypass source permissions, or query mail-item storage directly.

Apply existing source bounds plus a destination-side text ceiling before model submission. Forward request cancellation. Unavailable, unauthorized, expired, malformed, and aborted reads produce one fixed public outcome without leaking provider, locator, or mailbox details.

### 4. Capture persists only already-safe derived content

Extend the strict CMS create-prefill contract with a bounded body populated from `InboxItem.summary`. This is existing derived Inbox content, not a new source read.

The browser handoff remains below the registry's state limit. The editor combines the summary and canonical entity backlink into the unsaved markdown body. It must not accept arbitrary source detail or mailbox fields.

### 5. Drafting code remains dormant outside runtime composition

Retain the reply-draft source modules and focused tests in `@brains/email-workflows`, but remove them from normal plugin construction and UI discovery.

The default factory should compose only the active mail-item entity and email workflow service. The service must stop resolving the draft prompt and registering the draft operator, follow-up, and workspace. CMS will therefore receive neither an `email-reply-draft` entity type nor an `EmailReplyDraftWorkspace` registration.

Do not delete stored draft files. Without the entity plugin they are inert data on disk. A future recommissioning must explicitly address existing revisions, destination shape, CMS visibility, and runtime migration before restoring composition.

### 6. Keep UI changes restrained and explicit

Use the existing CMS and Web Chat design systems rather than introducing a separate visual language.

- Chat gets a visible attached-context treatment and clear unavailable/retry state.
- Capture gets useful prefilled markdown.
- Draft controls and navigation disappear rather than being restyled.
- Accessible labels, focus movement, live status announcements, disabled-state explanations, and keyboard operation are part of acceptance.

## Privacy and persistence matrix

| Data                                        | Browser            | Agent turn | Conversation history     | Note entity after save |
| ------------------------------------------- | ------------------ | ---------- | ------------------------ | ---------------------- |
| Source ID + Inbox item ID                   | bounded            | routing    | no                       | backlink only          |
| Content-safe Inbox title/summary            | yes                | prompt UI  | user/assistant text only | yes, explicit save     |
| Original email body                         | never Chat handoff | transient  | no raw payload           | no                     |
| Sender/recipient address and subject        | no                 | no         | no automatic copy        | no                     |
| Raw message ID, references, private locator | no                 | no         | no                       | no                     |

The Chat model may produce derived discussion that becomes conversation history. Tests must distinguish this operator-requested output from persistence of the original source payload.

Existing dormant reply-draft entities retain only their previously approved authored-text and mail-item-reference shape; this plan neither reads nor rewrites them.

## Implementation phases

### Phase 0 — Retire reply-draft surfaces and characterize outcomes

1. Remove `EmailReplyDraftEntityPlugin` from the default `emailWorkflows()` composition.
2. Remove reply prompt resolution, operator construction, follow-up registration, and workspace registration from the active `EmailWorkflowsPlugin` lifecycle.
3. Remove any canonical-app guidance or UI expectations that advertise reply drafting.
4. Keep backend reply-draft tests and source modules; add composition tests proving they are not registered.
5. Add failing tests for the useful Chat and Capture outcomes before changing product code.
6. Version and bound the Web Chat handoff/request schema.
7. Extend and bound the CMS note-prefill body schema.
8. Preserve strict parsing; do not add compatibility aliases for ephemeral history state.

Gate:

- Inbox resolves no reply-draft follow-up.
- CMS exposes no reply-draft workspace or entity collection.
- Default composition does not initialize reply drafting or resolve its prompt.
- Existing draft files are untouched.
- Tests demonstrate the current hollow Chat/Capture behavior and intended privacy boundaries.

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

### Phase 2 — Useful note Capture

1. Populate the handoff body from the safe Inbox summary.
2. Render summary plus a human-readable source section in the unsaved note draft.
3. Cover absent summaries, hostile-looking text, state consumption, state limits, and schema mismatch.

Gate:

- The editor opens with useful markdown and never auto-saves.
- Raw source and classifier-only private fields cannot enter the prefill contract.

### Phase 3 — Integrated UX verification

1. Run the canonical unified Inbox app with its existing posture command.
2. Use only the dedicated synthetic mailbox and preserve user-managed runtime configuration.
3. Rebuild app-managed outputs through the running app when required before inspection.
4. Verify Chat and Capture in an authenticated browser, including URL/history state, visible progress, keyboard/focus behavior, console errors, and network failures.
5. Verify that Inbox and CMS contain no reply-draft entry points.
6. Capture evidence for narrow and wide layouts.

Gate:

- **Discuss in chat:** the agent answers a question that requires the original synthetic email body.
- **Capture as note:** the editor contains the safe summary and backlink and remains unsaved.
- **Draft retirement:** Inbox, CMS workspaces, and CMS entity collections expose no drafting UI.
- No claim of UI completion is based only on route inspection or unauthenticated `curl` output.

## Validation matrix

### Focused tests

- Web Chat follow-up resolution, handoff consumption, fresh-session behavior, source authorization, source unavailability, cancellation, request bounds, prompt-injection framing, and conversation persistence.
- CMS follow-up resolution, create-prefill parsing, markdown assembly, one-shot consumption, and no-auto-save editor behavior.
- Email workflow composition proving no draft entity, follow-up, workspace, prompt resolution, or operator initialization.
- Existing reply operator tests for revision conflicts, source failure, confirmation, threading, and idempotent delivery replay remain green.
- Unified Inbox rendering for follow-up labels, ordering, and launch-state bounds.
- Navigation exercised through the real router/history seam covered by the landed baseline fix.

### Repository checks

- targeted package tests first;
- `bun run typecheck`;
- `bun run lint`;
- formatting and changeset validation when implementation changes packages;
- full repository checks only if shared contracts or exported package boundaries change.

### Runtime checks

- `/health/live` and `/health/ready` are healthy before browser verification;
- authenticated browser reproduction for every visible workflow claim;
- synthetic source content only;
- no credential, mailbox-body, or private locator logging.

## Documentation changes during implementation

Update documentation that currently presents drafting as active, including:

- `plugins/email-workflows/README.md` and changelog context;
- `plugins/unified-inbox/README.md` where visible follow-ups are described;
- `docs/architecture-overview.md` package capability summaries;
- `docs/roadmap.md` and its generated visual;
- canonical unified Inbox test-app guidance;
- package changesets.

Describe the backend as retained but uncomposed, not deleted and not publicly available.

## Non-goals

- Reworking, expanding, or deleting the reply-drafting backend.
- Adding a configuration switch to expose reply drafting.
- Automatic email generation or sending.
- Copying original email content into notes, conversations, or follow-up history state.
- Turning inbound email into a conversational interface.
- Persisting a durable conversation-to-mail association.
- Replacing the Inbox registry or centralizing destination behavior in `@brains/unified-inbox`.
- General-purpose CMS creation templates.
- Redesigning all CMS or Web Chat navigation.
- Fixing unrelated email-classification fallbacks.
- Supporting legacy handoff-state versions.

## Risks and mitigations

- **Removing composition makes existing draft files inaccessible.** Preserve files unchanged and document that recommissioning needs an explicit migration/reconciliation step.
- **Dormant code silently rots.** Keep direct backend tests green while removing runtime-registration expectations.
- **Reply UI remains reachable through an overlooked path.** Assert the entity registry, CMS type list, workspace list, and resolved Inbox follow-ups in composition tests and authenticated runtime verification.
- **Inbound email prompt injection reaches the agent.** Frame source text as untrusted data, keep operator instructions separate, and test adversarial source bodies.
- **Chat leaks source content through persistence.** Keep body resolution server-side per turn, do not append it to stored user text, omit reusable attachment references, and inspect persisted messages in tests.
- **A client requests another Inbox item directly.** Validate strict identifiers and re-run source-owned authorization on every read; never treat the launch itself as authorization.
- **Capture silently stores private content.** Use only already-derived title/summary plus the entity backlink and keep creation unsaved until operator action.
- **A fix verified only through injected fakes is not verified.** Keep real router/history regression coverage and require authenticated browser verification.
- **Concurrent work overlaps relevant packages.** Implement in the dedicated worktree, update it from current `main`, and reconcile user-owned changes explicitly rather than copying or overwriting them.

## Success criteria

- Chat can reason from the selected source while raw source content remains out of browser handoff state and conversation storage.
- Capture produces an editable, useful, content-safe note draft without automatic persistence.
- Inbox and CMS expose no reply-drafting controls, workspace, or collection.
- The tested drafting/sending backend and existing draft files remain intact but uncomposed.
- Source, destination, permission, and persistence ownership remain in their existing packages.
- Authenticated runtime verification supports every shipped UI claim.

## Related documentation

- [Architecture overview](../architecture-overview.md)
- [Unified Inbox](../../plugins/unified-inbox/README.md)
- [Email workflows](../../plugins/email-workflows/README.md)
- [Web Chat](../../interfaces/web-chat/README.md)
