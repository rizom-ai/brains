# Plan: Structured body codecs

## Status

**Phase 1 complete; Phases 2–3 remain.** `StructuredContentFormatter` (`shared/content-formatters/src/formatters/structured-content.ts`) parses and formats through a Zod codec it exposes as `codec`, so a write is validated against the same body schema a read is. `expectBodyRoundTrip` in `@brains/test-utils` is the shared round-trip contract; `shared/content-formatters` and `plugins/playbooks` assert it.

Still open:

- Formatter packages other than content-formatters and playbooks have no shared round-trip assertion; their coverage is per-package and uneven.
- The FAQ adapter (`faqBody` / `parseFaqBody` in `entities/faq/src/adapters/faq-adapter.ts`) and the summary adapter (`createContentBody` / `parseBody` in `entities/conversation-memory/src/adapters/summary-adapter.ts`) are hand-written pairs with no body schema in either direction.

`StructuredContentFormatter` is the base for every schema-first site section (`sectionToTemplate` in `shared/site-composition/src/section-templates.ts`), five other direct instantiations (agent-discovery templates, series, the A2A agent body, site-composition content definitions, the professional site), and eight subclasses across conversation-memory, decks, link, portfolio, topics, and playbooks.

## Goal

Every structured body has one Zod codec — markdown string ↔ typed body — so writes enforce the same contract reads do, and one shared contract test proves the round trip for every formatter.

## Codec rules (Zod 4.4.3)

- `z.encode` throws `Encountered unidirectional transform during encode` when a body schema contains any `z.preprocess` or `.transform`, including ones imported from other files.
- Encoding validates the decoded shape, so fields with `.default()` must be present. `format` therefore takes decoded data — what `parse` or a schema-validated generator produces — never hand-built partial data. Content generation qualifies: data sources generate against `template.schema`, so `formatContent` receives decoded output.
- `generateBodyTemplate` builds heading skeletons without calling `format`, so body templates are unaffected.

## Decisions

- **Frontmatter schemas never encode.** Entity metadata is persisted as JSON (`text("metadata", { mode: "json" })`), so a type-changing codec such as Date would read back as a string after a reload. Frontmatter normalization stays decode-only. A codec may appear in a frontmatter schema only when it is shared with a body and decodes identically to the decode-only form: the playbook blank-text helper is one, and it still introspects as `string` for Studio.
- **The codec lives inside `StructuredContentFormatter`.** The public `format(data)` / `parse(markdown)` signatures and the `Failed to format/parse structured content: <path>: <reason>` errors are unchanged.
- **One-way transforms become codecs.** A body schema that must normalize input uses a codec for that field, never `preprocess`/`transform`. The playbook blank-text helper is `blankTextAsUndefined()`: input `z.string().optional()`, output `z.string().min(1).optional()`, blank decodes to `undefined`, encode is the identity.
- **Hand-written pairs get a schema and a codec, not a rewrite onto `StructuredContentFormatter`.** The FAQ and summary markdown layouts stay as they are; their existing functions become the codec's `decode`/`encode`.
- **JSON Schema stays on the input side.** The AI SDK converts with `io: "input"`. Body outputs are plain JSON types and no body codec enters a tool input schema.

## Phases

### Phase 2 — Round-trip contract across formatter packages

Tests only, one decoded fixture per formatter, asserted with `expectBodyRoundTrip`: conversation-memory (both), decks, link, portfolio, topics (both), series, agent-discovery templates, the A2A agent body, site-composition content definitions and section templates, and the professional site. A formatter whose fixture fails the contract gets its rendering or schema fixed in this phase.

Validation: the affected packages' tests, `bun run typecheck`.

### Phase 3 — FAQ and summary bodies as codecs

Tests first: round trip and encode-time rejection for each body.

1. FAQ: define `faqBodySchema` (`answer`, `alternatives`) and `faqBodyCodec` from `faqBody` / `parseFaqBody`; the adapter calls `z.encode` / `z.decode`.
2. Summary: define the body schema for `SummaryBody` and `summaryBodyCodec` from `createContentBody` / `parseBody`; the adapter calls the codec.

Validation: `entities/faq` and `entities/conversation-memory` tests, `bun run typecheck`.

## Completion

Every formatter package asserts the shared round-trip contract, no body schema contains a one-way transform, and the FAQ and summary bodies are codecs. Delete this plan when that holds.
