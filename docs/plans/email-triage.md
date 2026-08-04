# Plan: Email triage — safe derived mailbox attention

## Status

**Phases 0–2A implemented; remaining Phase 2B waits for
[unified-inbox.md](./unified-inbox.md).** `interfaces/email` publishes
the at-least-once `EMAIL_INBOUND` contract with an opaque source reference, and the
opt-in `@brains/email-triage` capability classifies meaningful inbound mail into a safe
derived `mail-item`. The local CMS, query tool, typed status actions, and compact
dashboard contribution are implemented without the shared inbox contract. This plan
does not define leads, draft replies, or opportunity promotion.

## Goal

Give the operator a useful answer to “what arrived and needs me?” without copying the
mailbox into Brain storage. Obvious bulk mail is discarded conservatively, meaningful
mail becomes a restricted derived record, and the original message remains exclusively
in the mailbox.

## What exists today (fact-check)

- `interfaces/email` (`@brains/email`) publishes `EMAIL_INBOUND` with parsed addresses,
  subject, text/HTML, selected headers, `messageId`, opaque `sourceRef`, optional
  `threadId`, and optional resolved sender attribution. Delivery is at-least-once: its
  mailbox cursor advances only when a subscriber acknowledges.
- The opt-in `@brains/email-triage` compound package owns the restricted `mail-item`
  entity and the acknowledgement-gated filter/classify/persist service. It is in the
  canonical catalog but no fixed bundle.
- The Admin-only Email Triage CMS workspace provides combined client-side filters and
  typed reviewed/handled/archive actions over a bounded derived snapshot.
  `email_triage_list` provides server-side combined category, priority, status, and
  reply filtering; ordinary get/update/delete operations remain on shared system tools.
- A compact Admin dashboard contribution shows source-owned new/high/reply/unclassified
  counts and links to the CMS workspace when CMS is mounted.
- No unified-inbox source registration exists yet.
- The unified-inbox contract does not exist yet. That blocks only source registration,
  cross-source aggregation, and digest policy. Email triage's source-owned CMS, query
  tool, typed status actions, and compact dashboard link/counts can ship first without
  inventing a second notification center.

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
   eligible and classify by purpose rather than message form.
6. **Classification is one structured model call per meaningful message.** The email is
   delimited as untrusted source material and never enters agent chat. A fixed schema
   defines the five routing categories; the editable `email-triage:classification`
   prompt supplies their routing rubric and may tune prioritization but cannot expand
   the enum. The
   schema-constrained call returns either a retained projection
   `{ decision: "retain", title, category, priority, needsReply, organization?, requestedActions, summary }`
   or `{ decision: "discard", reason: "spam" }`. The model must choose the closest
   routing category for retained mail; invalid output follows the retry policy.
   Rationale and confidence are not persisted.
7. **Replay is cheap and idempotent.** The entity ID is derived from the hashed message
   identifier. An existing item acknowledges without filtering or another model call.
   Discarded spam has no durable side effect; a rare mailbox replay may classify it
   again without producing duplicate state.
8. **Model poison cannot wedge the mailbox forever.** Classification attempts are
   counted by hashed message identifier in scoped runtime state — the same
   runtime-state mechanism the mailbox cursor uses. The first two failures remain
   unacknowledged. After the third, triage persists a safe high-priority
   `category=null` fallback titled “Unclassified email,” containing no source content
   and directing the operator to the mailbox. Database failure still holds the cursor.
   Attempt counters are deleted the moment a message resolves — item persisted,
   fallback persisted, or deterministic discard acknowledged — so the state holds
   counters only for messages currently wedged, never one per message ever failed.
9. **The local operator surface is CMS-first and inbox-independent.** An admin-only
   Email Triage CMS workspace owns combined filtering and typed status actions. A
   compact dashboard contribution provides source-owned counts and a link to that
   workspace; it is not a second cross-source inbox. Once the shared inbox contract
   exists, new/high mail items register there. This plan does not add immediate push
   notifications.
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
const mailCategorySchema = z.enum([
  "opportunity",
  "recruiting",
  "work",
  "administrative",
  "personal",
]);

type MailCategory = z.output<typeof mailCategorySchema>;

type MailPriority = "high" | "normal" | "low";
type MailStatus = "new" | "reviewed" | "handled" | "archived";

