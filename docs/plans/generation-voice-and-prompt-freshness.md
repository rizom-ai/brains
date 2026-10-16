# Plan: Generation voice precedence and prompt freshness

Last updated: 2026-10-16

## Status

**In progress. Slices 1–3 implemented; slice 4 started: the yeehaa.io style-guide principles were added on 2026-10-16; deleting the legacy prompt copies and regenerating wait for the release of slices 1–3.** The restart and cache problems under slice 2 were already fixed upstream before it started (`resolvePrompt` reads the entity on every call). Research is complete; the four slices below are independent enough to land as separate PRs in the order given.

Trigger: on yeehaa.io, generated LinkedIn posts ignored the owner's style guide (one-sentence lines, engagement questions, takeaway structure) although the style guide asks for the opposite. The cause is not one bad prompt but four structural problems in how generation prompts are assembled and kept.

## Problem

1. **No precedence between style guide and template.** `buildSystemPrompt` (`shell/core/src/datasources/ai-content-datasource.ts`) emits `# Style Guide` and then `# Instructions` with no statement of which governs what. When a template contains voice or form rules, it wins by position and phrasing.
2. **The template prompt is sent twice.** `buildPrompt` starts the user prompt with the same `basePrompt` already present under `# Instructions`, doubling the template's weight against the style guide. No test depends on this (`shell/core/test/ai-content-datasource.test.ts`, `scoped-content-generation.test.ts` only assert knowledge context and the system prompt).
3. **Templates carry voice.** The documented split is that `style-guide` holds "durable voice and visual guidance for generation" and templates hold the task. `blog:generation` and `decks:generation` follow it ("Follow the supplied style guide for voice, language, and positioning"). Others do not:
   - `social-media:linkedin` defers to the style guide but still dictates form and voice: single-sentence lines, hook, Problem → Insight → Takeaway, engagement question, "drive engagement" framing (`entities/social-media/src/templates/linkedin-template.ts:44-71`, schema description L20).
   - `newsletter:generation` sets tone ("Conversational… like you're emailing a friend"), personal hook, short paragraphs and stock closings, and never defers (`plugins/newsletter/src/entity/templates/generation-template.ts:41-94`). The handler adds more voice rules to the user prompt (`plugins/newsletter/src/entity/handlers/generation-handler.ts:140-148`).
   - `portfolio:generation` sets "Tone: Professional but accessible" and never defers (`entities/portfolio/src/templates/generation-template.ts:77`).
   - Public prose generated without any style guide, with content-marketing wording of its own ("compelling", "engaging"): `blog:excerpt`, `decks:description`, `series:description`, `professional-site:about-highlights`.
4. **Prompt copies freeze.** `resolvePrompt`/`materializePrompts` (`shell/plugins/src/entity/prompt-resolver.ts`) write every default prompt into the brain as a `prompt` entity when missing and never refresh it. Frontmatter records only `title` and `target`, so an untouched copy is indistinguishable from a deliberate override. Every later improvement to a default is silently lost for existing brains. On yeehaa.io all 21 prompt copies are unedited since import, yet `blog-generation` no longer shares a line with the current default, `decks-generation` has drifted by about half, and `social-media-linkedin` predates the 2026-07-22 style-guide deferral.

Found while researching, and fixed in the same slice as problem 4 because they break the same mechanism:

- **Edits never apply without a restart.** `promptCache` is filled for every template at boot and is cleared only by `resetPromptCache`, which only tests call. The `context.ai.generate` path (blog, decks, social, newsletter, portfolio, note, series, link, topics, skill, conversation memory) uses this cache. Only scoped `context.content.generate` reads overrides fresh (`readPromptOverride`).
- **Some copies are written under the wrong id.** Materialization keys entities by `template.name`; generation looks them up by the registry key `${pluginId}:${name}` (`shell/core/src/shell.ts:654`). For `about-highlights` and declarative service templates these differ, so the materialized file is never read. yeehaa.io has a dead `prompt/about-highlights.md`.

## Design

### Slice 1 — Precedence and single inclusion (`shell/core`)

- In `buildSystemPrompt`, when a style guide is present, state the split explicitly: the style guide governs voice, tone, wording and form (paragraphing, sentence rhythm, hooks, rhetorical questions, calls to action); the instructions govern the task, required content, length limits, platform constraints and output format; on any conflict about voice or form, the style guide wins. Without a style guide, nothing changes.
- Remove the `basePrompt` line from `buildPrompt`. `searchTerms` is built independently and is unaffected.
- Tests first in `ai-content-datasource.test.ts`: precedence text present only with a style guide; user prompt no longer contains the template text.

