# Plan: Email reply drafting and sending

## Status

**Implemented. Source reads, reply generation/editing, threaded delivery, and
approval-gated sending are shipped.**
[`@brains/email-workflows`](../../plugins/email-workflows/README.md) groups triage and
reply drafting as one installable email feature while retaining internal source and
destination ownership. Email triage persists only a safe derived `mail-item`; the
email interface owns the private IMAP locator and source read, and reply drafting
persists only newly authored text. Lead context from
[lead-management.md](./lead-management.md) remains optional enrichment, not the source
of recipient truth.

## Goal

For a mail item that needs a reply, fetch the original from its mailbox source on demand,
generate an in-voice draft without persisting the source message, let the operator edit
or accept it, and send a correctly threaded reply only after explicit approval.

## What exists today (fact-check)

- Outbound email works: `interfaces/email` registers the `email`
  `ChannelDeliveryProvider`; senders resolve it through the channel registry.
- Inbound email records a private locator before publishing `EMAIL_INBOUND` and
  exposes an Admin-only, bounded on-demand source-read operation in the web process.
- `ChannelDeliveryInput` carries optional bounded threading metadata alongside
  `recipient`, `subject`, `text`, `html?`, `sensitivity`, and `idempotencyKey`.
- The mail-item entity deliberately contains no original body, subject, address, or raw
  message identifier. Drafting resolves the mailbox source on demand rather than reading
  entity content.
- The registered **Draft reply** destination opens an Admin-only CMS workspace that can
  generate, edit, revision, and explicitly send the current saved reply. It never sends
  automatically.

## Core decisions

1. **Draft-and-approve is the safety boundary.** Nothing auto-sends. The pipeline may
   generate a draft, but only a confirmation-gated send operation can contact a human.
2. **The mailbox remains source of truth.** Consume the internal, permission-checked
   source-read operation owned by [inbox-follow-ups.md](./inbox-follow-ups.md). That
   operation resolves the mail item's opaque `source.ref` through the email interface's
   private locator store; this plugin defines no second locator, mailbox client, or read
   contract. The in-memory provider exists only in the web process, so source-backed
   draft generation and send preparation execute there; worker registration exposes no
   dependent operation. Original content never crosses process IPC and is held only for
   the active draft/send operation, never copied into a mail item, lead, log, or job
   payload owned by Brain.
3. **Drafting is structured generation, not agent chat.** The fetched email is delimited
   as untrusted source material. Voice and response guidance are explicit plugin
   configuration/profile context. No inbound instruction can enter an agent loop.
4. **Drafts are separate, per-mail-item records.** The restricted
   `email-reply-draft` entity stores only Brain-authored reply text, revision, delivery
   status/timestamps, and an optional accepted provider delivery ID. It links to one mail
   item; draft lifecycle does not overload mail or lead status, and optimistic revisions
   reject stale edits.
5. **Threading extends the shared delivery contract.** Carry optional
   `threading?: { inReplyTo: string; references: string[] }` to
   `ChannelDeliveryInput`. The email provider maps it to RFC 5322 headers; providers
   that do not support threading ignore it and existing senders remain unchanged.
6. **Send truth over optimism.** Record sent state and provider delivery ID only after a
   `sent` result. Failure leaves the current draft recoverable. An idempotency key tied
   to draft ID and revision prevents retry duplicates while allowing an edited revision
   to be sent deliberately.
7. **Lead context is optional.** A work, administrative, or personal mail item may need
   a reply without being a lead. When a linked lead exists, its derived
   intent and constraints may inform drafting, but it never supplies recipient or
   threading data.

## Phased delivery (thin vertical slices, strict TDD)

Tests are written and observed failing before implementation in every phase.

- **Phase 0 — Source-read integration gate (implemented).** Consume the shipped
  source-read contract and map an absent or unavailable provider to one fixed outcome
  without provider detail. Existing authored drafts remain editable when the mailbox is
  temporarily unavailable. Do not add another email-interface reader or locator.
  _Tests first:_ worker registration exposes no drafting destination; actor forwarding;
  valid/unavailable result handling; no source content copied into plugin state, IPC,
  logs, or job payloads; source bytes released after generation.
- **Phase 1 — Draft entity + generation (implemented).** Finalize the `email-reply-draft` schema and a
  confirmation-neutral draft operation that fetches the source, generates reply text,
  stores only the reply, and increments revision. _Tests first:_ raw source never
  persists; redraft creates a new revision; lead context optional; untrusted source is
  delimited; no content in logs.
- **Phase 2 — Threading contract (implemented).** Extend `ChannelDeliveryInput` and map threading to
  email-provider headers. _Tests first:_ schema accepts/omits threading; `In-Reply-To`
  and `References` ordering; existing notification delivery remains byte-identical.
- **Phase 3 — Approval + send (implemented).** Confirmation-gated send of the current revision through
  the email provider. _Tests first:_ unconfirmed invocation sends nothing; recipient
  and subject come from fresh source resolution; idempotency stability; failure keeps
  the draft editable; success records delivery ID exactly once.

## Out of scope

- Automatic sending, follow-up sequences, reminders, or conversational email loops.
- Storing original mailbox messages in Brain entities.
- Attachments and rich MIME composition.
- Lead consolidation and qualification — [lead-management.md](./lead-management.md).

## Related plans

- [`@brains/email-workflows`](../../plugins/email-workflows/README.md) — shipped; owns the
  derived mail item, reply revisions, confirmation, and delivery orchestration.
- [lead-management.md](./lead-management.md) — optional business context.
- [connected-channels.md](./connected-channels.md) — delivery-provider contract extended
  for threading.
- [inbox-follow-ups.md](./inbox-follow-ups.md) — owns the private source locator,
  source-read operation, and registered Draft reply entry-point contract.
- [`@brains/unified-inbox`](../../plugins/unified-inbox/README.md) — attention and digest policy.
