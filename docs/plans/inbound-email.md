# Plan: Inbound email

## Status

**Proposed.** Grows the inbound half of the existing `interfaces/email` message interface:
IMAP intake, parsing, and a published inbound-mail event. No triage, no drafting, no LLM —
those are [email-triage.md](./email-triage.md) and
[email-reply-drafting.md](./email-reply-drafting.md).

## Goal

Mail sent to the brain's address (e.g. `work@rizom.ai`) arrives inside the brain as a
structured, deduplicated event that other plugins can consume. This completes
`interfaces/email` per [connected-channels.md](./connected-channels.md) decision 4:
_"Future inbound email lands inside the same interface as a completion, not a new
integration."_

## What exists today (fact-check)

- `interfaces/email` (`@brains/email`) is an outbound-first `MessageInterfacePlugin`: it
  registers the `email` channel descriptor and, when its Resend transport is configured,
  the `email` delivery provider (`interfaces/email/src/index.ts`). It has no listener,
  no daemon, and no IMAP dependency.
- The plugin manager supports daemons: `context.registerDaemon(name, daemon)`
  (`shell/plugins/src/interface/context.ts`, `shell/plugins/src/manager/daemon-types.ts`).
- `shell/recurring-checks` cadences are `daily | weekly` only — unusable for inbox
  polling. Intake liveness must be a daemon-owned loop (IDLE or interval).
- The transport-injection pattern already exists in this package: `EmailInterface` takes
  `fetchImpl` via `EmailInterfaceDependencies` for testability. The IMAP client follows
  the same pattern.
- Identity resolution is registry-driven: a channel subject resolves through
  `resolveActorPrincipal` by channel type + hashed subject → person → permission level
  ([connected-channels.md](./connected-channels.md)). `email` is a registered channel
  type, so sender→person resolution needs no new auth machinery.

## Core decisions

1. **Inbound email lives in `interfaces/email`.** No `interfaces/inbound-triage` plugin;
   that shape (from the retired standalone triage plan) predates Phase 2c of
   connected-channels and would violate its decision 1/4 invariants.
2. **Email is an intake channel, not a conversational channel.** Inbound mail is
   **never** routed to `agentService.chat`. Unsolicited external text is untrusted input
   (prompt injection, unbounded model cost); the interface parses and publishes, and
   consumers decide what deserves a model. If two-way email conversation is ever wanted,
   that is a separate plan with its own trust design.
3. **The mailbox is the durable store; the event is at-least-once.** The interface never
   deletes or moves mail. It tracks a UID cursor in `runtimeState`, advances it only
   after the published event's subscribers complete, and stamps every event with the
   RFC 5322 `Message-ID` so consumers dedupe idempotently. No subscriber installed means
   the cursor does not advance — nothing is lost, nothing is buffered.
4. **The inbound contract is exported from `@brains/email`.** A Zod schema + message
   channel constant (`EMAIL_INBOUND`), mirroring the `@brains/notification-contracts`
   pattern. Payload: `{ messageId, threadId?, from: { name?, address }, to, subject,
receivedAt, text, html?, headers: { listUnsubscribe?, autoSubmitted?, precedence? },
sender?: { personId, permissionLevel } }`. Consumers depend on the workspace package,
   never on IMAP details.
5. **IDLE with interval fallback.** `POLL_MODE=idle|interval` (default `idle`); IDLE
   failure degrades to interval polling with backoff instead of crashing the daemon.
6. **Never log bodies or subjects.** Same posture as `shouldRedactDelivery` on the
   outbound side: logs carry message-ids and counts, not content. IMAP credentials come
   from the env schema and are never echoed.
7. **Dependencies: `imapflow` + `mailparser`,** added to `@brains/email` only.

## Config (`env-schema.ts` extension)

`IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_MAILBOX` (default
`INBOX`), `POLL_MODE` (default `idle`), `POLL_INTERVAL_MS` (default 60s). Inbound is
enabled only when the IMAP block is complete; outbound-only remains a first-class
configuration and an unconfigured inbound half registers no daemon.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0 — Walking skeleton: connected daemon.** Extend config/env schema; add an
  injected IMAP client interface (constructor dependency, like `fetchImpl`); register a
  daemon that connects, selects the mailbox, logs status, and disconnects cleanly on
  `stop()`. _Tests:_ config validation; daemon registered only when IMAP is configured;
  start/stop lifecycle against a fake client; no credential or mailbox content in logs.
- **Phase 1 — Intake: fetch → parse → publish.** UID-cursor fetch, `mailparser` parse,
  publish `EMAIL_INBOUND` per message, advance cursor after handler completion. _Tests:_
  `.eml` fixtures (plain, HTML, multipart, missing Message-ID → synthesized key); cursor
  advances only on success; replayed UIDs re-publish with the same `messageId`
  (at-least-once proven); redaction of logs.
- **Phase 2 — Liveness + sender identity.** IMAP IDLE with reconnect/backoff and
  interval fallback; resolve the sender address through the identity service (hashed
  `email` channel lookup) and enrich the event with `sender: { personId,
permissionLevel }` when known. _Tests:_ IDLE failure degrades to polling; backoff caps;
  known sender resolves, unknown sender yields no `sender` field; raw address never
  appears in logs.

## Out of scope

- Classification, lead entities, notifications — [email-triage.md](./email-triage.md).
- Drafting and sending replies — [email-reply-drafting.md](./email-reply-drafting.md).
- Conversational email (agent chat over mail) — deliberately excluded (decision 2).
- Non-IMAP intake (webhook providers, JMAP) — the daemon isolates transport; a second
  intake transport would slot behind the same published contract.

## Related plans

- [connected-channels.md](./connected-channels.md) — channel/descriptor/provider
  contracts this interface already implements outbound; decision 4 mandates this plan's
  shape.
- [email-triage.md](./email-triage.md) — first consumer of `EMAIL_INBOUND`.
- [unified-inbox.md](./unified-inbox.md) — where mail-derived attention items surface.
