# Plan: Reply drafts saved to the mailbox

## Status

Proposed.

## Background

`@brains/email-workflows` triages incoming mail into the Inbox. It holds a reply backend that no brain runs: an operator that writes a draft with the AI, stores it as an `email-reply-draft` entity, and sends it through the email interface's Resend transport after a confirmation.

That backend was built with a Studio page of its own and switched off a day later, because the page was the wrong place for it. It also sends from the brain: the reply leaves from the brain's sender address, through a different mail service than the mailbox, and is not filed in the mailbox's Sent folder. A person who answers mail from the brain ends up with a conversation split across two senders and no record of their own replies where they read mail.

The package already holds the rule that resolves this: the mailbox stays canonical. The brain stores no message body, subject or address; it reads the original from the mailbox on demand.

## Goal

A reply draft is a message in the mailbox's Drafts folder.

1. An admin opens an email in the Inbox that needs a reply and chooses **Draft reply**.
2. The brain reads the original from the mailbox, writes a reply with the AI, and saves it into the Drafts folder of the same mailbox: addressed to the sender, with the subject and threading headers of a reply.
3. The person opens their mail program, finds the draft in the conversation, edits it, and sends it there.

The brain never sends a reply. The sender address, the Sent folder, threading and delivery are the mail program's and the mail provider's, as for a reply written by hand.

## Non-goals

- No send button, confirmation step or delivery from the brain for replies.
- No editor for the draft in Studio. The mail program is the editor.
- No drafting without a request. A draft is written when an admin asks for one, never on arrival.
- No reply-draft entity. The draft is not stored in the brain.
- No change to outbound mail the brain already sends itself (invitations, notifications), which stays on its transport.

## Design

### Flow

```
Inbox item (needs reply)
  └─ action "Draft reply"            admin only
       └─ email-workflows            reads the mail item's sourceRef
            └─ request: read source  → email interface → mailbox (as today)
            └─ AI writes reply text  untrusted-source boundary, as today
            └─ request: save draft   → email interface
                 └─ re-reads the original by its locator
                 └─ builds the reply message
                 └─ APPEND to the Drafts folder, flagged \Draft
       └─ item shows "Draft in mailbox"
```

Failure branches, each ending in one fixed outcome with no provider detail:

