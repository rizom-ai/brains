# @brains/email-triage

Safe derived mailbox attention for brain instances.

`email-triage` answers "what arrived and needs me?" without copying the mailbox into Brain storage. Obvious bulk mail is discarded conservatively, meaningful mail becomes a restricted derived `mail-item`, and the original message stays exclusively in the mailbox.

The capability is explicit opt-in. It is a compound package containing the triage service and its tightly coupled `mail-item` entity plugin; it enters the canonical catalog but no fixed bundle, and `brain init` never emits it.

## What it does

- subscribes to the at-least-once `EMAIL_INBOUND` contract published by `interfaces/email`
- discards obvious bulk mail deterministically, before any model call
- classifies each remaining message with one structured model call into a `mail-item`
- owns acknowledgement of raw inbound mail, so a failure holds the mailbox cursor rather than losing a message
- registers an Admin-only Email Triage CMS workspace with combined filters and typed status actions
- contributes a compact dashboard count linking to that workspace
- registers a `mail-items` inbox source for `@brains/unified-inbox`

## The mailbox stays canonical

Brain never persists the body, HTML, exact subject, raw addresses, recipients, headers, attachments, or raw `Message-ID`. The inbound contract carries an opaque, transport-owned `sourceRef` so a later reply-drafting capability can locate the original on demand; reading it remains a mailbox operation.

Observability holds to the same line. Logs never contain source bodies, exact subjects, addresses, model prompts, model output, credentials, mailbox names, or transport exception messages. Fixed operation messages may carry only a derived item ID or count.

## `mail-item` entity

Every item has `restricted` visibility. The markdown body is only the concise derived summary.

```ts
const mailCategorySchema = z.enum([
  "opportunity",
  "recruiting",
  "work",
  "administrative",
  "personal",
]);

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
    threadOrdinal?: number;
    personId?: string;
    domain?: string;
  };

  organization?: string;
  requestedActions: string[];
}
```

The entity ID derives from the hashed message identifier, so replay is idempotent: an existing item acknowledges without filtering or another model call.

Thread position is assigned without reading mailbox content. A restartable coordinator
indexes `threadKey` and `threadOrdinal`, migrates legacy items in received-time/ID order,
and keeps the Inbox label hidden until a final exclusive catch-up commits its ready
marker. Once ready, new arrivals take the next indexed ordinal under a per-thread lock.
Directory export/import preserves the nested `source.threadOrdinal`; the UI deliberately
says **message N in thread**, never an unstable total.

## Classification

Categories are routing decisions, not message forms: `opportunity` for prospective commercial or collaboration work, `recruiting` for employment and hiring, `work` for existing professional/project/client/support correspondence, `administrative` for finance/legal/security/scheduling/account operations and their automated notices, and `personal` for non-work relationships.

A normal projection always carries one category. `null` is reserved for the system-authored poison fallback and is never a model choice.

Deterministic filtering is deliberately conservative. A sender named `noreply`, or a single automatic-submission header, never suffices to discard mail — only multiple strong bulk signals (for example `List-Unsubscribe` plus bulk/list precedence) skip the model. Useful automated security, finance, booking, and support messages stay eligible.

The email is delimited as untrusted source material and never enters agent chat. The editable `email-triage:classification` prompt supplies the routing rubric and may tune prioritization, but cannot expand the enum; the safety envelope, output schema, untrusted-source boundaries, and persistence validator are code-owned.

## Acknowledgement and poison handling

Triage is the sole acknowledgement owner for raw inbound mail:

- a deterministic discard acknowledges immediately
- meaningful mail acknowledges only after its derived record is durable
- classification or database failure returns an unacknowledged result, so the mailbox cursor retries

Classification attempts are counted by hashed message identifier in scoped runtime state — the same mechanism the mailbox cursor uses. The first two failures stay unacknowledged. After the third, triage persists a safe high-priority `category=null` fallback titled "Unclassified email", containing no source content and directing the operator to the mailbox. Database failure still holds the cursor. Attempt counters are deleted as soon as a message resolves, so the state holds counters only for messages currently wedged.

## Tools

| Tool                | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `email_triage_list` | list items with combined category, priority, status, and `needsReply` filters |

Ordinary entity operations use `system_get`, `system_update`, and `system_delete`.

## Configuration

The plugin takes no options:

```yaml
add: [email-triage]
```

To also install the shared live aggregation DataSource and digest participation:

```yaml
add: [email-triage, unified-inbox]
```

The existing `plugins.email.imap` block remains the transport configuration. Triage does not enable IMAP.

## Scope

Lead creation, semantic consolidation, and merge/split belong to lead management. Drafting and sending replies, and on-demand retrieval of the original message, belong to reply drafting. Opportunity scoring and ranking belong to the priority engine. Cross-source ordering, shared operator surfaces, confirmation routing, and digest behavior are owned by `@brains/unified-inbox`. Attachments, full mailbox search, and non-email intake are out of scope.
