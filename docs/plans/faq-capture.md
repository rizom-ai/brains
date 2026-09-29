# Plan: FAQ capture from chats

## Status

Slices 1–3 and the hardening below implemented on `work/faq` (PR #434); slice 4 next.

## Goal

A `faq` entity type, owned by `entities/faq`, that captures reusable question-and-answer pairs from chat conversations as draft entities, at the visibility of the turn that produced the answer.

## Decisions

- **Ingress is `conversation:messageAdded`.** The FAQ plugin subscribes to the existing per-message broadcast. It is an event-driven job, not a projection rule; the scheduler-only projection runtime is unchanged. Each assistant reply is classified exactly once. `conversation:digest` is not used because its overlapping windows deliver every pair twice.
- **Visibility is the turn's scope.** A captured FAQ gets `permissionToVisibilityScope(userPermissionLevel)` from the assistant message's metadata: `admin` → `restricted`, `trusted` → `shared`, `public` → `public`. The answer could only draw on content visible at that level, so the FAQ is never more visible than its source. A reply without a recorded permission level is skipped.
- **Guest chats are excluded.** Guest conversations emit no conversation events; guest questions reach the owner through the Guest chat workspace and `note:capture`.
- **Every capture is a draft.** Captured FAQs start `draft`. Only an owner action moves one to `published`, so no chat participant can put content on a site.
- **Idempotent per reply.** Each FAQ records its source reply and every merged reply; a capture whose reply is already recorded stops before any AI call. Ids are the question's slug plus the source reply's id, readable and unique across visibilities.
- **Switchable and quiet in evals.** `enabled` (default true) gates the subscription; the chat bundle lists `faq` in `evalDisable`.
- **Classification is one structured AI call** over the question and the answer. It rejects confirmations, small talk, personal or conversation-specific replies, and anything not reusable, and distills a standalone question and answer when it accepts.
- **Merging never crosses visibility.** Deduplication compares only FAQs of the same visibility.

## Slices

### Slice 1 — walking skeleton

- `entities/faq`: schema (`question`, `status: draft | published`, `sourceConversationId`, `sourceMessageId`), adapter (frontmatter + answer body), plugin.
- Subscription on `conversation:messageAdded`: assistant messages with a recorded permission level enqueue `faq-capture`.
- `faq-capture` job: reads the nearest preceding user message, classifies, and creates the draft FAQ at the turn's visibility.
- Registered in the canonical catalog and the `chat` bundle.
- Tests first: schema/adapter round trip; subscription enqueues only for assistant messages with a permission level; job maps each permission level to its visibility, skips rejected pairs, and is idempotent per answer.

### Slice 2 — deduplication

- After classification, measure the new FAQ's markdown against stored FAQ embeddings with `searchWithDistances`; stored FAQs are embedded as markdown, so the query takes the same form. A FAQ within cosine distance 0.2 asks the same question (measured paraphrases 0.03–0.14, a different question on the same subject 0.43+). Only a candidate of exactly the turn's visibility can match. A match records the reply in `mergedMessageIds` and keeps its answer; metadata `asked` is one plus the merged count. The hybrid `search` score is not used: without an exact phrase hit it tops out at 0.7.
- A FAQ that lists the reply as its source or a merge means the reply is already captured, so a retried job neither reclassifies nor double-counts.
- Merges write only over the version they read (`expectedContentHash`) and retry on conflict, so concurrent merges keep every reply.
- Two captures moments apart both create a FAQ, since neither is embedded yet. On `entity:embedding:ready` a `faq-reconcile` job folds the duplicate draft into the FAQ that stays: a draft into a published FAQ, of two drafts the newer. A published FAQ never folds.
- The distance is plugin config (`sameQuestionDistance`, default 0.2), as is wishlist's (`sameWishDistance`, default 0.28).
- The job finds the reply by its recorded position in the conversation, not in the latest messages, so traffic cannot push it out of reach.
- Tests first: a repeat question merges; the same question at a different visibility does not; a concurrent merge survives; a newer duplicate draft folds into the older FAQ.

### Slice 3 — publishing and site

- `published` is the entity type's publish status; entering it requires the `publish` entity action, and deleting a draft declines it.
- The `faq:entities` datasource returns FAQs of exactly `public` visibility, most asked first, and forwards the build's `publishedOnly`.
- The `faq-section` template renders them as disclosures. It is not named `faq-list`, so no site gets a `/faqs` route or navigation entry automatically; each site places the section where it wants FAQs.
- Tests first: only published public FAQs reach a published-only build; no `faq-list` template is registered.

### Slice 4 — answer candidates

- A merge keeps the FAQ's answer but records the merging reply's rewritten answer as a candidate on the FAQ.
- Studio shows a draft's candidates beside its answer; the owner picks one or edits. A published FAQ's answer never changes without the owner.
- Tests first: a merge adds a candidate and leaves the answer unchanged; choosing a candidate replaces the answer and clears the list.

## Non-goals

- Capturing guest conversations.
- Editing or answering questions on behalf of the owner.
- Feeding FAQs back into the agent beyond normal entity retrieval.