- The original cannot be read (expired locator, mailbox down): nothing is written; the action fails with "Original content is unavailable".
- The AI call fails or is cancelled: nothing is written.
- The mailbox has no Drafts folder the brain can find, or refuses the write: nothing is recorded; the action fails with "The draft could not be saved to the mailbox".
- A draft for this email already exists in the mailbox: see [One draft per email](#one-draft-per-email).

### Who owns what

- **Email interface** (`interfaces/email`) owns the mailbox connection and everything that is mail: finding the Drafts folder, building the message, appending it. It answers one new request, beside the source read it already answers.
- **Email workflows** (`plugins/email-workflows`) owns the decision to draft, the AI call and the Inbox action. It never sees a mailbox name, a UID or a raw header, as today.

### The save-draft request

A contract in `@brains/contracts` beside `emailSourceReadContract`:

- Request: the opaque `sourceRef` of the mail item, the reply text, the actor.
- Response: `saved`, `exists` or `unavailable`.

The interface builds the message from the original it re-reads by locator, so the recipient, subject and threading come from the mailbox and never from the caller:

- `To`: the original's `Reply-To`, else its `From`.
- `Subject`: `Re: ` and the original subject, unless it already starts with `Re:`.
- `In-Reply-To` and `References`: the rules `replyReferences` in `reply-drafts/operator.ts` holds today.
- `From`: the mailbox's own address (see below).
- Body: the reply text as plain text. The original is not quoted; the mail program shows it in the conversation.

The message is composed with `nodemailer`'s mail composer (`nodemailer` 10 is already installed as a dependency of `mailparser`); `interfaces/email` takes it as a direct dependency. `imapflow` 1.6.5 provides `append(path, content, flags)` and reports each folder's special use, which is how the Drafts folder is found.

### Settings

Two optional settings under the email interface's `imap` block:

- `address`: the address replies are written from. When absent, the IMAP `user` is used if it is an email address. With neither, drafting is unavailable and the Inbox offers no **Draft reply**.
- `draftsMailbox`: the folder to save into. When absent, the folder the server marks as Drafts.

The brain needs write access to the Drafts folder. A mailbox credential that can only read leaves drafting unavailable; triage is unaffected.

### One draft per email

The interface keeps, in its private runtime state beside the source locators, which draft it wrote for which `sourceRef`: the Drafts folder's UIDVALIDITY and the UID the append returned.

- **Draft reply** on an email whose recorded draft is still in the folder answers `exists`, and the Inbox says the draft is already in the mailbox.
- A recorded draft that is gone (sent, deleted or moved by the person) is forgotten, and a new one may be written.
- The brain never deletes or overwrites a message in the mailbox. A person who wants another version deletes the draft in their mail program and asks again.

A server that does not report the UID of an appended message leaves nothing to record; drafting works and a second request writes a second draft. This is stated in the package README.

### Inbox

`MailTriageInboxSource` offers a third action on items that need a reply, when drafting is available: **Draft reply**, before **Done** and **Dismiss**. It is admin-only like the other two.

An item whose draft is in the mailbox carries a facet value the Inbox shows on the row and in the detail, and offers no **Draft reply**.

Inbox source actions return nothing today, so the outcome is read from the item after the action, not from a message. No change to the Inbox contract is needed.

### What the AI is told

The prompt builder and its boundary around untrusted source text carry over from `buildReplyDraftPrompt`. The drafting guidance is an editable prompt, `email-workflows:reply-drafting`, resolved when a draft is requested so an edit applies to the next draft.

The check that rejects a generated reply for repeating the source is narrowed. It keeps rejecting a reply that contains a message identifier or a recipient address from the headers, and stops rejecting a reply that repeats the subject or a passage of the body: a reply that names what it answers is a normal reply.

### What is removed

- `EmailReplyDraftOperator.save`, `sendConfirmed`, `snapshot` and the revision checks.
- The `email-reply-draft` entity: `reply-drafts/entity/*`, its exports, its byte pins in `packages/brain-cli/test/email-workflows-runtime.test.ts`, and its mentions in `docs/plans/frontmatter-hygiene.md`.
- `reply-drafts/schemas.ts`.
- The "Dormant reply backend" section of the package README, the matching lines in `plugins/unified-inbox/README.md`, `docs/architecture-overview.md` and `docs/studio-workspaces/capabilities.md`, and the stale ownership lines in `docs/plans/lead-management.md`.
- The Studio test that pins the retired renderer stays: that renderer stays retired.

`threading` on the channel delivery input stays; it is part of the delivery contract and costs nothing unused.

`email-reply-draft` files a brain wrote in August 2026 stay in its content repo untouched. No brain registers the type, so they are not read; the README says they may be deleted by hand.

## Phases

Each phase ships on its own and is tested as it lands.

1. **A draft lands in the mailbox.** The save-draft contract; the interface finds the Drafts folder, builds the reply and appends it. Tests drive the interface with a fake mailbox client and assert the message's headers, body, folder and flag, and each `unavailable` branch. A manual check on the unified-inbox test app against the smoke mailbox confirms the draft opens in a mail program inside the right conversation and sends from the mailbox address.
2. **Draft reply in the Inbox.** The operator reduced to read, write, save; the editable prompt; the narrowed copy check; the Inbox action and the "Draft in mailbox" state; admin-only and web-process-only. Tests cover the action end to end with a fake interface, a non-admin refusal, and cancellation writing nothing.
3. **One draft per email.** The recorded draft, `exists`, and forgetting a draft that left the folder.
4. **Removal and docs.** The entity, the send path, the schemas, and the documents listed above; a changeset; the package README rewritten around the mailbox draft.

## Verification

- `bun test` in `interfaces/email` and `plugins/email-workflows`; `bun run typecheck`; `bun scripts/lint.mjs --force --filter @brains/email --filter @brains/email-workflows`.
- On the unified-inbox test app with the smoke mailbox: send a message that asks a question, wait for triage, choose **Draft reply**, and confirm in a mail program that one draft sits in the conversation, addressed to the sender, from the mailbox address; send it and confirm it is filed under Sent and the recipient sees one thread. Choose **Draft reply** again before sending and confirm no second draft appears.

## Open risk

Drafts folders and append behavior differ between mail providers. Phase 1's manual check covers Migadu, the smoke mailbox's provider. Gmail and Microsoft 365 are checked before the feature is offered to a brain on either.
