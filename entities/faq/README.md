# FAQ Plugin

`@brains/faq` captures reusable question-and-answer pairs from chat conversations, including site visitors' questions, as draft `faq` entities.

The default `faqPackage` composes the declarative FAQ entity and its `capture` service. Jobs use installed-owned SDK capabilities; Inbox actions use live caller-bound edits. Native plugin, adapter, handler, store and eval-registration bridges are retired. Markdown helpers are pure `createFaqContent`, `parseFaqContent` and `faqMetadata` exports, not a native adapter.

## Capture flow

1. The conversation service broadcasts `conversation:messageAdded` for every stored message. For a site visitor's conversation it broadcasts `conversation:guestMessageAdded` instead, which carries only where the message is (conversation, message id, role, position), never its text; ordinary message listeners do not receive visitor messages. Both events carry the message count recorded inside the persistence transaction, not a later count.
2. For an assistant reply whose metadata records `userPermissionLevel`, the plugin enqueues one `faq-capture` job carrying the reply's position in its conversation. Replies without a recorded level are skipped. A reply to a visitor answered a public turn, so its job carries `public`; the job reads the exchange through its conversation access, so an expired visitor conversation is gone. A visitor's own messages are never captured, and a refusal is no answer, so it creates nothing.
3. The job checks for a completed capture receipt or a legacy claim before loading the messages around the reply's recorded position (its message count when stored). It pairs the reply with the nearest preceding user message, so later chat traffic cannot push the reply out of reach. It records a terminal decision if the reply is gone or there is no question; it does not claim unfinished classification as completed.
4. One structured AI call decides whether the exchange is reusable and rewrites the question and answer to stand alone, without who asked: a visitor's name, organisation or address does not reach the FAQ (eval `faq-classify-drops-asker-identity`), and instructions inside the exchange are not followed (eval `faq-classify-ignores-instructions-in-exchange`). A rejected exchange creates nothing.
5. The job measures the new FAQ's markdown against stored FAQ embeddings and shortlists FAQs of exactly the turn's visibility within cosine distance 0.25. Distance barely registers opposite meaning ("publish" vs "unpublish" sit at 0.195), so one short AI check per shortlisted FAQ, closest first, decides whether one answer serves both. The first confirmed FAQ counts one more `asked` and keeps its answer; a differing answer joins its alternatives. The write only lands over the full canonical revision that was read, including metadata and visibility. A concurrent merge gets at most three conditional-write attempts, retaining the originally matched question and exact visibility; these inner retries do not repeat classification. A gone or ineligible destination instead leaves the reply to create its own FAQ.
6. Otherwise the exchange becomes a `draft` FAQ named after its question, for example `what-topics-do-you-mostly-write-about`; a taken name gets `-2`, `-3`, … (`faq` when the question has no latin letters).
7. Once a FAQ's embedding is stored (`entity:embedding:ready`), a `faq-reconcile` job looks for another FAQ of the same visibility asking the same question. Captures of different replies moments apart can create separate FAQs before either is searchable. Reconciliation atomically deletes the duplicate and adds its `asked` and answers to the FAQ that stays, checking both full revisions in the same transaction. A changed duplicate is left for its own reconciliation; a missing or ineligible destination leaves the duplicate intact. Destination-only contention gets bounded retries while its question and visibility remain unchanged. A draft folds into a published FAQ; of two drafts the newer folds. A published FAQ never folds.

## Capture recovery

New captures record a receipt under `faq.capture` in the entity database, atomically with the FAQ mutation, FTS update and projection/export journals. A terminal decision with no FAQ write uses the same identity. The first committed decision wins, even if competing attempts choose different destinations. Receipts survive FAQ edits, folding and deletion, so retrying a reply cannot recreate deleted content or count it again. Notifications and embedding scheduling remain post-commit work, outside this atomic boundary.

Classification can run again after interruption or overlap between attempts; this guarantees at-most-once durable capture effects, not at-most-once model calls or a provider-spend ceiling.

Existing `faq.captured-replies` entries contain only a timestamp and cannot distinguish successful captures from interrupted ones. They are preserved and are not replayed automatically. The host keeps this exact state identity for the declarative `@brains/faq` package only; other package and interface scopes remain isolated. Already-stuck legacy entries therefore require manual review; the new protocol does not retroactively resolve them. Stop old claim-writing workers before running the new capture protocol. Older runtimes do not understand new receipts, so a downgrade requires disabling capture or a separately verified migration; mixed-version capture is not supported.

### Persisted jobs

The default package declares the `capture` service. Its job types are `@brains/faq:capture:faq-capture` and `@brains/faq:capture:faq-reconcile`. Job-queue migration `0006_scope_faq_jobs` upgrades the corresponding `faq:faq-capture` / `faq:faq-reconcile` rows only when both their source and metadata owner are `faq`. It changes dispatch/source/owner names, not job IDs, payloads, reply keys, positions, status, attempts or leases. Missing, malformed or different ownership is left untouched for manual review; there are no runtime job aliases. Stop all old writers before this one-way upgrade; mixed-version execution and downgrade are unsupported.

Capture subscriptions run in the interactive app. Embedding-readiness reconciliation also runs in workers. Disabling capture stops automatic capture and reconciliation enqueueing; declared handlers and explicit evals remain available, as do previously queued jobs. Registration makes no model calls. Evals use restricted fixtures and bounded matching; run them against isolated evaluation data because resetting FAQ fixtures removes existing FAQs.