### Slice 2 — Prompt freshness (`shell/plugins`, `entities/prompt`)

- **Provenance.** Add an optional `defaultHash` to the prompt frontmatter and metadata schemas: the hash of the default body the copy was written from. Materialization writes it.
- **Refresh rule at boot.** For each template default:
  - no entity → create it with `defaultHash`;
  - entity with `defaultHash`, body hash equals `defaultHash` (untouched), default changed → replace body and `defaultHash`;
  - entity with `defaultHash`, body hash differs (edited) → keep it; record that the override is based on an older default so it can be surfaced later;
  - entity without `defaultHash` (legacy) and body equals the current default → stamp `defaultHash`;
  - legacy and body differs → keep it untouched and log it as an unverified override. Deleting the entity is the documented reset, after which the current default is materialized with provenance.
- **Correct ids.** Materialize by registry key, so entity ids match what generation reads. Legacy entities written under a short name were never read; remove them in the same pass.
- **No stale cache.** Drop the body cache from `resolvePrompt`; one entity read per generation is negligible next to the model call. Keep a per-process record of attempted creations so a missing entity type is not retried on every call.
- Tests first in `shell/plugins/test/entity/prompt-resolver.test.ts` and `shell/core/test/prompt-materialization.test.ts` for each refresh case, the id fix, and an edit taking effect without restart.

### Slice 3 — Templates hold the task, the style guide holds the voice

Rule: every template that produces public prose attributed to the brain or anchor receives the voice facet and contains no voice, tone or form rules of its own; extraction and classification templates (`link:extraction`, `topics:*`, `skill:skill-derivation`, `conversation-memory:ai-response`) receive no style guide.

Identity and voice are separate: the source-derived short copy below keeps `representedIdentity: "none"` from the identity review (F6 in `identity-profiles-and-expression.md`), but its "match the voice of the source" rule is replaced by the voice facet, so the style guide governs it like all other public prose. Site sections get the voice facet only from a public style guide, since site copy is public.

- `social-media:linkedin`: keep length, hashtag and URL rules; remove hook, line-break, structure, engagement-question and "drive engagement" wording, including the schema description.
- `newsletter:generation`: remove tone, hook, paragraph-length and stock-closing rules; add the style-guide deferral; move the handler's voice phrasing out of the user prompt.
- `portfolio:generation`: remove the tone line; add the deferral.
- `blog:excerpt`, `decks:description`, `series:description`, `professional-site:about-highlights`: pass the voice facet at their call sites and drop "compelling/engaging" wording. `about-highlights` keeps its third-person requirement as a task constraint.
- `note:generation` stays as is: notes are private working material and get no style guide.
- The social-media eval handler (`entities/social-media/src/lib/eval-handlers.ts:31-37`) passes no style guide and can resolve `social-media:undefined`; fix both so evals exercise the real path.
- Validate with the existing eval handlers for social media, newsletter, blog, decks and portfolio, comparing against a style guide that forbids one-sentence paragraphs and engagement questions.

### Slice 4 — yeehaa.io rollout

- Add to the yeehaa.io style guide, as a voice principle: write in full paragraphs of several sentences, never one-sentence lines.
- After release: the 21 legacy copies have no provenance, so slice 2 keeps them. The content repository shows none was edited after import, so delete them and let the current defaults materialize with provenance. Remove `prompt/about-highlights.md`.
- Regenerate one LinkedIn post and one newsletter draft and review them against the style guide before publishing anything.

## Not in this plan

- **Knowledge search uses the whole template as its query.** `searchTerms` concatenates the resolved `basePrompt` (about 2k characters for LinkedIn) with the request, so retrieval is driven largely by template wording. This affects every knowledge-backed template and needs its own evaluation; it gets a separate plan.
- **SWOT and email-workflow prompts** resolve prompts but call the model directly, outside `buildSystemPrompt`. They contain no anchor-voice prose and are unaffected.

## Validation

Per slice: tests first, then `bun run typecheck`, the affected workspaces' tests, and `bun run lint`. Slices 1 and 2 change shared shell contracts, so run the full repo checks before merge. Add changesets for every published package touched. Docs: update the `prompt` entry in `docs/entity-types-reference.md` and `docs/entity-model.md` for `defaultHash` and the refresh rule, and run `bun run docs:check`.
