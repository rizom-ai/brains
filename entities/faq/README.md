# FAQ Plugin

`@brains/faq` captures reusable question-and-answer pairs from chat conversations as draft `faq` entities.

## Capture flow

1. The conversation service broadcasts `conversation:messageAdded` for every stored message. Guest conversations broadcast nothing and are never captured.
2. For an assistant reply whose metadata records `userPermissionLevel`, the plugin enqueues one `faq-capture` job carrying the reply's position in its conversation. Replies without a recorded level are skipped.
3. The job claims the reply in the plugin's runtime state (`faq.captured-replies`); a reply already claimed stops the job, so a retried or repeated job never classifies or counts it twice, and a failed job releases its claim. It then loads the messages around the reply's recorded position (its message count when stored) and pairs it with the nearest preceding user message, so later chat traffic cannot push the reply out of reach. It stops if the reply is gone or there is no question.
4. One structured AI call decides whether the exchange is reusable and rewrites the question and answer to stand alone. A rejected exchange creates nothing.
5. The job measures the new FAQ's markdown against stored FAQ embeddings and shortlists FAQs of exactly the turn's visibility within cosine distance 0.25. Distance barely registers opposite meaning ("publish" vs "unpublish" sit at 0.195), so one short AI check per shortlisted FAQ, closest first, decides whether one answer serves both. The first confirmed FAQ counts one more `asked` and keeps its answer; a differing answer joins its alternatives. The write only lands over the version that was read; a concurrent merge makes it re-read and retry.
6. Otherwise the exchange becomes a `draft` FAQ named after its question, for example `what-topics-do-you-mostly-write-about`; a taken name gets `-2`, `-3`, … (`faq` when the question has no latin letters).
7. Once a FAQ's embedding is stored (`entity:embedding:ready`), a `faq-reconcile` job looks for another FAQ of the same visibility asking the same question. Two captures moments apart both create a FAQ, since neither can find the other yet; reconciliation deletes the duplicate, but only the version it read, then adds its `asked` and its answers to the FAQ that stays. A duplicate that changed meanwhile is left for the reconcile its own change triggers; when the FAQ that stays is gone, the duplicate is put back. A draft folds into a published FAQ; of two drafts the newer folds. A published FAQ never folds.

## Visibility

The FAQ takes the visibility of the turn that produced the answer:

| Turn permission | FAQ visibility |
| --------------- | -------------- |
| `admin`         | `restricted`   |
| `trusted`       | `shared`       |
| `public`        | `public`       |

The answer could only draw on content visible at that level, so the FAQ is never readable more widely than its source. A reply never merges into a FAQ of another visibility.

## Entity

Frontmatter holds only `question`, `status` (`draft` | `published`), and `asked` (how many chat replies asked it). The body is markdown: the answer, then any alternative answers under `## Alternative answers`, one `### Alternative N` section each. The answer is only the text above that heading, so sites never show alternatives. Which chat replies were counted is plugin state, never part of the document.

## Reviewing alternative answers

A merge keeps the FAQ's answer. When the merging reply's rewritten answer differs, it is appended to the body under `## Alternative answers` as its own `###` section, with its own headings nested one level below (reconciliation carries a folded duplicate's answer the same way), where the owner can read and edit it in Studio's editor like any other markdown. Studio's **FAQ review** workspace lists every FAQ with alternatives that the reviewer may see, with the current answer and each alternative. **Use alternative N** makes that alternative the answer; **Keep current answer** keeps it. Either removes the alternatives from the body. Both read the FAQ at the reviewer's visibility and write only over the version they read.

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
