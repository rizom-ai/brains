# Plan: Email reply drafting and sending

## Status

**Proposed, gated.** Requires [email-triage.md](./email-triage.md) (the `lead` entity).
Inbound intake has shipped: `interfaces/email` publishes the `EMAIL_INBOUND` contract,
whose payload carries the `messageId`/`threadId` this plan threads replies with. Last
slice of the email funnel: draft a reply in the brain's voice, approve it, send it
threaded.

## Goal

For a lead that `needsReply`, the operator gets an in-voice draft stored on the lead,
edits or accepts it, and sends it as a proper threaded reply through the email
interface's delivery provider — with an explicit approval step in between, always.

## What exists today (fact-check)

- Outbound email works: `interfaces/email` registers the `email`
  `ChannelDeliveryProvider`; senders resolve it via
  `context.channels.getDeliveryProvider("email")` (the `@brains/notifications` dispatch
  path proves this end to end).
- **`ChannelDeliveryInput` has no threading fields** — `recipient`, `subject`, `text`,
  `html?`, `sensitivity`, `idempotencyKey` only. A reply that ignores
  `In-Reply-To`/`References` breaks recipients' thread view; this plan extends the
  contract.
- The `lead` entity carries `threadId`, the inbound `messageId`, the full inquiry body
  in its content, and the `drafted`/`replied` statuses reserved by
  [email-triage.md](./email-triage.md).
- Identity/voice guidance is being consolidated by
  [identity-profiles-and-expression.md](./identity-profiles-and-expression.md); drafting
  consumes whatever profile context the brain exposes rather than hardcoding persona
  text.

## Core decisions

1. **Draft-and-approve is the whole safety model.** Nothing is ever auto-sent to a
   human. The pipeline may draft eagerly; only an explicit, confirmation-gated
   `lead_reply` invocation sends. There is no auto-send configuration flag to misset —
   the capability does not exist.
2. **Drafting is generation, not agent chat.** `lead_draft` builds a prompt from the
   lead content plus plugin instructions (voice, negotiation posture, rate guidance —
   brain-config content, not code) and calls the shell's generation service. The
   untrusted inquiry body is quoted source material inside a template, not a message
   that steers an agent loop — the same trust posture that keeps shipped inbound
   intake non-conversational (inbound mail never reaches `agentService.chat`).
3. **Threading extends the shared delivery contract.** Add optional
   `threading?: { inReplyTo: string; references: string[] }` to `ChannelDeliveryInput`
   in `@brains/plugins`. The email provider maps it to RFC 5322 `In-Reply-To`/
   `References` headers on the Resend request; providers that don't understand
   threading ignore the field. Optional field, no migration, existing senders
   unaffected.
4. **Send truth over optimism.** `lead_reply` records `status=replied` plus the
   `providerDeliveryId` only on a `sent` result; a `failed` result leaves the lead
   `drafted` with the failure surfaced. Idempotency key is `${leadId}:${draftRevision}`
   so a retry cannot double-send and an edited draft can be re-sent deliberately.
5. **Drafts live on the lead** (`draftReply` plus a `draftRevision` counter), not as
   separate entities — one inquiry, one current draft; git-style draft history is not a
   requirement.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0 — Drafting.** `lead_draft` tool: prompt assembly from lead content +
  instructions + profile context, store `draftReply`, bump `draftRevision`, status →
  `drafted`. Redraft overwrites. _Tests:_ draft stored and revision bumped; category
  `platform-notification`/`spam` refuses to draft; inquiry body appears only as quoted
  material in the prompt (injected fake AI asserts prompt shape); no body content in
  logs.
- **Phase 1 — Threading contract.** Extend `ChannelDeliveryInput` with the optional
  `threading` field; email provider maps it to Resend headers. _Tests:_ contract schema
  accepts/omits threading; header mapping (`In-Reply-To`, `References` ordering);
  notifications-path sends without threading are byte-identical to today.
- **Phase 2 — Sending.** `lead_reply`: confirmation-gated; sends the current draft (or
  an operator-edited body) via the `email` delivery provider with
  `threading: { inReplyTo: lead.messageId, references: [...thread] }`; on `sent`,
  status → `replied` + `providerDeliveryId`; on `failed`, status stays `drafted`.
  _Tests:_ confirmation required (unconfirmed invocation sends nothing); idempotency
  key stability per revision; failure leaves state recoverable; subject gains `Re: `
  exactly once.

## Out of scope

- Follow-up sequences, reminders, snoozing — attention lives in
  [unified-inbox.md](./unified-inbox.md); scheduling machinery is not email-specific.
- Multi-turn email conversations (replies to our replies feed back through inbound
  intake as new mail on the same `threadId`; a conversational loop is a separate
  trust decision, deliberately not made here).
- Attachments and rich MIME composition — text (+ optional HTML) only.

## Related plans

- [email-triage.md](./email-triage.md) — owns the `lead` entity and status vocabulary.
- [connected-channels.md](./connected-channels.md) — the delivery-provider contract
  this plan extends.
- Inbound intake is shipped, not a plan: `interfaces/email` (`@brains/email`) publishes
  `EMAIL_INBOUND` with the `messageId`/`threadId` used for threading.
