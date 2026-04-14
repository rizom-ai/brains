# Plan: AI templates opt in to knowledge-base context

## Status

Proposed.

## Context

`AIContentDataSource.generate` searches the knowledge base before calling the AI, and stuffs the results into the prompt as "relevant entities" context. The search query is built from `basePrompt + context.prompt`:

```ts
// shell/core/src/datasources/ai-content-datasource.ts:53-55
const searchTerms = [basePrompt, context.prompt].filter(Boolean).join(" ");
const shouldSearchKnowledgeBase =
  searchTerms.length > 0 && context.templateName !== "topics:extraction";
```

For generative templates (blog, newsletter, social-media) this is useful — the user prompt is short, the KB context grounds the output in the user's writing.

For **extractive templates** (link, topics), `context.prompt` carries the external payload being parsed — for `link:extraction` it's the entire fetched webpage markdown. That produces two failures:

1. **Embedding API overflow** — `entityService.search(searchTerms, ...)` embeds the query. OpenAI's `text-embedding-3-small` caps input at 8192 tokens. A Wikipedia article as search query blows the limit; the link-capture job crashes (observed in production on `mylittlephoney`).
2. **Semantic noise** — even when under the limit, searching the user's KB with "the full text of an external Wikipedia article" returns whatever entities share vocabulary with that article. It's not useful context for extraction; the AI's job is to parse the given document, not recall unrelated entities.

`topics:extraction` already opts out via a hardcoded string check. Generalizing from that exclusion into a proper template-level flag surfaces a design question that was implicit.

## Template inventory (production, with `basePrompt`)

| Template                 | Semantic                              | Wants KB? |
| ------------------------ | ------------------------------------- | --------- |
| `social-media:linkedin`  | generative                            | yes       |
| `portfolio:generation`   | generative (explicit)                 | yes       |
| `note:generation`        | generative                            | yes       |
| `decks:generation`       | generative                            | yes       |
| `newsletter:generation`  | generative                            | yes       |
| `blog:generation`        | generative                            | yes       |
| `shell:query_response`   | KB-aware query                        | yes       |
| `shell:knowledge-query`  | KB-aware query                        | yes       |
| `skill:skill-derivation` | synthesis                             | yes       |
| `link:extraction`        | **extractive (unbounded input)**      | no        |
| `topics:extraction`      | extractive                            | no        |
| `summary:ai-response`    | extractive (potentially long input)   | no        |
| `topics:merge-synthesis` | synthesis of given pair               | no        |
| `blog:excerpt`           | extractive                            | no        |
| `decks:description`      | extractive                            | no        |
| `series:description`     | extractive / synthesizing given input | no        |

9 want KB, 7 don't. The count is close enough that "safer migration by default" isn't a strong argument for either direction.

## Design decision: opt-in

Templates **opt in** to knowledge-base context. Default: no KB context.

Rationale:

