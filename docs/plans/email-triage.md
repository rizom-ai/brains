# Plan: Email triage — safe derived mailbox attention

## Status

**Proposed, demand-gated, and sequenced after
[unified-inbox.md](./unified-inbox.md).** Its transport dependency has shipped:
`interfaces/email` publishes the at-least-once `EMAIL_INBOUND` contract. This plan is
now deliberately generic. It classifies meaningful inbound mail into a safe derived
`mail-item`; it does not define leads, draft replies, or opportunity promotion.

## Goal

Give the operator a useful answer to “what arrived and needs me?” without copying the
mailbox into Brain storage. Obvious bulk mail is discarded conservatively, meaningful
mail becomes a restricted derived record, and the original message remains exclusively
in the mailbox.

## What exists today (fact-check)

- `interfaces/email` (`@brains/email`) publishes `EMAIL_INBOUND` with parsed addresses,
  subject, text/HTML, selected headers, `messageId`, optional `threadId`, and optional
  resolved sender attribution (`interfaces/email/src/inbound-email.ts`). Delivery is
  at-least-once: its mailbox cursor advances only when a subscriber acknowledges.
- No email-triage service or `mail-item` entity exists.
- The generic `system_list` tool filters only by entity type and status. Combined
  category/priority/reply filtering needs one narrow domain query tool; ordinary
  get/update/delete operations should remain on the shared system tools.
- Service plugins can contribute typed CMS workspaces and dashboard links; directory
  sync and content pipeline are current examples.
- The unified-inbox plan is sequenced before this plan and defines the shared attention
  projection. Email triage should register a source there instead of inventing a second
  notification center.

## Core decisions

1. **Email triage and lead management are separate capabilities.** This plan owns safe
   mailbox classification and operator attention. Qualifying mail becomes a lead only
   in [lead-management.md](./lead-management.md), which consumes durable mail items and
   cannot block mailbox intake.
2. **Triage is the sole acknowledgement owner for raw inbound mail.** A deterministic
   discard acknowledges immediately. Meaningful mail acknowledges only after its
   derived record is durable. Classification or database failure returns an
   unacknowledged result so the shipped mailbox cursor retries.
3. **The mailbox remains the canonical message store.** Brain never persists the body,
   HTML, exact subject, raw addresses, recipients, headers, attachments, or raw
   `Message-ID`. The inbound contract gains an opaque, transport-owned `sourceRef` so a
   future reply-drafting capability can locate the original on demand. Reading the
   original remains a mailbox operation in this plan.
4. **`mail-item` is derived working knowledge, not a copied email.** It stores a
   generated non-quoting title and summary, classification, requested actions, and only
   the hashed/opaque source facts required for dedupe, correlation, and later lead
   matching. Every item has `restricted` visibility.
5. **Deterministic filtering is conservative.** A sender named `noreply` or one
   automatic-submission header is never sufficient to discard mail. Only multiple
   strong bulk signals (for example `List-Unsubscribe` plus bulk/list precedence) skip
   the model. Useful automated security, finance, booking, and support messages remain
   eligible and normally classify as `notification`, `finance`, or `support`.
6. **Classification is one structured model call per meaningful message.** The email is
   delimited as untrusted source material and never enters agent chat. The call returns
   `{ title, category, priority, needsReply, organization?, requestedActions, summary }`.
   Brain-specific triage guidance is ordinary `brain.yaml` configuration, not an
   environment variable.
7. **Replay is cheap and idempotent.** The entity ID is derived from the hashed message
   identifier. An existing item acknowledges without filtering or another model call.
   Discarded spam has no durable side effect; a rare mailbox replay may classify it
   again without producing duplicate state.
8. **Model poison cannot wedge the mailbox forever.** Classification attempts are
   counted by hashed message identifier in scoped runtime state. The first two failures
   remain unacknowledged. After the third, triage persists a safe high-priority
   `category=other` fallback titled “Unclassified email,” containing no source content
   and directing the operator to the mailbox. Database failure still holds the cursor.
9. **The operator surface is CMS-first and inbox-integrated.** An admin-only Email
   Triage CMS workspace owns combined filtering and typed status actions. A compact
   dashboard contribution links to it. New/high mail items register as a unified-inbox
   source; this plan does not add immediate push notifications.
10. **Keep the tool surface narrow.** Add `email_triage_list` for combined category,
    priority, status, and `needsReply` filters. Use `system_get`, `system_update`, and
    `system_delete` for ordinary entity operations.