interface MailItemFrontmatter {
  title: string;
  category: MailCategory | null;
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
  category: MailCategory | null;
  priority: MailPriority;
  status: MailStatus;
  needsReply: boolean;
  receivedAt: string;
}
```

The classifier applies the categories in routing terms: `opportunity` for prospective
commercial or collaboration work, `recruiting` for employment and hiring, `work` for
existing professional/project/client/support correspondence, `administrative` for
finance/legal/security/scheduling/account operations and their automated notices, and
`personal` for non-work relationships. Message form does not decide category. A normal
projection always has one category; `null` is reserved for the system-authored poison
fallback and is never a model choice.

The markdown body is only the concise derived summary. `created`, `updated`,
`contentHash`, and `visibility` remain standard entity-service fields; a separate
`triagedAt`, raw dedupe field, topic list, and structured deadline are intentionally
omitted until a real workflow needs them.

## Configuration

```yaml
add: [email-triage]
```

The classifier resolves the standard `email-triage:classification` prompt, materializing
its built-in routing rubric as an editable prompt entity when needed. The code-owned
safety envelope, fixed output schema, untrusted-source boundaries, and persistence
validator are not editable prompt content. The existing `plugins.email.imap` block
remains the transport configuration. Triage does not enable IMAP and is not
automatically emitted by `brain init`.

## Phased delivery (thin vertical slices, strict TDD)

Schemas are defined first in each phase, TypeScript types are derived from those Zod
schemas with `z.output`, and behavior tests are then written against the schemas. A
phase's implementation does not begin until its behavior matrix is red for the intended
reason.

- **Phase 0 — Contract + derived entity — implemented.** Extend `EMAIL_INBOUND` with an opaque
  `sourceRef`; add the compound package, Zod schemas, markdown adapter, canonical
  catalog entry, and stable derived ID. _Tests first:_ source reference contract;
  schema constraints; markdown round-trip; restricted visibility; stable IDs; persisted
  output contains no body, HTML, subject, address, header, recipient, or message ID;
  the category schema exposes exactly the five routing categories, normal projections
  require one of them, and only the system fallback may persist `category=null`.
- **Phase 1 — Subscribe → filter → classify → persist → acknowledge — implemented.** Register the one
  raw-mail subscriber, conservative bulk filter, injected structured classifier,
  scoped attempt state, fallback item, and idempotent persistence. _Tests first:_ bulk
  newsletter skips AI; `noreply` security warning, automated invoice, and support update
  are retained; spam is discarded; model called exactly once for meaningful mail;
  duplicate replay calls it zero additional times; first two classification failures
  hold the cursor; third creates the safe fallback; the attempt counter is removed on
  successful persistence, fallback persistence, and discard acknowledgement; database
  failure never acknowledges; no source content appears in entities or logs.
- **Phase 2A — Source-owned operator surfaces — implemented independently of unified inbox.** Add
  `email_triage_list`, the admin-only CMS workspace, typed status actions, and a compact
  dashboard link/count contribution. The dashboard contribution reports only mail-item
  counts and links to the workspace; it does not aggregate other sources or send a
  digest. _Tests first:_ combined filters and empty states; permission enforcement;
  workspace registration and lifecycle; typed status transitions; dashboard data shape;
  no endpoint, tool response, or dashboard payload exposes raw mailbox content.
- **Phase 2B — Shared inbox integration — blocked on unified inbox.** After the
  `InboxSource` contract and aggregation surfaces exist, register new/high mail items as
  a source with reviewed, handled, and archive actions. Reuse the Phase 2A status
  operations rather than adding parallel mutation logic. _Tests first:_ source mapping
  and empty state; admin enforcement at the source action boundary; action-to-status
  transitions; handled items disappear on re-list; no inbox item exposes raw mailbox
  content. Cross-source ordering, failure isolation, and digest behavior remain owned by
  the unified-inbox plan.

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

- [unified-inbox.md](./unified-inbox.md) — shared attention projection required only
  for Phase 2B source registration and digest participation.
- [lead-management.md](./lead-management.md) — downstream lead creation and
  consolidation.
- [email-reply-drafting.md](./email-reply-drafting.md) — future on-demand source read,
  drafting, approval, and send.
- Inbound intake is shipped code: `interfaces/email` publishes `EMAIL_INBOUND`.
