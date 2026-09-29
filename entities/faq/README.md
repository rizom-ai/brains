# FAQ Plugin

`@brains/faq` captures reusable question-and-answer pairs from chat conversations as draft `faq` entities.

## Capture flow

1. The conversation service broadcasts `conversation:messageAdded` for every stored message. Guest conversations broadcast nothing and are never captured.
2. For an assistant reply whose metadata records `userPermissionLevel`, the plugin enqueues one `faq-capture` job carrying the reply's position in its conversation. Replies without a recorded level are skipped.
3. If a FAQ already lists the reply as its source or a merge, the job stops. Otherwise it loads the messages around the reply's recorded position (its message count when stored) and pairs it with the nearest preceding user message, so later chat traffic cannot push the reply out of reach. It stops if the reply is gone or there is no question.
4. One structured AI call decides whether the exchange is reusable and rewrites the question and answer to stand alone. A rejected exchange creates nothing.
5. The job measures the new FAQ's markdown against stored FAQ embeddings and shortlists FAQs of exactly the turn's visibility within cosine distance 0.25. Distance barely registers opposite meaning ("publish" vs "unpublish" sit at 0.195), so one short AI check per shortlisted FAQ, closest first, decides whether one answer serves both. The first confirmed FAQ records the reply in its `mergedMessageIds` and keeps its answer. The write only lands over the version that was read; a concurrent merge makes it re-read and retry.
6. Otherwise the exchange becomes a `draft` FAQ whose id is the question's slug followed by the reply's id, for example `what-topics-do-you-mostly-write-about-pkkv5hykb4x2` (`faq-<id>` when the question has no latin letters).
7. Once a FAQ's embedding is stored (`entity:embedding:ready`), a `faq-reconcile` job looks for another FAQ of the same visibility asking the same question. Two captures moments apart both create a FAQ, since neither can find the other yet; reconciliation moves the duplicate's reply ids onto the FAQ that stays and deletes the duplicate. A draft folds into a published FAQ; of two drafts the newer folds. A published FAQ never folds.

## Visibility

The FAQ takes the visibility of the turn that produced the answer:

| Turn permission | FAQ visibility |
| --------------- | -------------- |
| `admin`         | `restricted`   |
| `trusted`       | `shared`       |
| `public`        | `public`       |

The answer could only draw on content visible at that level, so the FAQ is never readable more widely than its source. A reply never merges into a FAQ of another visibility.

## Entity

Frontmatter holds `question`, `status` (`draft` | `published`), `sourceConversationId`, `sourceMessageId`, and `mergedMessageIds`. The body is the answer. Metadata carries `question`, `status`, and `asked` (one plus the merged count).

## Publishing and sites

`published` is a publish status, so moving a draft there requires the `publish` entity action; deleting a draft declines it.

The plugin registers the `faq:entities` datasource and the `faq-section` template. The template is deliberately not named `faq-list`, so the site builder derives no `/faqs` route or navigation entry from it; a site shows FAQs only by placing `faq-section` in one of its route sections. The datasource returns FAQs with visibility exactly `public`, most asked first, and forwards the build's `publishedOnly`, so production builds show only published FAQs and a shared or restricted FAQ never reaches a site.

## Configuration

```yaml
plugins:
  faq:
    enabled: false # default true; off means no subscription, no capture jobs, no AI calls
    sameQuestionDistance: 0.25 # shortlist distance; an AI check confirms each candidate
```

## Validation

```bash
bun run typecheck
bun test
```
