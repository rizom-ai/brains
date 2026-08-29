# Plan: Bun-native runtime follow-ups

## Status

**Implementation complete; pending review.** Phases 1, 2, 6, and 8 are
implemented in this branch. Phases 3 and 4 are declined for now because Bun's
YAML writer would churn durable Markdown, Phase 5 is declined because JSONL did
not pass its compatibility and net-benefit gates, and Phase 7 is declined
because Bun 1.4's custom Markdown renderer cannot preserve the browser-facing
rendering contract.

This plan does not authorize merge, release, publication, or deployment.

## Goal

Use Bun 1.4 APIs where they delete a dependency, an operating-system
requirement, or a process-lifetime failure class without rebuilding a mature
library inside the repository.

The target outcomes are:

1. read npm tarballs with `Bun.Archive` rather than an external `tar` process;
2. remove Web Chat's unused Vite configuration and dependency now that
   `Bun.build` is the sole UI build path;
3. replace direct `js-yaml` use with a narrow `Bun.YAML` policy;
4. replace `gray-matter` with one shared frontmatter boundary backed by
   `Bun.YAML`;
5. use Bun's JSON family where it matches a real repository format, with a
   conditional `Bun.JSONL` migration for resilient line-oriented logs;
6. replace Croner with `Bun.cron` if five-field cron becomes the accepted
   schedule contract;
7. replace direct Marked use with `Bun.markdown` only if the unstable API can
   preserve the HTML, security, image, and terminal contracts with less code;
   and
8. add `--no-orphans` only to process trees where recursive `SIGKILL` is a
   proven defense in depth and does not bypass graceful ownership rules.

This is not one migration PR. Each phase must be independently reviewable and
revertible, and dependency removal must happen in the same phase as its final
consumer migration.

## Research baseline

The audit covered 126 external dependencies and every repository import of the
candidate packages. Bun 1.4 probes established the following baseline:

- `Bun.Archive` opened the published
  `@rizom/brain@0.2.0-alpha.330` tarball, enumerated all 203 entries, and read
  `package/package.json` without writing the archive to disk.
- `interfaces/web-chat/scripts/build-ui.ts` is already the active
  `Bun.build` implementation. No build or runtime code reads
  `interfaces/web-chat/vite.config.ts`.
- `Bun.YAML.parse` and `js-yaml` produced equal JSON-normalized values for all
  336 tracked YAML files. They do not have identical runtime types:
  `js-yaml` promotes timestamp scalars to `Date`, while Bun leaves them as
  strings.
- Of 939 tracked Markdown files, 662 had non-empty leading frontmatter whose
  values matched after JSON normalization. Six additional files used a valid
  empty `---` / `---` block that a replacement boundary must handle
  explicitly.
- `Bun.YAML.stringify` preserves insertion order but does not reproduce
  `js-yaml`'s quoting, collection whitespace, or trailing-newline style. A
  Bun-native writer is therefore a canonical-format change, not a byte-neutral
  implementation swap.
- Bun's JSON family covers three formats beyond strict JSON:
  `Bun.JSON5.parse`/`stringify` for the JSON5 configuration superset,
  `Bun.JSONC.parse` for comments and trailing commas, and
  `Bun.JSONL.parse`/`parseChunk` for newline-delimited or streaming JSON.
- The repository has no tracked `.json5`/`.jsonc` files, direct JSON5/JSONC
  imports, or direct parser dependencies. Existing `json5` and
  `strip-json-comments` lockfile entries belong to third-party development
  tools and cannot be removed by changing repository code.
- The Git-broker recovery journal and usage-log aggregator do parse JSON Lines
  manually. Bun's complete JSONL parser stops at the first malformed value,
  while both current readers skip an unreadable line and continue; the broker
  additionally marks its evidence incomplete. `parseChunk` is therefore a
  candidate only behind an explicit corruption-semantics and net-benefit gate.
- Ordinary `JSON.parse`/`JSON.stringify` already use Bun's JavaScriptCore-native
  implementation whenever the application runs under Bun. Bun 1.4 adds JSON
  parser/stringifier optimizations automatically; there is no alternate
  `Bun.JSON.parse` API or source migration to perform for strict JSON.
- `Bun.cron` provides in-process scheduling, timezone support, validation, and
  no-overlap scheduling, but accepts only five fields. The current
  content-pipeline configuration documentation and tests explicitly accept
  six-field schedules such as `* * * * * *`; Bun rejects them as having too
  many fields.
- `Bun.markdown` provides GFM parsing, HTML, ANSI output, and custom render
  callbacks, but Bun labels the API unstable. Bun 1.4's `hardSoftBreaks` option
  does not reproduce Marked's `breaks` output, and custom rendering does not
  expose a line-break callback or the original image-alt source. Inline HTML
  tokens and ordinary angle-bracket text also arrive through the same untyped
  `text` callback. Those gaps prevent a complete escaped HTML renderer from
  preserving the current image, raw-HTML, and visible-text contracts.