- Failure modes are asymmetric. Missing an opt-out is a **hard production failure** (the bug we're fixing). Missing an opt-in is _quality regression_ — worse output because the AI lost grounding it used to have. Quality regressions are catchable by output tests; silent embedding overflows aren't.
- Semantic honesty: KB-augmented generation is an _enhancement_, not the datasource's default purpose. `AIContentDataSource.generate` produces AI content; whether to enrich with KB context is a per-template decision.
- 2 extra annotations (9 opt-ins vs 7 opt-outs) is a small migration cost for explicit intent everywhere.

## Target state

Template interface gains an opt-in flag:

```ts
// shell/templates/src/types.ts — add to Template interface
/**
 * Whether to retrieve relevant entities from the knowledge base
 * and inject them as context before AI generation. Default: false.
 * Generative templates that benefit from grounding in the user's
 * existing content should set this to true.
 */
useKnowledgeContext?: boolean;
```

Datasource honors the flag:

```ts
// shell/core/src/datasources/ai-content-datasource.ts
const shouldSearchKnowledgeBase =
  searchTerms.length > 0 && template.useKnowledgeContext === true;
```

The stringly-typed `templateName !== "topics:extraction"` check goes away.

## What changes

### Schema / interface

- `shell/templates/src/types.ts`: add `useKnowledgeContext?: boolean` to the `Template` interface and the `TemplateSchema` Zod schema.

### Datasource

- `shell/core/src/datasources/ai-content-datasource.ts` (line 54-55):
  - Replace `context.templateName !== "topics:extraction"` with `template.useKnowledgeContext === true`
  - `template` is already in scope (line 35)

### Template opt-ins (add `useKnowledgeContext: true`)

- `entities/social-media/src/templates/linkedin-template.ts`
- `entities/portfolio/src/templates/generation-template.ts`
- `entities/note/src/templates/generation-template.ts`
- `entities/decks/src/templates/generation-template.ts`
- `entities/newsletter/src/templates/generation-template.ts`
- `entities/blog/src/templates/generation-template.ts`
- `shell/content-service/src/templates/query-response.ts`
- `shell/content-service/src/templates/knowledge-query.ts`
- `entities/agent-discovery/src/templates/skill-derivation-template.ts`

### Templates that stay default (no annotation needed)

- `entities/link/src/templates/extraction-template.ts`
- `entities/topics/src/templates/extraction-template.ts`
- `entities/summary/src/templates/summary-ai-response.ts`
- `entities/topics/src/templates/merge-synthesis-template.ts`
- `entities/blog/src/templates/excerpt-template.ts`
- `entities/decks/src/templates/description-template.ts`
- `entities/series/src/templates/description-template.ts`

### Defense-in-depth

- `shell/ai-service/src/online-embedding-provider.ts`: truncate input at the provider level to ~24,000 chars (≈ 6k tokens, below the 8192 ceiling). Log a warning when truncation happens.

Not a replacement for the primary fix — truncating a search query degrades search quality. But it keeps the embedding API from 400-ing the whole job on overflow, and protects any template or search call that later forgets to opt out / stay bounded.

## What we don't change

- The set of templates that end up with KB context at runtime is the same 9 that effectively had it before (all current generative templates). Output quality should be unchanged.
- `topics:extraction` continues to skip KB context — now via the generic flag rather than the stringly-typed exception.
- The `${entityType}:generation` job convention.
- The prompts themselves.

## Tests

- `shell/core/test/ai-content-datasource.test.ts` (existing): verify `useKnowledgeContext: true` → search runs; `false`/unset → search skipped.
- `shell/ai-service/test/online-embedding-provider.test.ts`: verify truncation — input over the threshold gets truncated, under-threshold passes through, warning is emitted.
- Per-template tests that assert KB context is injected should already exist for the 9 opt-in templates; run to catch any that I annotated wrong.

## Implementation order

1. Add `useKnowledgeContext` to `Template` interface and `TemplateSchema` in `shell/templates/src/types.ts`
2. Update `ai-content-datasource.ts` to honor the flag; remove the stringly-typed exclusion
3. Add `useKnowledgeContext: true` to the 9 generative/KB-aware templates
4. Add embedding-input truncation in `OnlineEmbeddingProvider` (defense-in-depth)
5. Run tests across all affected packages

## Verification

- Trigger a link capture for a long Wikipedia article (e.g. `https://en.wikipedia.org/wiki/The_Drama_(film)`) — job completes without `AI_APICallError: Invalid 'input[0]': maximum input length is 8192 tokens`.
- All existing generative-template output tests pass (blog/newsletter/social-media/portfolio/note/decks/skill-derivation/shell queries).
- `topics:extraction` still works without KB context (previously opt-out via string, now via flag).
- Truncation warning logs when an oversized input is passed to the embedding provider (exercise via a test with a very long query).

## Risks

- **Missing an opt-in annotation**: a generative template that should have KB context silently loses it → worse output quality. Mitigated by (a) explicit inventory of the 9 templates to annotate, (b) running each template's output tests.
- **`skill:skill-derivation` is borderline**: input is a list of topic titles (short), and the template synthesizes skills. Whether KB context helps is arguable. Default to `true` since it was effectively opted in before; can revisit if its output tests flag noise.
- **Defense-in-depth truncation masks bugs**: if a search query is unexpectedly huge, truncation silences the hard failure but produces a lower-quality search result. Mitigated by the warning log — monitor for warnings in production.

## Follow-up (not in this PR)

- Consider renaming `useKnowledgeContext` if a better name surfaces during implementation (e.g. `groundInKnowledgeBase`).
- Audit any future AI templates to make the opt-in decision at introduction.
- Consider chunked/pooled embedding for genuinely long entity content if that use case arises — out of scope here since the immediate issue is the _search query_, not the _entity content_.