## Answered-before replies and source withdrawal

A public, published FAQ without a review marker can answer a visitor after semantic confirmation. Its complete canonical revision is re-read after that asynchronous check; changed eligibility yields no hit. This read never increments `asked`. The persisted assistant reply records the confirmed FAQ question, and its normal `faq.capture` receipt owns the increment. Capture checks the same public question and answer with full-revision CAS, without classifying an approved answer again.

Older fast-path replies lack capture provenance and may already have incremented without a receipt. Their pending capture jobs require manual reconciliation, not another count or a silent completion. Existing claims and receipts are not expired or reset. Stop old web and worker writers before this one-way rollout; mixed versions and downgrade are unsupported.

Confirmation generation and embeddings belong to guest settlement even on a miss or failed check. Unreported, unfinished, uninstrumented or unpriced work makes cost unknown, not known zero. Auxiliary attempts share the request lifetime; measured requests disable hidden SDK retries. These are accounting and cancellation guarantees, not provider-spend ceilings or bounded-total-scan guarantees.

Delivered network-piece deletions first record pending work in `faq.source-withdrawals`, then enqueue `@brains/faq:capture:faq-source-review`. Daily maintenance resumes enqueue failures and failed/pruned jobs with the same delivered message identity. Pending work has no expiry and is removed only after durable completion. Per-FAQ `faq.source-review` receipts preserve an owner's later keep decision across replay. Full-revision contention gets three attempts; exhaustion retains pending work. A full 1,000-row citation page requires manual reconciliation rather than silently acknowledging completion. There is no transactional outbox for deletion notifications that never reach the subscriber.

The host preserves these exact state and receipt namespaces only for their installed FAQ owner. Migration `0007_scope_faq_source_review` upgrades `faq:faq-source-review` jobs only when both source and metadata owner are `faq`, preserving payloads, withdrawal IDs, attempts and leases. Missing or different ownership is untouched. Service subscriptions receive delivery-lifetime owned edits and structured confirmation; interfaces and caller-bound tools do not acquire that background authority.

## Visibility

The FAQ takes the visibility of the turn that produced the answer:

| Turn permission | FAQ visibility |
| --------------- | -------------- |
| `admin`         | `restricted`   |
| `trusted`       | `shared`       |
| `public`        | `public`       |
| site visitor    | `public`       |

The answer could only draw on content visible at that level, so the FAQ is never readable more widely than its source. A reply never merges into a FAQ of another visibility.

## Entity

Frontmatter holds `question`, `status` (`draft` | `published`), `asked` (how many chat replies asked it), optional kept `sources`, an optional `review: source-withdrawn` marker, and an optional `rank` the owner sets to place it on a site (1 first). The body is markdown: the answer, then any alternative answers under `## Alternative answers`, one `### Alternative N` section each. The answer is only the text above that heading, so sites never show alternatives. Internal completion receipts track decided replies; they are never part of the FAQ document.

## Reviewing alternative answers

A merge keeps the FAQ's answer. When the merging reply's rewritten answer differs, it is appended to the body under `## Alternative answers` as its own `###` section, with its own headings nested one level below (reconciliation carries a folded duplicate's answer the same way), where the owner can read and edit it in Studio's editor like any other markdown. Such a FAQ appears in the owner's Inbox, with the current answer and each alternative in its detail. **Use alternative N** makes that alternative the answer; **Keep current answer** keeps it. Either removes the alternatives from the body and writes only over the version it read. Choosing an alternative clears the previous answer's source attribution: alternatives currently carry text, not independent source provenance. Withdrawn sources also put published FAQs in the Inbox, where the owner can keep the answer or unpublish it.

## Publishing and sites

Every draft, whatever its visibility, appears in the owner's Inbox with its drafted answer: **Publish** moves it to `published`, a publish status that requires the `publish` entity action; **Decline** deletes it. Both act only on the version they read.

The FAQ declaration provides the local `entities` datasource and `faq-section` template; the runtime qualifies both for the installed package. The template is deliberately not named `faq-list`, so the site builder derives no `/faqs` route or navigation entry from it; a site shows FAQs only by placing `faq-section` in one of its route sections. The datasource returns FAQs with visibility exactly `public`: ranked ones in rank order, then the rest most asked first, newest first on a tie, and forwards the build's `publishedOnly`, so production builds show only published FAQs and a shared or restricted FAQ never reaches a site.

`loadPublicFaqs(entities, limit, { publishedOnly })` uses a bounded entity reader to return the same FAQs for a site that shows them beside its other content, and none on a brain without the plugin. Limits are integers from 1 to 1,000 (the section datasource defaults to 100). The professional site's atlas homepage uses it: the first six appear in a band under the atlas, under the owner's `faqHeading` from `ask-content` (or no heading), every question closed until tapped and one answer open at a time. A preview build shows drafts there too, like any draft content.

## Configuration

```yaml
plugins:
  faq:
    enabled: false # default true; off stops capture/reconciliation enqueueing and answered-before lookup; source review and queued jobs remain active
    sameQuestionDistance: 0.25 # shortlist distance; an AI check confirms each candidate
```

## Validation

```bash
bun run typecheck
bun test
```