11. **No mailbox content in observability.** Logs never contain source bodies, exact
    subjects, addresses, model prompts, model output, credentials, mailbox names, or
    transport exception messages. Fixed operation messages may carry only a derived
    item ID or count.
12. **The capability is explicit opt-in.** `@brains/email-triage` is a compound package
    containing the service and its tightly coupled `mail-item` entity plugin. It enters
    the canonical catalog but no fixed bundle and no generated instance configuration.

## `mail-item` entity

```ts
type MailCategory =
  | "opportunity"
  | "recruiting"
  | "support"
  | "finance"
  | "administrative"
  | "personal"
  | "notification"
  | "other";

type MailPriority = "high" | "normal" | "low";
type MailStatus = "new" | "reviewed" | "handled" | "archived";

interface MailItemFrontmatter {
  title: string;
  category: MailCategory;
  priority: MailPriority;
  status: MailStatus;
  needsReply: boolean;
  receivedAt: string;

  source: {
    ref: string;
    senderKey: string;
    threadKey?: string;
    personId?: string;
    domain?: string;
  };

  organization?: string;
  requestedActions: string[];
}

interface MailItemMetadata {
  title: string;
  category: MailCategory;
  priority: MailPriority;
  status: MailStatus;
  needsReply: boolean;
  receivedAt: string;
}
```

The markdown body is only the concise derived summary. `created`, `updated`,
`contentHash`, and `visibility` remain standard entity-service fields; a separate
`triagedAt`, raw dedupe field, topic list, and structured deadline are intentionally
omitted until a real workflow needs them.

## Configuration

```yaml
add: [email-triage]

plugins:
  email-triage:
    instructions: |
      Treat urgent security and financial notices as high priority.
      Administrative receipts normally need no reply.
```

The existing `plugins.email.imap` block remains the transport configuration. Triage
configuration does not enable IMAP and is not automatically emitted by `brain init`.

## Phased delivery (thin vertical slices, strict TDD)

A phase starts with its behavior matrix committed as failing tests. Implementation does
not begin until those tests are red for the intended reason.

- **Phase 0 — Contract + derived entity.** Extend `EMAIL_INBOUND` with an opaque
  `sourceRef`; add the compound package, Zod schemas, markdown adapter, canonical
  catalog entry, and stable derived ID. _Tests first:_ source reference contract;
  schema constraints; markdown round-trip; restricted visibility; stable IDs; persisted
  output contains no body, HTML, subject, address, header, recipient, or message ID.
- **Phase 1 — Subscribe → filter → classify → persist → acknowledge.** Register the one
  raw-mail subscriber, conservative bulk filter, injected structured classifier,
  scoped attempt state, fallback item, and idempotent persistence. _Tests first:_ bulk
  newsletter skips AI; `noreply` security warning, automated invoice, and support update
  are retained; spam is discarded; model called exactly once for meaningful mail;
  duplicate replay calls it zero additional times; first two classification failures
  hold the cursor; third creates the safe fallback; database failure never
  acknowledges; no source content appears in entities or logs.
- **Phase 2 — Operator surfaces.** Add `email_triage_list`, the admin-only CMS workspace,
  compact dashboard link/counts, and unified-inbox source registration. _Tests first:_
  combined filters and empty states; permission enforcement; workspace registration and
  lifecycle; typed status actions; dashboard/inbox data shape; source failure isolation;
  no endpoint or tool response exposes raw mailbox content.

## Out of scope

- Lead creation, semantic consolidation, fit, and merge/split operations —
  [lead-management.md](./lead-management.md).
- Reading original messages inside Brain — operators use the mailbox in this plan;
  on-demand retrieval belongs to reply drafting.
- Drafting and sending replies — [email-reply-drafting.md](./email-reply-drafting.md).
- Opportunity scoring and ranking — [bd-priority-engine.md](./bd-priority-engine.md).
- Push notifications — unified inbox owns attention policy and its digest.
- Attachments, full mailbox search, and non-email intake.

## Related plans

- [unified-inbox.md](./unified-inbox.md) — shared attention projection implemented before
  this plan.
- [lead-management.md](./lead-management.md) — downstream lead creation and
  consolidation.
- [email-reply-drafting.md](./email-reply-drafting.md) — future on-demand source read,
  drafting, approval, and send.
- Inbound intake is shipped code: `interfaces/email` publishes `EMAIL_INBOUND`.
