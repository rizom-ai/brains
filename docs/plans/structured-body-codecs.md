# Plan: Structured body codecs

## Status

**Proposed; implementation has not started.** Structured entity bodies are converted between markdown and typed data by format/parse pairs. Reading validates; writing does not:

- `StructuredContentFormatter.parse` (`shared/content-formatters/src/formatters/structured-content.ts`) builds data from markdown sections and validates it with its Zod schema. `format` renders whatever it receives, so data that violates the schema is written to markdown and only fails on the next read.
- The FAQ adapter (`faqBody` / `parseFaqBody` in `entities/faq/src/adapters/faq-adapter.ts`) and the summary adapter (`createContentBody` / `parseBody` in `entities/conversation-memory/src/adapters/summary-adapter.ts`) are hand-written pairs with no body schema in either direction.
- Round-trip coverage is per-package and uneven; there is no shared contract asserting `parse(format(x))` equals `x`.

`StructuredContentFormatter` is the base for every schema-first site section (`sectionToTemplate` in `shared/site-composition/src/section-templates.ts`), five other direct instantiations (agent-discovery templates, series, the A2A agent body, site-composition content definitions, the professional site), and eight subclasses across conversation-memory, decks, link, portfolio, topics, and playbooks.

## Goal

Every structured body has one Zod codec — markdown string ↔ typed body — so writes enforce the same contract reads do, and one shared contract test proves the round trip for every formatter.

## Verified basis (Zod 4.4.3)

- `z.codec(z.string(), bodySchema, { decode, encode })` produces a `ZodCodec`, which is a `ZodPipe`. `z.decode` validates the decoded value; `z.encode` rejects a value that violates `bodySchema` and names the failing path.
- `z.encode` throws `Encountered unidirectional transform during encode` when the body schema contains any `z.preprocess` or `.transform`. Among formatter body schemas, only `playbookBodySchema` has one: the blank-text `preprocess` (`optionalTextSchema` / `optionalTextParserSchema` in `plugins/playbooks/src/entity/schemas/playbook.ts`). No site-section schema file contains one.
- Encoding validates the decoded shape, so fields with `.default()` must be present. Data produced by decoding always is; callers that format hand-built partial data are the cases this plan is meant to surface.
- `generateBodyTemplate` builds heading skeletons without calling `format`, so body templates are unaffected.

## Decisions

- **Bodies only; frontmatter keeps its current schemas.** Entity metadata is persisted as JSON, so a Date codec would put non-JSON values into storage. Frontmatter normalization (blank → `undefined`, the visibility transform in `shell/entity-service/src/frontmatter.ts`) is decode-only by design, because writing emits the canonical form. `zod-introspect`'s `unwrapField` peels pipes to their output side, so a codec in frontmatter would show Studio the decoded type instead of the editable one.
- **The codec lives inside `StructuredContentFormatter`.** The public `format(data)` / `parse(markdown)` signatures and the `Failed to format/parse structured content: <path>: <reason>` errors stay the same. `parse` decodes through the codec, `format` encodes through it, and the formatter exposes `readonly codec` for composition and tests.
- **One-way transforms become codecs.** A body schema that must normalize input uses a codec for that field, never `preprocess`/`transform`. The playbook blank-text helper becomes `z.codec(z.string(), z.string().min(1).optional(), { decode: blank → undefined, encode: v → v ?? "" })`, which also removes its duplicate.
- **Hand-written pairs get a schema and a codec, not a rewrite onto `StructuredContentFormatter`.** The FAQ and summary markdown layouts stay as they are; their existing functions become the codec's `decode`/`encode`.
- **JSON Schema stays on the input side.** The AI SDK converts with `io: "input"`. `shell/ai-evaluation/src/tool-surface.ts` calls `z.toJSONSchema` in default output mode, which throws on non-JSON outputs; body codecs never enter tool input schemas, and a test pins that.

## Phases

### Phase 1 — Codec-backed `StructuredContentFormatter` and the round-trip contract

Tests first:

- `format` with data violating the schema throws the wrapped error naming the path;
- `parse(format(x))` deep-equals `x` for a decoded fixture;
- the playbook blank-text field decodes `"  "` to `undefined` and re-encodes without the key;
- an encodability test runs `z.encode` on a decoded fixture for every formatter in this PR's scope, which catches one-way transforms imported from other files.

Implementation:

1. Build the codec in the `StructuredContentFormatter` constructor from the existing section-building (`decode`) and rendering (`encode`) code; route `parse`/`format` through it.
2. Replace the playbook blank-text `preprocess` pair with the single codec helper.
3. Add `expectBodyRoundTrip(formatter, decodedFixture)` to `@brains/test-utils`.
4. Adopt it in `shared/content-formatters` and `plugins/playbooks`.

Validation: `bun run typecheck`, `bun scripts/lint.mjs --force`, `bun run test` (every subclass and site section inherits the change). Then `bun start:publishing` from `packages/brain-cli`, trigger a site rebuild on the running app over MCP HTTP (`--remote`), and confirm `dist/site-preview` renders the schema-first sections unchanged.

### Phase 2 — Round-trip contract across formatter packages

Tests only, one decoded fixture per formatter: conversation-memory (both), decks, link, portfolio, topics (both), series, agent-discovery templates, the A2A agent body, site-composition content definitions and section templates, and the professional site. A formatter whose fixture fails the contract gets its rendering or schema fixed in this phase.

Validation: the affected packages' tests, `bun run typecheck`.

### Phase 3 — FAQ and summary bodies as codecs

Tests first: round trip and encode-time rejection for each body.

1. FAQ: define `faqBodySchema` (`answer`, `alternatives`) and `faqBodyCodec` from `faqBody` / `parseFaqBody`; the adapter calls `z.encode` / `z.decode`.
2. Summary: define the body schema for `SummaryBody` and `summaryBodyCodec` from `createContentBody` / `parseBody`; the adapter calls the codec.

Validation: `entities/faq` and `entities/conversation-memory` tests, `bun run typecheck`.

## Completion

`StructuredContentFormatter` encodes through its codec, every formatter package asserts the shared round-trip contract, no body schema contains a one-way transform, and the FAQ and summary bodies are codecs. Delete this plan when that holds.