- `--no-orphans` makes Bun exit when its original parent dies and recursively
  `SIGKILL`s descendants on clean exit. That is useful as a final containment
  layer, but it is not a substitute for the runtime supervisor's ordered drain,
  Git checkout ownership, or process-group absence proof.

Relevant Bun documentation:

- [Bun 1.4 release notes](https://bun.com/blog/bun-v1.4)
- [`Bun.Archive`](https://bun.com/docs/runtime/archive)
- [`Bun.YAML`](https://bun.com/reference/bun/YAML)
- [`Bun.JSON5`](https://bun.com/reference/bun/JSON5)
- [`Bun.JSONC`](https://bun.com/reference/bun/JSONC)
- [`Bun.JSONL`](https://bun.com/reference/bun/JSONL)
- [`Bun.cron`](https://bun.com/docs/runtime/cron)
- [`Bun.markdown`](https://bun.com/docs/runtime/markdown)

## Decision register

Do not hide these choices inside implementation details.

| Gate                             | Required decision                                                                                                                                    | Allowed outcomes                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML/frontmatter serialization   | Whether future writes may use Bun's semantically equivalent canonical YAML even though quoting and whitespace change                                 | Accept the new canonical format without a repository-wide rewrite, or retain the current writer and decline dependency removal. Do not grow a partial `js-yaml` clone to mimic its printer. |
| Cron expression compatibility    | Whether configured schedules may be restricted from Croner's extended/six-field syntax to Bun's standard five-field syntax                           | Adopt five fields and remove Croner, or retain Croner. Do not add a hybrid Croner fallback or a custom seconds-field scheduler.                                                             |
| Scheduler API naming             | Whether the exported `CronerBackend` / `CronerBackendOptions` names must remain compatible after Croner is gone                                      | Approve a narrow deprecated alias, or make the intentional rename to Bun-neutral names. Do not assume either outcome.                                                                       |
| JSONL corruption semantics       | Whether Bun's chunk parser can preserve skip-and-continue behavior and broker evidence completeness with less code or a measured operational benefit | Adopt one shared resilient JSONL reader only if it preserves later valid lines after corruption; otherwise retain the straightforward line loop.                                            |
| Markdown API maturity and output | Whether an unstable Bun API is acceptable for privileged HTML and user-visible CLI output, and whether output changes are allowed                    | Proceed only after the differential corpus and security gates pass with a net code reduction; otherwise retain Marked.                                                                      |
| Orphan containment surface       | Which top-level production/development invocations may recursively kill descendants, including direct package-bin portability                        | Adopt only the proven surfaces, or decline the flag. Never enable repository-wide `[run] noOrphans = true` as a shortcut.                                                                   |

Phases 1 and 2 do not depend on these decisions. Phase 3 must settle the YAML
serialization gate before changing writers. Phase 4 follows Phase 3. Phases
5–8 are independent conditional migrations.

## Working rules

- Use a clean worktree and Bun 1.4 for every phase. On the current machine,
  prepend `/tmp/bun-1.4/bun-linux-x64` to `PATH` for validation.
- Add characterization tests before replacing an implementation.
- Preserve package boundaries. Shared YAML/frontmatter policy belongs in
  `@brains/utils`; entity-service keeps schema and visibility policy.
- Do not use unsafe casts such as `as unknown as` to bridge Bun types.
- Do not retain two production implementations after a cutover.
- Do not emulate a removed dependency with more local code than the dependency
  boundary being deleted. Fail the phase's gate instead.
- Do not mass-reserialize tracked YAML or Markdown as part of the migration.
- Add a changeset when a phase changes published runtime behavior or generated
  durable content. Pure script/dev-tool cleanup does not need one.
- A green phase does not authorize merge, release, publication, deployment, or
  baseline regeneration.

## Phase 1 — replace the tar subprocess with `Bun.Archive`

### Tests first

Extract a small archive-reading function from
`scripts/verify-published-peer-metadata.ts` and cover it with synthetic `.tgz`
fixtures created through `Bun.Archive`:

1. reads `package/package.json` from a valid npm-shaped tarball;
2. reports a clear error when the manifest entry is absent;
3. reports malformed JSON as a permanent package defect, not a transient
   registry error;
4. reports an invalid/corrupt archive without retrying a compatibility defect;
   and
5. handles an archive containing unrelated entries without extracting them.

Keep network retries at the existing HTTP boundary. A malformed published
archive was successfully fetched and is not made healthy by retrying.

### Implementation

In `scripts/verify-published-peer-metadata.ts`:

- read the response as a `Blob` or byte buffer;
- call `new Bun.Archive(source).files()`;
- select exactly `package/package.json` from the returned map;
- parse the selected `Blob` as JSON and return the typed manifest; and
- remove `mkdtemp`, `writeFile`, `rm`, temporary paths, and the external `tar`
  spawn.

Do not extract the complete archive and do not add a command fallback for older
Bun versions; the repository already requires Bun 1.4.

### Exit gate

- No `tar` command or tarball staging directory remains in the verifier.
- Synthetic archive tests cover success and permanent failures.
- `bun run test:scripts` passes.
- The verifier succeeds against a real published site/theme package in a
  read-only/manual evidence run; it does not publish anything.

This phase needs no changeset.

## Phase 2 — remove dead Web Chat Vite tooling

### Characterization

Before deletion, build Web Chat through its package script and record the
expected `dist/ui/app.js`, source map, and emitted CSS behavior. The existing
Bun build script owns browser target, ESM format, minification, sourcemaps,
React deduplication, and the `@/` alias; no Vite option needs to be ported.

### Implementation

- Delete `interfaces/web-chat/vite.config.ts`.
- Remove the direct `vite` devDependency from
  `interfaces/web-chat/package.json`.
- Regenerate `bun.lock` with Bun 1.4 and verify a frozen install.
- Add a narrow package-wiring assertion only if current tests do not prove that
  the package `build` script invokes `scripts/build-ui.ts`. Do not add a test
  whose only purpose is asserting that a deleted filename stays deleted.

### Exit gate

- `rg` finds no Web Chat Vite configuration or invocation.
- `bun run --filter @brains/web-chat build`, tests, and typecheck pass.
- The Brain CLI build still embeds/ships the generated Web Chat asset.
- `bun install --frozen-lockfile` passes from a clean install state.

This phase needs no changeset.

## Phase 3 — move direct `js-yaml` consumers to `Bun.YAML`

**Decision: declined for now.** Bun's parser is compatible for current data, but
its writer changes quoting and collection whitespace, offers insufficient
formatting controls, and can turn a touched Markdown file into a noisy Git diff.
Keeping `js-yaml` only for writing would retain the dependency for little gain.
Revisit only when Bun can produce an approved stable durable-content format.

The following gate remains the bar for any future revisit.

### Tests first

Extend `shared/utils/test/yaml.test.ts` and add focused formatter tests under
`shared/content-formatters/src/formatters/` for the observable policy:

- mappings, sequences, nested values, nulls, booleans, and numeric scalars;
- timestamp-looking scalars, explicitly deciding whether the API returns
  strings rather than `Date` instances;
- anchors/aliases and repeated object references where supported;
- multiline and long strings;
- ambiguous strings such as `yes`, `on`, numeric-looking IDs, and date-looking
  values;
- invalid YAML and non-mapping top-level values;
- insertion-order preservation;
- the exact trailing-newline policy of generated formatter output;
- `DefaultYamlFormatter`'s fenced-block extraction and object-only contract;
  and
- `DefaultContentFormatter`'s YAML → JSON → plain-text fallback behavior.

Run a type-aware differential audit over the 336 tracked YAML files during the
PR. Compare scalar types as well as values so timestamp behavior cannot be
hidden by `JSON.stringify`.

### Implementation

- Make `shared/utils/src/yaml.ts` the narrow repository policy around
  `Bun.YAML.parse` and `Bun.YAML.stringify`; expose only the operations and
  newline behavior the repository needs, not a compatibility-shaped copy of
  `js-yaml`'s options.
- Update `DefaultYamlFormatter` and `DefaultContentFormatter` to use that shared
  policy.
- Preserve insertion order. Do not sort keys as a workaround for output
  differences.
- Remove direct `js-yaml` and `@types/js-yaml` declarations from
  `shared/utils` and `shared/content-formatters` and remove every repository
  import.
- Regenerate the lockfile. Transitive copies used by unrelated tooling may
  remain; the exit criterion is no production package declaration or direct
  import.

If preserving historical printer bytes is required, stop here and retain
`js-yaml`. A hand-written quote/folding/anchor compatibility printer is not an
acceptable Bun-native simplification.

### Exit gate

- The fixture matrix and tracked-file differential audit have an approved,
  documented result.
- Generated formatter output has explicit golden tests rather than incidental
  substring assertions.
- No direct runtime import or package dependency on `js-yaml` remains.
- `shared/utils` and `shared/content-formatters` tests, lint, and typecheck pass.
- Relevant entity serialization and packed-canary tests pass.

Add a changeset because formatter output and timestamp runtime types can be
externally observable.

## Phase 4 — replace `gray-matter` with shared Bun-native frontmatter

**Decision: declined with Phase 3.** A Bun-native frontmatter boundary would
inherit the same writer churn. Parsing alone does not remove Gray Matter, so it
would add a second boundary without deleting the dependency.

This phase depends on Phase 3's YAML policy and the same serialization decision.
It replaces a frontmatter boundary, not Markdown parsing generally; Remark
remains responsible for AST-based Markdown operations.

### Tests first

Expand `shared/utils/test/markdown.test.ts` into the parser/writer contract
before changing implementations:

- no frontmatter, empty input, and bare content;
- empty `---` / `---` frontmatter;
- LF and CRLF delimiters;
- an optional leading UTF-8 BOM, matching current behavior;
- a delimiter-like line later in the Markdown body;
- a missing closing delimiter;
- malformed YAML and a non-mapping frontmatter root;
- nested metadata, arrays, multiline strings, quoted values, timestamps, and
  empty values;
- exact content-boundary behavior, including whether the newline after the
  closing delimiter is retained before higher-level trimming;
- metadata object independence across repeated parses;
- empty metadata producing bare content; and
- exact canonical generated output and semantic parse/write/parse round trips.

Keep and extend `shell/entity-service/test/frontmatter.test.ts` for domain
policy: recursive date normalization, null/undefined omission, visibility
injection/removal, strict schemas, nested metadata, and bare-content behavior.
Add a tracked-frontmatter differential audit that is type-aware and separately
reports parse differences and writer churn.

### Implementation

Create one shared boundary in `shared/utils/src/markdown.ts`:

1. recognize only a leading frontmatter block under the characterized
   delimiter/BOM rules;
2. parse its YAML through the Phase 3 utility;
3. require a mapping for metadata;
4. return a fresh metadata record and the untouched body slice; and
5. generate delimiters around the canonical Bun YAML while preserving the
   approved content-newline framing.

Then:

- make the existing shared `parseMarkdown`, `generateMarkdown`, and
  `updateFrontmatterField` functions use that boundary;
- make `shell/entity-service/src/frontmatter.ts` use the shared boundary while
  retaining entity schemas, date normalization, null omission, and visibility
  policy in entity-service;
- replace test-only `gray-matter` imports in
  `shell/entity-service/test/entityRegistry.test.ts` with the public/shared
  contract under test;
- remove `gray-matter` from `shared/utils` and `shell/entity-service`; and
- regenerate the lockfile and verify that its obsolete dependency chain is
  removed where no other package needs it.

Do not rewrite all existing Markdown. New canonical serialization applies when
a file is actually generated or updated, and the changeset must name the
formatting impact. Do not retain Gray Matter as a fallback for unusual input;
unsupported syntax must either be included in the explicit contract or fail
clearly.

### Exit gate

- All 939 tracked Markdown files complete the differential audit; every
  difference is explained, with the six empty-frontmatter cases passing.
- No direct `gray-matter` import or manifest dependency remains.
- Shared Markdown and entity frontmatter suites pass.
- Entity-service, directory-sync import/export, CMS editing, content-pipeline,
  and shell/core tests pass.
- The complete repository test suite and packed canary pass because this is a
  durable-content boundary.

Add a changeset describing the parser type policy and canonical writer change.

## Phase 5 — evaluate Bun's JSON family and conditionally adopt `Bun.JSONL`

**Decision: declined after compatibility and performance evaluation.** A
`parseChunk()` wrapper preserved 10 of 11 line-oriented fixtures, including a
valid record after malformed middle input, but treated a whitespace-only damaged
journal line as harmless where the current broker marks evidence incomplete.
Preserving that distinction requires another pre-scan or line parser.

Nine-sample separate-process timing medians over repeated 1 MiB
schema-inclusive fixtures, plus five-sample peak-RSS measurements, showed no
material operational gain:

| Path           |       Valid | Torn final line | Sparse corrupt lines |    Peak RSS impact |
| -------------- | ----------: | --------------: | -------------------: | -----------------: |
| Broker journal | 5.0% faster |     1.6% faster |          2.8% faster | 0.5–2.4 MiB higher |
| Usage log      | 3.6% slower |     2.8% slower |          4.2% slower | 7.5–9.2 MiB higher |

The broker reads at most 1 MiB only during startup, and the usage path became
slower. The wrapper also adds recovery logic while removing no dependency, so
the current `split("\n")` + `JSON.parse` readers remain simpler and safer.
JSON5 and JSONC still have no direct repository consumer.

Strict JSON, JSON5, JSONC, and JSONL solve different problems. Do not replace
`JSON.parse` with a more permissive parser merely because both return JavaScript
values.

### Format boundaries

- **Strict JSON (`JSON.parse` / `JSON.stringify`)** is the interoperable data
  format used by HTTP payloads, package manifests, persisted JSON columns, and
  most repository messages. Under Bun these standard globals already execute
  Bun/JavaScriptCore's native implementation.
- **JSON5 (`Bun.JSON5`)** is a human-authored configuration superset with
  comments, trailing commas, unquoted identifier keys, single-quoted strings,
  hexadecimal numbers, `Infinity`, and `NaN`. It has parse and stringify APIs,
  and Bun can import `.json5` files directly.
- **JSONC (`Bun.JSONC`)** keeps JSON's value model but permits `//` and block
  comments plus trailing commas. It is commonly used by `tsconfig.json`; Bun
  exposes parsing but no JSONC stringifier.
- **JSONL (`Bun.JSONL`)**, also called JSON Lines or NDJSON, stores one complete
  JSON value per line. `parse()` handles a complete string or byte buffer;
  `parseChunk()` reports parsed values, consumed bytes/characters, completion,
  and syntax errors for incremental streams.

JSON5 and JSONC have no current direct repository consumer. Record them as
available APIs, but add no wrapper, dependency, or speculative format. Their
transitive tooling packages remain owned by those third-party tools.

Ordinary strict JSON also needs no migration. Bun 1.4's faster
`JSON.parse`/`JSON.stringify` paths are received automatically by existing
calls. Performance relative to Node/V8 depends on payload shape; do not replace
schema validation, remove error handling, or claim a universal speed ratio.

### JSONL tests first

The only credible source change is a shared resilient reader for
`plugins/directory-sync/src/lib/broker/journal.ts` and
`shell/app/src/usage-aggregator.ts`. Before writing one, pin both current
contracts:

- complete LF and CRLF input, blank lines, UTF-8 BOM, and no final newline;
- multiple values in one buffer and values split across streaming chunks;
- a partial final line from a crash;
- malformed first, middle, and final lines;
- a valid line after a malformed middle line, which must still be returned;
- schema-invalid but syntactically valid values;
- broker start/settle ordering and ambiguity calculation;
- `evidenceComplete: false` for every unreadable or partial journal record;
- usage aggregation ignoring malformed/unrelated values while preserving later
  valid events; and
- input-size and Unicode behavior representative of real logs.

`Bun.JSONL.parse()` alone is not compatible: after valid values it returns the
partial prefix at the first parse error. A candidate wrapper must use
`parseChunk()`, mark the error, advance to the next line boundary, and continue
without losing later evidence.

### Benchmark and net-simplification gate

Benchmark under Bun 1.4 using realistic 1 MiB journal and usage-log fixtures:

1. the existing `split("\n")` + `JSON.parse` implementation;
2. the proposed `Bun.JSONL.parseChunk` reader;
3. valid input;
4. a torn final append; and
5. sparse malformed middle records.

Measure wall time and peak/transient memory in separate processes. Proceed only
if the shared reader is simpler overall or delivers a material measured gain on
these real paths while preserving every corruption contract. This phase removes
no external dependency, so a marginal microbenchmark win is insufficient.

If the gate fails, retain the current readers and record JSONL as evaluated. Do
not add a wrapper around `Bun.JSON5` or `Bun.JSONC`, and do not maintain two
JSONL parsers.

### Implementation, only if the gate passes

- Add one narrowly named JSON Lines utility under `@brains/utils` that returns
  parsed values plus whether the complete input was trustworthy.
- Implement recovery after an erroneous line with `Bun.JSONL.parseChunk`; do
  not silently accept its prefix-only default as the repository contract.
- Keep Zod validation in the broker and usage aggregator after syntactic
  parsing.
- Keep writers on `JSON.stringify(value) + "\n"`; Bun has no JSONL stringifier
  and the current append/compaction durability policy remains correct.
- Migrate both readers atomically and remove their duplicate manual parsing only
  after the shared tests pass.

### Exit gate

- All valid, partial, corrupt-middle, and schema-invalid fixtures preserve the
  established outcomes.
- Broker ambiguity and `evidenceComplete` behavior are unchanged.
- Valid usage events after one damaged log line are still aggregated.
- Benchmarks and source diff satisfy the net-simplification gate.
- Directory-sync broker, app usage, Git-broker process-inventory, and packaged
  recovery tests pass under Bun 1.4.
- No JSON5/JSONC wrapper or permissive parser substitution is introduced.

No changeset is needed for a behavior-neutral internal parser optimization. If
observable recovery or log behavior changes, stop and treat that as a separate
reviewed contract change.

## Phase 6 — conditionally replace Croner with `Bun.cron`

### Outcome — implemented pending review

The five-field schedule contract and Bun-neutral exported names were approved.
The implementation included in this branch uses `Bun.cron` and
`Bun.cron.parse`, renames the production backend to `BunSchedulerBackend`
without a compatibility alias, rejects six-field expressions with migration
guidance, removes Croner, and adds timezone, DST, POSIX day, overlap, error, and
drain coverage. Targeted checks and the complete repository test gate pass
under Bun 1.4.

Proceed only if five-field cron is approved as the complete supported contract.
If six-field/seconds compatibility must remain, close this phase as declined and
keep Croner.

### Tests first

Before deleting Croner, add a differential fixture matrix in
`shell/scheduler/test/scheduler-backend.test.ts` covering the supported subset:

- ordinary five-field expressions, ranges, lists, steps, month/weekday names,
  and accepted nicknames;
- invalid syntax and impossible schedules;
- local and explicit IANA timezones;
- day-of-month/day-of-week OR behavior;
- spring-forward and fall-back DST behavior;
- multiple jobs with the same expression;
- callback errors, overlap skips, stop idempotency, and draining an active
  callback;
- deterministic `TestSchedulerBackend.advanceTo()` cadence; and
- fixed intervals continuing to use the injected Effect clock.

Add an explicit rejection test for six-field expressions. Migrate
content-pipeline tests that use `* * * * * *` merely as a manual tick key to a
five-field expression; they already use `TestSchedulerBackend` and need no real
minute wait.

### Implementation

- Replace Croner's production timer with the in-process
  `Bun.cron(expression, handler, { tz })` overload.
- Keep `SupervisedScheduledJob` as the owner of callback fibers, error
  reporting, overlap reporting, and drain-on-stop. Its Bun handler should
  trigger the supervised cycle and return immediately so existing skipped-tick
  observability is not silently deleted.
- Replace the test backend's `Cron.nextRun()` calls with
  `Bun.cron.parse(expression, relativeDate, { tz })` while preserving
  deterministic callback order.
- Validate through one shared Bun-native helper so production and test
  backends reject the same expression set.
- Update content-pipeline comments and public configuration documentation to
  state standard five-field syntax and remove the every-second example.
- Rename `CronerBackend` and `CronerBackendOptions` to Bun-neutral names, or add
  only the explicitly approved deprecated alias from the decision register.
- Remove `croner` from `shell/scheduler` and regenerate the lockfile.

Do not use Bun's OS-level cron registration; these jobs share runtime state and
must die with the brain process. Do not rely on Bun's default uncaught error
semantics; errors remain contained and reported through the scheduler's
existing hooks.

### Exit gate

- The supported expression/DST/timezone matrix passes under Bun 1.4.
- Six-field configuration fails early with a clear migration message.
- Overlap, callback-error, stop, and active-drain behavior remains observable.
- No `croner` import or dependency remains, subject to the approved naming
  decision.
- Scheduler, recurring-checks, content-pipeline, canonical bundle, full repo,
  and packed-canary tests pass.

Add a changeset that explicitly calls out the five-field compatibility change
and any exported class rename.

## Phase 7 — conditionally replace Marked with `Bun.markdown`

### Outcome — declined on Bun 1.4

Characterization coverage was added for the HTML/GFM/security/image contract
and for color-enabled and color-disabled terminal rendering. The differential
spike found that:

- `{ hardSoftBreaks: true }` still emits a literal soft line break instead of
  the `<br>` produced by the current `breaks: true` contract;
- `render()` has no line-break callback;
- an image callback receives rendered alt children (`some alt`) rather than the
  original alt source (`some *alt*`), so it cannot preserve `ImageRenderer`
  arguments;
- returning `undefined` from an image callback omits the image rather than
  falling through to default image HTML;
- registering one callback disables default wrappers for all elements, so
  custom images require a complete local HTML renderer; and
- inline HTML tags and ordinary angle-bracket text are both delivered to the
  `text` callback without token metadata, so a local renderer cannot both
  preserve allowed raw HTML and escape visible text without reparsing or
  rewriting the source.

A Bun callback-based CLI prototype did preserve the characterized terminal
contract and reduced its adapter from 159 to 98 lines. That is insufficient for
an atomic dependency removal because the privileged HTML consumer cannot pass
Gate A. Migrating only the CLI would retain Marked, add exposure to an unstable
API, and remove no dependency. The prototype is discarded; both consumers
retain Marked, with no fallback, production change, or changeset.

Reconsider only when Bun exposes token-distinct escaped/raw text, original image
alt source, and effective hard-soft-break customization, or when the repository
intentionally changes those contracts.

This is a measured spike followed by a cutover only if it earns one. Marked is
small and working; merely moving equivalent renderer code into the repository
is not a win.

### Gate A — API and differential spike

Confirm the Bun version pinned by the repository still exposes the required
`Bun.markdown` callbacks and record that the API remains unstable. Build a
representative differential corpus for both consumers.

For `shared/ui-library/src/markdown-html.ts`, cover:

- headings, paragraphs, hard/soft breaks, nested lists, blockquotes, links,
  images, fenced and inline code;
- GFM tables, task lists, strikethrough, autolinks, and escaping;
- Mermaid language classes;
- blockquote-attribution `<cite>` post-processing;
- raw HTML and HTML entities;
- unsafe protocols, event attributes, script/iframe removal, and SVG/data URL
  rejection; and
- `ImageRenderer` arguments and string/`undefined` return behavior.

For `interfaces/chat-repl/src/renderer.ts`, add missing direct tests for:

- heading and inline emphasis styles;
- entity-ID line highlighting;
- 80-column wrapping;
- fenced-code boxes and language labels;
- blockquotes, nested lists, rules, links with visible destinations, images,
  HTML entity decoding, and line breaks; and
- color-enabled and color-disabled output, using `Bun.stripANSI` where the
  assertion is semantic.

Security assertions remain against the final sanitized HTML, not only the
Markdown parser's intermediate output.

### Gate B — net simplification

Prototype the narrowest implementation:

- use `Bun.markdown.render` callbacks for the CLI so existing special rendering
  remains explicit;
- use a complete, escaped HTML callback set where custom image rendering is
  needed; and
- retain `sanitize-html` as the final privileged-browser boundary.

Proceed only if all required GFM/security/image/CLI contracts pass and the
result deletes more dependency/adapter code than it adds. `Bun.markdown.html`
alone is insufficient because it cannot honor the current `ImageRenderer`
contract. Do not add React server rendering or regex-rewrite generated `<img>`
tags to force the migration.

If either gate fails, discard the spike, retain Marked, and record the specific
Bun API gap in this plan. Do not maintain a runtime feature flag or Marked
fallback.

### Implementation, only after both gates pass

- Replace the two direct Marked consumers atomically so one direct dependency
  is not left behind.
- Keep the current sanitizer allowlist and protocol policy unless separately
  reviewed as a security change.
- Remove `marked` from `@brains/ui-library` and `@brains/chat-repl` and
  regenerate the lockfile. A transitive Marked used by unrelated packages may
  remain.
- Benchmark the representative corpus only as supporting evidence; correctness
  and net deletion are the gates.

### Exit gate

- Differential fixtures have approved output, including intentional changes.
- Existing and new sanitizer attack cases pass.
- PDF/media and console visual tests prove browser-facing HTML still renders.
- CLI renderer tests prove terminal behavior with and without ANSI color.
- No direct Marked import/dependency remains and no fallback exists.
- UI library, chat REPL, media composition, full repository, and packed-canary
  tests pass.

Add a changeset for user-visible HTML or terminal-output changes. If the phase
is declined after the spike, ship no production changes and no changeset.

## Phase 8 — conditionally adopt `--no-orphans`

### Outcome — implemented on narrow surfaces pending review

Host and `oven/bun:1.4.0-slim` probes proved recursive cleanup after clean exit,
original-parent death, detached process-group containment, no signalling of an
unrelated sibling, and ordinary `SIGTERM` drain before final containment. The
same behavior passed through direct scripts, `bun run`, and filtered workspace
scripts. A container probe with tini confirmed parent, child, and grandchild
cleanup handlers completed in order before the container stopped.

The implementation included in this branch applies the flag only to:

- the generated deployment `CMD` behind tini;
- canonical `start:*` development postures, using `exec` so the flagged Bun
  process observes the original runner's death;
- monorepo runner subprocesses that already forward graceful signals; and
- the one-shot `operate` runner, which otherwise has no abrupt-parent cleanup.

It deliberately does not change the portable `brain` package-bin shebang, add a
wrapper, flag supervisor-owned web/worker/Git-broker children, or set a global
bunfig/environment switch. Runtime drain order, signal forwarding, Git broker
process-group escalation, and group-absence proof remain unchanged. The process
matrix passed ten consecutive runs; the Git process-inventory soak completed
300 operations with zero lost completions or zombies, and packaged broker
recovery passed.

Treat this as containment hardening, not dependency cleanup. It must preserve
the runtime's explicit lifecycle and Git ownership invariants.

### Gate A — isolated process-tree probes

Create subprocess fixtures that record parent, child, and grandchild PIDs and
prove Bun 1.4 behavior on the supported deployment platforms:

1. clean parent exit recursively removes descendants;
2. original-parent death removes the Bun process and descendants;
3. ordinary signal-driven shutdown still gives application cleanup a chance
   before Bun's final recursive kill;
4. a detached process group is still contained; and
5. no unrelated sibling process is signalled.

Run the probe in the deployment container as well as the host. Capture exact
flag placement for direct scripts, `bun run`, package bins, and filtered
workspace scripts; do not infer that one form covers the others.

### Gate B — choose narrow entrypoints

Assess these surfaces independently:

- the generated deployment `CMD` in `shared/deploy-support`;
- the built `@rizom/brain` executable/shebang and its cross-platform package-bin
  behavior;
- canonical development posture scripts in `packages/brain-cli/package.json`;
- short-lived CLI runner subprocesses such as `operate`; and
- web, worker, and Git-broker children spawned by the runtime supervisor and
  development sidecar.

Prefer an explicit `--no-orphans` argument at a reviewed Bun entrypoint. Do not
set `BUN_FEATURE_FLAG_NO_ORPHANS=1` globally or add repository-wide
`[run] noOrphans = true`; inherited global behavior would affect tests,
one-shot tooling, and intentionally managed process groups that were not part
of the proof.

If the package executable cannot carry the flag portably without an extra
wrapper or broad environment behavior, either limit adoption to generated
production/dev commands or decline the phase. Record that scope explicitly.

### Implementation, only for approved surfaces

- Add the flag at each proven top-level Bun invocation and update deployment
  contract tests.
- Retain signal forwarding, graceful shutdown deadlines, broker admission
  closure, group `SIGTERM`/`SIGKILL`, and ESRCH-based group-absence checks.
- Do not simplify `process-supervisor.ts`, `git-broker-sidecar.ts`, or
  `git-stall.ts` merely because Bun has a final recursive kill. Those paths
  provide ordering and proof that the flag does not.
- Add process-inventory regression coverage for both graceful and abrupt outer
  exits.

### Exit gate

- The isolated process-tree matrix passes on host and deployment image.
- Normal shutdown still drains web/worker activity before stopping the Git
  broker.
- Broker replacement occurs only after the old process group is proven absent;
  no-orphans does not become that proof.
- `bun run test:git-broker-process-inventory` and
  `bun run test:git-broker-recovery` pass under Bun 1.4.
- All packed compatibility contracts pass and leave no descendant process.
- No global no-orphans setting exists.

Add a changeset if packaged runtime or generated deployment behavior changes.
No deployment or live orphan-kill test is authorized by this phase.

## Explicitly out of scope after audit

Do not add implementation phases for these without new Bun capabilities or new
failure evidence:

- **Chokidar → filesystem primitives:** Bun does not replace recursive watcher
  normalization, write-stability, and cross-platform event semantics.
- **Simple Git → hand-written subprocess wrapper:** the repository's Git broker
  and checkout ownership are substantial; replacing Simple Git is a separate
  architecture project, not a built-in API swap.
- **`pngjs` → `Bun.Image`:** `Bun.Image` does not expose the deterministic raw
  RGBA pixels needed by visual comparison and fixture generation.
- **`happy-dom` → `Bun.WebView`:** a process-backed browser is not a drop-in
  synchronous DOM unit-test environment.
- **Hono → `Bun.serve` routes:** dynamic plugin registration, host-sensitive
  routing, middleware, authorization, and compression remain real Hono work.
- **libSQL/Drizzle → `bun:sqlite` or `Bun.SQL`:** the shared local/remote Turso
  contract is required.
- **Remark → `Bun.markdown`:** image rewriting and structured-content work use
  mutable Markdown ASTs, which Bun's rendering callbacks do not provide.
- **`p-limit`, Nano ID, or custom env-file loading:** Bun has no
  behavior-preserving replacement for the current semaphore contract, ID
  format, or explicit config-file loading semantics.

## Validation strategy

Use the lightest checks while developing each phase, then the phase-specific
exit gate. For code-changing phases, the final repository gate is:

```bash
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun install --frozen-lockfile
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run format:check
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run lint
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run typecheck
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run test
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run arch:check
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run workspace:check
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run deps:check
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run changeset:check
```

Run the packed matrix only for cross-package/runtime phases (frontmatter,
JSONL when it changes the broker, cron, Markdown, and no-orphans), not for the
script-only Archive cleanup:

```bash
PATH=/tmp/bun-1.4/bun-linux-x64:$PATH bun run test:packed:compat
```

Run `bun run docs:check` whenever this plan, the roadmap, or affected public
configuration documentation changes.

## Acceptance criteria

1. The release verifier reads package manifests through `Bun.Archive` with no
   external `tar` command or temporary extraction.
2. Web Chat has one build system: `Bun.build`; its Vite config and direct
   dependency are gone.
3. If the YAML formatting gate is accepted, direct `js-yaml` consumers and
   declarations are gone behind one tested Bun YAML policy; otherwise the phase
   is explicitly declined without a local printer clone.
4. If canonical Bun frontmatter is accepted, one shared parser/writer replaces
   Gray Matter and preserves the approved delimiter, schema, visibility, and
   semantic round-trip contracts.
5. JSON5 and JSONC remain dependency-free available formats rather than
   speculative wrappers; JSONL replaces manual line parsing only if it
   preserves corrupt-line recovery and produces a measured net simplification.
6. Existing strict `JSON.parse`/`JSON.stringify` calls receive Bun's runtime
   optimizations without a source-level migration or universal performance
   claim.
7. Croner is removed only with an approved five-field schedule contract,
   deterministic timezone/DST coverage, and an explicit exported-name
   decision.
8. Marked is removed only if both consumers preserve approved output and
   security contracts with a net code reduction and no fallback.
9. No-orphans is enabled only on process-tree surfaces proven safe; explicit
   graceful shutdown and Git process-group ownership remain intact.
10. No phase introduces unsafe casts, dual production implementations, broad
    global feature flags, or automatic durable-content rewrites.
11. Every behavior-changing phase has a changeset and passes its targeted,
    repository, and required packed gates under Bun 1.4.
12. Every merge, release, publication, deployment, or compatibility-breaking
    decision remains separately and explicitly authorized.

When all phases are either implemented or explicitly declined, move durable
outcomes into package/runtime documentation and remove this plan; Git history
is the archive for the research and completed phase logs.
