# Plan: Email triage — the lead entity and classification pipeline

## Status

**Proposed, demand-gated.** Its hard dependency has shipped: `interfaces/email`
publishes the `EMAIL_INBOUND` contract. Building it before the platform profiles are
live and inquiries actually arrive triages nothing; build the walking skeleton when
inbound volume exists or is imminent.

## Goal

Every inbound email is automatically classified, scored for fit, and — when it is a real
inquiry — persisted as a `lead` entity the operator can list, filter, and act on.
`system_search`/`lead_list` over leads becomes the intake funnel view; hot leads surface
for fast response.

## What exists today (fact-check)

- **Inbound email is shipped.** `interfaces/email` (`@brains/email`) delivers
  `EMAIL_INBOUND` events — at-least-once, deduplicated by `messageId`, schema exported
  from the package — consumable via `context.messaging.subscribe`
  (`interfaces/email/src/inbound-email.ts`).
- **No lead entity exists** — greenfield. `entities/wishlist` is the closest template:
  durable entity, enum `status`, `interceptCreate` dedup, a `ListWidget` dashboard tile.
- `context.ai.generateObject(prompt, schema)` exists on plugin contexts
  (`shell/plugins/src/entity/context.ts`) for structured classification.
- The `opportunity` entity (`@brains/business-development`,
  [bd-priority-engine.md](./bd-priority-engine.md), in progress on
  `feat/opportunity-priority-engine`) is decision-shaped: value/integrity scores, states,
  ranking. It is explicitly **not** a CRM and must not absorb mail-shaped state.

## Core decisions

1. **`lead` is a dedicated entity, upstream of `opportunity`.** A lead is mail-shaped
   evidence (who wrote, what they want, does it fit); an opportunity is decision-shaped
   (value scores, integrity gate, active/staged/warm). The seam is **promotion**: a
   promising lead is promoted into an `opportunity` capture, which then owns the deal
   lifecycle. Neither entity duplicates the other's fields. Package: `entities/lead`
   (`@brains/lead`), separate from `@brains/business-development` — intake and
   prioritization evolve independently, and neither ships in a public reference preset.
2. **Deterministic pre-filter before any model call.** `noreply@` senders, a
   `List-Unsubscribe` header, `Auto-Submitted`, or bulk `Precedence` classify as
   `platform-notification` with zero LLM cost. Cost control is the pre-filter, not model
   routing.
3. **Classification is one `generateObject` call** returning `{ category, fit,
extracted, needsReply }` against the lead schema. The rubric lives in the plugin's
   `getInstructions()`/prompt, so brain-specific fit criteria (e.g. Rizom's rate and
   role preferences) are configuration-time content, not code.
4. **Dedupe on `messageId` via `interceptCreate`** (the `entities/wishlist` pattern):
   replayed at-least-once events and IMAP re-reads collapse to one lead.
5. **Fit is an enum (`hot | warm | cold`), not a score.** Deterministic filters and
   widget grouping beat a spurious-precision float; ranking with real scoring already
   belongs to `opportunity` after promotion.
6. **Status vocabulary is defined here, once:**
   `new | drafted | replied | promoted | ignored`. This plan uses `new`, `promoted`,
   `ignored`; [email-reply-drafting.md](./email-reply-drafting.md) owns the transitions
   into `drafted` and `replied`. No won/lost/proposal states — that pipeline lives on
   `opportunity`.

## `lead` entity — data model

```
messageId    : string                       # dedupe key
threadId?    : string
from         : { name?, address }
source       : string                       # inferred from sender domain, free text
subject      : string
receivedAt   : ISO
category     : "inquiry" | "recruiter" | "platform-notification" | "admin" | "spam"
fit          : "hot" | "warm" | "cold"
needsReply   : boolean
extracted    : { roles: string[], tech: string[], budget?, remote?, timeline? }
status       : "new" | "drafted" | "replied" | "promoted" | "ignored"
draftReply?  : string                       # written by email-reply-drafting.md
opportunityId?: string                      # set on promotion
```

The body text stays in the entity content (markdown), not in frontmatter, so search and
drafting see the full inquiry while list views stay light.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0 — Walking skeleton: the entity.** `entities/lead` with schema, adapter,
  `EntityPlugin`, `getInstructions()`; manual capture via `system_create`. _Tests:_
  schema validation, markdown round-trip, status/category/fit constraints.
- **Phase 1 — Pipeline: subscribe → filter → classify → persist.** Subscribe to
  `EMAIL_INBOUND`; deterministic pre-filter; `generateObject` classification for the
  remainder; `createEntity` with `interceptCreate` dedupe. _Tests:_ fixture set (real
  inquiry, recruiter blast, platform notification, spam) with an injected fake AI
  service; pre-filtered mail never reaches the model; duplicate `messageId` creates one
  lead; body content absent from logs.
- **Phase 2 — Views.** `lead_list` (filter by status/fit/category) and `lead_get`
  tools over `entityService`; a `ListWidget` dashboard tile grouped by fit (model on
  `entities/wishlist`). _Tests:_ filter correctness, empty states, widget dataProvider
  shape.
- **Phase 3 — Attention + promotion.** Hot leads publish a `notifications:send` push
  (idempotencyKey = `messageId`; title/summary only, never the body) and register as a
  [unified-inbox.md](./unified-inbox.md) source once that contract exists. `lead_promote`
  creates an `opportunity` capture (title, source context, link back via
  `opportunityId`, status → `promoted`) — this step lands only after
  `@brains/business-development` merges to main; until then promotion is not exposed.
  _Tests:_ notification dedupe and content redaction; promotion round-trip; inbox items
  disappear when a lead leaves `new`.

## Out of scope

- Reply drafting and sending — [email-reply-drafting.md](./email-reply-drafting.md).
- Deal pipeline, scoring, ranking — [bd-priority-engine.md](./bd-priority-engine.md).
- Non-email intake (contact forms, ATProto mentions). The pipeline subscribes to the
  email contract; a second source would justify extracting a shared intake abstraction
  at that moment, not speculatively now.

## Related plans

- The event source is shipped code, not a plan: `EMAIL_INBOUND` from `@brains/email`.
- [bd-priority-engine.md](./bd-priority-engine.md) — the promotion target.
- [unified-inbox.md](./unified-inbox.md) — the attention surface for hot leads.
