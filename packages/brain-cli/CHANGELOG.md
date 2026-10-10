# @rizom/brain

## 0.2.0-alpha.517

## 0.2.0-alpha.516

### Minor Changes

- [#557](https://github.com/rizom-ai/brains/pull/557) [`2fa2775`](https://github.com/rizom-ai/brains/commit/2fa27752be3b73160704d99058cc18c29e00a7ed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The default text model is now `gpt-6-luna` at low reasoning, replacing `gpt-5.6-luna`. On the canonical eval suites it passes at the same rate (98.7% against 98.8%) at about half the cost. Guest chat prices GPT-6 Luna turns at its published rates, so guest costs stay known after the switch; a turn answered from the FAQ without a model call is labelled `no-model-call`. Instances that set `model` keep their model.

### Patch Changes

- [#557](https://github.com/rizom-ai/brains/pull/557) [`6eb665a`](https://github.com/rizom-ai/brains/commit/6eb665a7e19631c4d1b849cb76bd06ca61023b1d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `system_create` refuses a title that already exists for notes and other plugin-handled types too, and points the model to `system_update`; `replace: true` still creates a deliberate copy. Before, an edit of a just-imported note that the model misrouted to `system_create` silently saved a duplicate such as `community-launch-plan-2`, sometimes with the original upload's content instead of the edits.

- [#559](https://github.com/rizom-ai/brains/pull/559) [`d31e95d`](https://github.com/rizom-ai/brains/commit/d31e95d26310c51936743fa7fbc410faedc2fae3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Eval success criteria accept `responseCriteria`: plain-language requirements on what a reply conveys, judged for meaning rather than wording, all of a turn's requirements in one judge call. An unmet requirement fails the case with the judge's reason. Requirements the run could not judge (judge skipped, unavailable, or an incomplete verdict) are listed on the result and in the console report instead of passing silently.

  The bundled eval cases replace keyword checks on model wording with judged requirements that keep each check's intent: concept words, synonym lists such as verify/contact/reach, and single-word guards such as "deleted", "saved" or "done" that also match a correct refusal ("it can't be deleted"). Checks on host-produced text and on facts from seed content or tool results stay exact. A case no longer forbids a write attempt that runtime policy refuses; it requires the reply to decline without claiming the change.

- [#557](https://github.com/rizom-ai/brains/pull/557) [`86ef50a`](https://github.com/rizom-ai/brains/commit/86ef50a2a1b6da147b665a17b257d59bcb3051b5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publishing queue actions accept an entity's title or slug as well as its id, as the system tools do, and queue it under its id. Before, `publishing_manage` queue-add with a post's title failed with "Entity not found" and the assistant told admins it could not queue the draft.

- [#557](https://github.com/rizom-ai/brains/pull/557) [`3299684`](https://github.com/rizom-ai/brains/commit/329968484199d2104e671dca332db68b7230e985) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `system_status` lists the web surfaces the caller may open — such as the dashboard, Studio and the public site — with their paths, filtered by the caller's permission. Before, status left them out although its description promised interfaces, so the assistant either guessed `/dashboard` and `/studio` or said it could not tell.

- [#557](https://github.com/rizom-ai/brains/pull/557) [`afd282e`](https://github.com/rizom-ai/brains/commit/afd282e206917f87445f1670d268e78802162704) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A user-message source whose boundaries do not select content now names the failing boundary and why — missing, repeated, or out of order — and says how to select everything after an instruction with a literal `startAfter` and no `endBefore`. Before, one generic refusal told the model to ask for clarification, and models asked users to resend pasted posts whose frontmatter `---` lines repeat.

## 0.2.0-alpha.515

### Patch Changes

- [#588](https://github.com/rizom-ai/brains/pull/588) [`eb47f05`](https://github.com/rizom-ai/brains/commit/eb47f05a3f3f0cffa999525a2522f7944277ec87) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Studio names an entity type by its display label, pluralized, never by the path its pages live under. A books site opens book sections under `/books`, so Studio showed two "books" sections; it now shows Books and Sections.

## 0.2.0-alpha.514

### Patch Changes

- [#587](https://github.com/rizom-ai/brains/pull/587) [`f681966`](https://github.com/rizom-ai/brains/commit/f6819663e0f8d8ab04f8de913e16c8a92bca822f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A book that is one undivided text names its score's single line by its title instead of the edition's lone number.

## 0.2.0-alpha.513

### Patch Changes

- [#585](https://github.com/rizom-ai/brains/pull/585) [`09595c9`](https://github.com/rizom-ai/brains/commit/09595c94e5d22f638342a2d6ec6c06aed14e94d3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Analytics captures site traffic into weekly `traffic-snapshot` entities: a daily check stores yesterday's Cloudflare counts per day (pageviews, visits, top paths, referrers, path × referrer pairs, countries) while they are exact, refreshes the last three days, and on its first run backfills every day Cloudflare still returns, marking sampled days as estimates. Snapshots are restricted and stay out of search and embeddings; a failed capture raises an alert.

## 0.2.0-alpha.512

### Patch Changes

- [#584](https://github.com/rizom-ai/brains/pull/584) [`7681dc0`](https://github.com/rizom-ai/brains/commit/7681dc02e21fa90deb08cb9162fa0388e1d1c5f7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A book's score reads as its printed contents: every unit its author titled is listed by name, whether or not any of its part's units is split, numbered aphorisms are drawn as strokes on their chapter's line, texts the edition names (a motto, a dedication, a dialogue) are listed without brackets, and title pages are drawn on the line they open. Zarathustra's second part lists its Reden. The eKGWB importer files sections under the parts the edition prints: a chapter whose sigla are spelled two ways stays one chapter, a bracketed repeat of a heading continues its chapter, a heading-only block names its part ("Versuch einer Selbstkritik", "Der Wanderer und sein Schatten"), and neither a year nor a title fragment from a siglum becomes a heading.

## 0.2.0-alpha.511

### Patch Changes

- [`360d676`](https://github.com/rizom-ai/brains/commit/360d67676f9dca662d5b8c80a8c3a80888e7c944) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Agent shutdown now drains complete admitted model/tool operation Promises, not only their interrupted Effect observations. Caller cancellation stays prompt and preserves its reason, while cancelled or cancellation-ignoring work remains owned until it actually settles. Publish work and close ownership before adapters or abort listeners can reenter shutdown, and retain scope-close failures until the work barrier completes.

## 0.2.0-alpha.510

### Patch Changes

- [#583](https://github.com/rizom-ai/brains/pull/583) [`be78945`](https://github.com/rizom-ai/brains/commit/be78945758dd6b15e27271d25c042e2feb2eeedd) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A content pull no longer queues its work twice. The file watcher reports a large pull late, often minutes after git reconciliation has already queued the same imports and deletes, and the old ten-second, first-event-only suppression let those reports through: migrating Friedrich's corpus queued 3,731 redundant deletes and re-imported every file. The watcher now ignores a pulled path for as long as it still matches HEAD, however late or often it is reported; an edit made since still differs from HEAD and is imported.

## 0.2.0-alpha.509

### Patch Changes

- [#570](https://github.com/rizom-ai/brains/pull/570) [`010d171`](https://github.com/rizom-ai/brains/commit/010d1713adba894a2151af948016a2073f0cc72c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Raise compatible security-update minimums for the MCP client/server, Hono, PDF.js, JS-YAML, HTML sanitization, mail parsing and PostCSS. Refresh compatible vulnerable transitive dependencies, including nested JS-YAML, Seroval, Axios, Undici, DOMPurify, Mermaid, shell-quote and brace-expansion, without changing AI/Chat SDK versions, Effect pins or database dependencies.

  Migrate the Git broker to simple-git 4.0.2's named export and patched argument parser. Preserve broker ownership, managed hook disabling and credential handling without enabling additional unsafe operations. Add controls for configuration includes, trailer commands, abbreviated executable options and explicitly supplied VISUAL editors.

  This is not a clean-security-audit claim. Remaining advisories without compatible updates are not resolved by this patch.

## 0.2.0-alpha.508

### Patch Changes

- [#575](https://github.com/rizom-ai/brains/pull/575) [`80c10ab`](https://github.com/rizom-ai/brains/commit/80c10abca6391eeb31203864ee2c7b3e30aa20b2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serve a brain's stored identity from boot in every process. While the startup import is pending, or after it failed, the web process previously never read the brain character and anchor profile already in its database and advertised "Brain is Unknown's Knowledge assistant". Defaults are still created only after a successful startup sync.

## 0.2.0-alpha.507

### Patch Changes

- [#581](https://github.com/rizom-ai/brains/pull/581) [`1516d52`](https://github.com/rizom-ai/brains/commit/1516d52fa1f909d7fa5e9aec79802ee851c4bf5f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Analytics injects its beacon only with `cloudflare.beaconToken` (`CLOUDFLARE_ANALYTICS_BEACON_TOKEN`), the Web Analytics site token; `siteTag` is only the metrics query filter. The beacon carried the site tag, which is not its token, and a proxied zone with automatic setup already gets the beacon from Cloudflare.

- [#580](https://github.com/rizom-ai/brains/pull/580) [`dbaa3b1`](https://github.com/rizom-ai/brains/commit/dbaa3b11b0f4888bea6956e2cd7efa26e388617d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The pre-deploy snapshot's refusal "job queue is not idle" now names the queue it saw (pending, processing and abandoned counts) and says to rerun once it drains, so a deploy that stops on a busy brain explains itself in the workflow log.

## 0.2.0-alpha.506

## 0.2.0-alpha.505

## 0.2.0-alpha.504

### Patch Changes

- [#578](https://github.com/rizom-ai/brains/pull/578) [`9d9d40d`](https://github.com/rizom-ai/brains/commit/9d9d40dd04be3a817ab53bf647f0b6ef54c6d5ef) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Site builds ask plugins for layout slots as they render, so the newsletter signup reaches the built footer; registered on `pluginsRegistered`, it never reached the worker process that builds the site.

## 0.2.0-alpha.503

### Patch Changes

- [#576](https://github.com/rizom-ai/brains/pull/576) [`9c65cbf`](https://github.com/rizom-ai/brains/commit/9c65cbf0664c556cc8cab43c5b5a7fe9b4671cee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Site builds ask plugins for head scripts as they render, through the new `context.messaging.collect`, so the analytics beacon reaches the built pages; registered from the ready phase, it never reached the worker process that builds the site.

- [#576](https://github.com/rizom-ai/brains/pull/576) [`9c65cbf`](https://github.com/rizom-ai/brains/commit/9c65cbf0664c556cc8cab43c5b5a7fe9b4671cee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connection pragmas refused by a held lock are retried once, by the local client, instead of again on top of it; a locked database delayed startup by two retry budgets.

## 0.2.0-alpha.502

### Patch Changes

- [#573](https://github.com/rizom-ai/brains/pull/573) [`34fc4ef`](https://github.com/rizom-ai/brains/commit/34fc4ef886cef62fb34f57f9a8fd74e044867291) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Books and their sections are two entity types: `book` is the work, with its details and contents, at `book/<slug>.md`; `book-section` is its text, at `book-section/<slug>/…`. Entity counts, search scopes and Studio now read 26 books and 3,705 sections instead of counting every section as a book. Answers cite sections only; a book's contents are never a source. The corpus reader reads back each part of a book printed in parts, so a corpus can be re-rendered without fetching its source.

- [#571](https://github.com/rizom-ai/brains/pull/571) [`86bc21a`](https://github.com/rizom-ai/brains/commit/86bc21a0fb884b34ad9043bb45518fc20fceaa55) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A projection wave larger than SQLite can bind in one statement is claimed and requeued in chunks. Before, a change touching several thousand entities at once — a corpus migration, a bulk import — failed every coordination sweep with "too many SQL variables", and no projection or automatic site rebuild ran again.

## 0.2.0-alpha.501

### Patch Changes

- [#568](https://github.com/rizom-ai/brains/pull/568) [`da50849`](https://github.com/rizom-ai/brains/commit/da50849435abf847073c8d1b89f1f7d5aa255a42) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Analytics queries accept Cloudflare's `errors: null` on a successful response; every query failed with "expected array, received null".

- [`8932425`](https://github.com/rizom-ai/brains/commit/8932425101438c3eef1f60ac0f584b2974e9a465) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A native cron-stop failure no longer bypasses admitted callback draining or scheduler scope finalizers. Scheduled jobs prevent further callback admission and finish cleanup before reporting failures, preserving a single failure's identity and aggregating multiple failures in cleanup order.

## 0.2.0-alpha.500

### Patch Changes

- [#566](https://github.com/rizom-ai/brains/pull/566) [`b5265b6`](https://github.com/rizom-ai/brains/commit/b5265b6985ea0cb0dac704028da8550d621fff4d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep both published agent cards current with the brain's identity and skills. The A2A Agent Card is built per request, so a brain whose anchor profile, character or skills landed after startup no longer advertises "Brain is Unknown's Knowledge assistant" until restart. The AT Protocol brain card republishes on a new `system:identity:changed` signal, sent once the identity caches hold the change, and on skill creation, update and deletion; bursts of changes coalesce into one republish, and changes before the boot publish are covered by it.

- [`c7614c9`](https://github.com/rizom-ai/brains/commit/c7614c957ae37e258ada6647b1090d5a6d86bf65) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep recurring-check service shutdown and plugin unregistration behind their cleanup barriers when a scheduler adapter throws synchronously from `stop()`. Cancel and drain admitted checks and catch-up enqueue work before reporting the original failure, and retain declaration-order aggregation of synchronous and asynchronous failures.

## 0.2.0-alpha.499

### Patch Changes

- [#565](https://github.com/rizom-ai/brains/pull/565) [`9943020`](https://github.com/rizom-ai/brains/commit/9943020d6588e0ab7cfb957e91da7e63e77d1c36) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Content synced after startup reaches the site again. The web process schedules rebuilds while the worker runs them, so a rebuild queued once used to block every later one until the next restart; rebuilds now rely on the job queue, which keeps one pending build per environment. A build replaced by a newer one completes instead of failing and being retried against its replacement. A file removal seen while git rewrites a pulled file no longer deletes the entity whose file is back on disk.

## 0.2.0-alpha.498

### Patch Changes

- [#534](https://github.com/rizom-ai/brains/pull/534) [`1d85b73`](https://github.com/rizom-ai/brains/commit/1d85b730ec435789b7701e3746c9ca79c085217f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Validate structured entity bodies on write. `StructuredContentFormatter` now parses and formats through a Zod codec, so `format` rejects data that violates the body schema instead of writing markdown that fails on the next read. Playbook optional text is a codec, so playbook bodies encode back to markdown.

  Datasource-backed list and detail page templates (conversation summaries, decks, links, topics) no longer carry unused formatters that could not round-trip; they resolve from their data source only.

  FAQ and conversation summary bodies are codecs too: writing an invalid FAQ body or summary entry fails at write time. Invalid stored summary entries fail validation rather than silently disappearing during export. Numeric arrays and absent optional collections retain their types and presence across the shared round-trip contract.

## 0.2.0-alpha.497

### Patch Changes

- [#561](https://github.com/rizom-ai/brains/pull/561) [`ecd1746`](https://github.com/rizom-ai/brains/commit/ecd1746054788c189e78db7a6046f20431d66558) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A book section records its full heading path (`headings`, outermost first) in place of `part`, so a book printed in parts shows each part with its own divisions on the title page, and a section names its part and division. A long title or siglum wraps instead of overflowing, the title page opens with "Begin reading", Ask names the part or piece a section belongs to, and every spine on the horizon carries its title, outside the spine when it does not fit inside.

## 0.2.0-alpha.496

### Patch Changes

- [#562](https://github.com/rizom-ai/brains/pull/562) [`2e542ee`](https://github.com/rizom-ai/brains/commit/2e542ee168657d54a134f306d646313415b10f6b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A local database write refused by a briefly held lock no longer leaves its connection inside an uncommitted transaction. Before, the retried write and every later write on that connection looked applied to the brain itself but were never committed, and vanished when the connection reopened — import jobs completed, then ran again against a closed projection batch and failed.

## 0.2.0-alpha.495

### Patch Changes

- [`a3f4b3d`](https://github.com/rizom-ai/brains/commit/a3f4b3de998dd79d4dc58f0c4bc3956960c42892) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the private Git broker transport with bounded Effect RPC over scoped Bun
  socket adapters. Preserve strict operation validation, stable-ID replay,
  broker-owned Git work through observer cancellation, and Promise-based public
  contracts.

- [`205f50c`](https://github.com/rizom-ai/brains/commit/205f50c0a65228c259206b2ac8ebd7d28db807ae) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the obsolete Effect v3 Promise-failure wrapper and use Effect v4's native Promise runner for shell, daemon, and job-runtime ownership. Preserve original failure values, all-siblings-settled startup phases, declaration-order failure selection, and shared cleanup barriers for concurrent shutdown callers.

- [`7d956d4`](https://github.com/rizom-ai/brains/commit/7d956d4310615b3b04d005ff11281e897731efde) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade the private Effect control-plane boundary to exactly 4.0.1, migrate service layers and supervised work to v4 APIs, and retain Promise-based public contracts and AbortSignal cancellation. Centralize optional clock injection and add regressions for failure identity, resource ownership, cleanup barriers, and deterministic timing.

## 0.2.0-alpha.494

### Patch Changes

- [#556](https://github.com/rizom-ai/brains/pull/556) [`81128b8`](https://github.com/rizom-ai/brains/commit/81128b892d6ff553e91a2bc4e69a2aa13a3d3431) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A content repository checked out in place now tracks `origin` as a clone would, and a checkout without an upstream gets one on its next start; the pre-deploy backup resolves `@{upstream}` and refused a checkout that had none.

## 0.2.0-alpha.493

## 0.2.0-alpha.492

### Patch Changes

- [#548](https://github.com/rizom-ai/brains/pull/548) [`5c4b107`](https://github.com/rizom-ai/brains/commit/5c4b107f4448fbbe479f45d0dd4314002bd03614) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new brain whose content repo already has history now checks it out in place: the data directory is a mount point in a deployed brain, and the old clone-then-rename failed there silently, falling back to a local repository merged with the remote as an unrelated history. A Git command whose output passes the retention ceiling now runs to completion instead of being killed, which had failed the startup sync of large repositories. After a failed startup sync no identity or prompt defaults are created, so they can no longer be exported over content the sync never imported.

## 0.2.0-alpha.491

## 0.2.0-alpha.490

### Patch Changes

- [#541](https://github.com/rizom-ai/brains/pull/541) [`d266269`](https://github.com/rizom-ai/brains/commit/d2662699f5e0aa2db12ccc92b250c2b6ca9bfa59) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain's startup sync no longer imports its content repo before the web process reports ready. It pulls and queues every file as import jobs for the worker, so boot time no longer depends on content size and an interrupted import resumes from the job queue. Identity, profile and prompt defaults, onboarding playbooks and the starter identity are created once that import completes or fails, never before the repo's own versions; the worker creates no defaults and follows the identity its imports bring. Chat stays behind the knowledge-base readiness gate until the startup import is in and indexed.

## 0.2.0-alpha.489

## 0.2.0-alpha.488

### Patch Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the `book` entity plugin (catalog member `book`): published books as read-only entries whose id path is the book's structure, each cited by its section and source, with book index and reading-page templates. Books feed topic extraction as canonical sources. Generated site routes now cover every entity of a type, not only the first 1,000.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask page links a cited section of a book with parts to the section itself, not to its part: the order is read from the entry's own id segment.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Book brains can be asked about their work. The books site has an Ask page: the guest box under the site's name, a rail listing the passages an answer cites by siglum, book and year, each linked to its page, and a note when asking is not open. A section's reading page offers "Ask about AC-2", which starts the question with the siglum. Answers cite book sections only; a book's title entry, its contents, is never a source, and a cited entry is titled by its page title, so a section reads as its siglum. The book plugin tells the agent to search the books first, cite by siglum and book, quote the text verbatim and say when the books do not address a question. Core configures the entity links its answer sources read, so a site-builder bundled apart from core no longer leaves every source uncitable.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Book brains open on the work as one horizon: each book a spine at its year, as tall as its text, published works above the line and posthumous writings below, busy years widening so nothing overlaps; small screens get a year list. A book's title entry records whether it was published in the author's lifetime, its length, its section count and a short spine title. The books site's navigation wraps on narrow screens.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the reading site for book brains: `@rizom/site-books` (the bar with the brain's name and navigation, routes, arrow-key paging) and `@rizom/theme-books` (paper and ink with a red pencil, Didone display, a reading serif and typewriter sigla, dark mode). Book sections render as a reading page with their siglum and place in the book, spaced emphasis as letter-spacing, and their source; generated detail pages take their title from the entry.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A book's title page shows the score of its sections: one stroke per section, as tall as its text and linked to it, grouped by the book's parts with each part opening at its first section, beside the book's details and section count. Book sections can record the part they belong to.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A site can render an entity type's pages with a template of its choosing through `entityDisplay.<type>.detailTemplate`. The books site renders topics as theme pages: the theme's summary, a strand showing how many sections of each book stand close to it by year, and its closest passages, all found by stored embeddings without API calls. A section split across several entries counts once. Plugins share one related-entries lookup over stored embeddings, `findRelatedEntities`. Detail pages fall back to the title in an entry's frontmatter before naming it by type and slug. Book pages count one book or section in the singular.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A book section's reading page names its themes in the margin: the topics nearest it by their stored embeddings, at most three, linked to their topic pages. It costs no API calls, and a brain without embeddings shows none.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A `brain` CLI that carries the bundled definition boots it, inside the monorepo too: `start`, `tool` and the command listing no longer hand off to the source runner when the bundled runtime is present, so a running brain is always the one module graph a deployment runs, with the same supervised web and worker processes. The test-app posture scripts (`start:minimal|personal|publishing|team|unified-inbox`) build once and run the bundled CLI from the app's own directory, so its `.env` loads as a deployed brain's does.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Entity URLs and citability come from one entity display, the one the shell resolves from the site, instead of a process-wide singleton the site builder configured and core read. `EntityUrlGenerator` is a plain value built from that map: core builds one for answer sources and AI content, the site builder and AT Protocol build theirs from the plugin context. The site builder no longer takes `entityDisplay` in its own config. A brain run from the monorepo, where the site builder loads from a separate bundle, now cites the same sources as a deployed one.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Entity services gain `nearestToEntity`: visible entities of given types nearest an entity's stored embedding, closest first, within a distance and a limit, in one store query. Related-entry lookups (a book section's margin themes, a theme's passages) use it instead of projecting the whole semantic space for every page, which built a pairwise matrix per page and made a book brain's site build quadratic: Nietzsche's 3,738 sections now build in about a minute instead of overrunning the build deadline. A semantic projection whose origin is of another type reads that origin alone.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Slugs transliterate letters instead of dropping them: German umlauts and ß as German writes them without (Übermensch → uebermensch, Größe → groesse), other accents bare (décadence → decadence). Ids already stored keep their old form; an id derived again from a title with such letters takes the new form.

## 0.2.0-alpha.487

## 0.2.0-alpha.486

### Patch Changes

- [#516](https://github.com/rizom-ai/brains/pull/516) [`284bc37`](https://github.com/rizom-ai/brains/commit/284bc3738665e4e452fabb6af41d161292cd8a76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Onboarding emails are shorter and personal. The anchor setup email greets a person anchor by name, and invitations say what the brain is for. Instead of listing MCP connection steps, both point to Studio → Account → AI tools. Chat, Studio and AI tools links come from the interactions the brain registers, and a sentence is left out when its page is not served. The chat, Studio and Account AI tools ids and link builder are shared contracts.

- [#514](https://github.com/rizom-ai/brains/pull/514) [`f513b77`](https://github.com/rizom-ai/brains/commit/f513b779dfcbba13ff48bec3f0ba373855f030e3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Studio's Account workspace gains an AI tools tab when the brain serves MCP over HTTP and the person's role can use it. It shows the brain's MCP address and how to connect Claude and ChatGPT, with Claude Code, Cursor, VS Code and any other OAuth MCP client in a collapsed developer section. Commands and configuration snippets name the server after the brain's host and copy exactly as shown. `?section=ai-tools` opens the tab directly.

## 0.2.0-alpha.485

### Minor Changes

- [#508](https://github.com/rizom-ai/brains/pull/508) [`ed1b85b`](https://github.com/rizom-ai/brains/commit/ed1b85b34e73683d864bc764eddd7a0b7f26ab74) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Breaking: `auth-service.setupEmail` now takes only the recipient address. The `{ to, subject, body }` form and its `{{setupUrl}}`, `{{expiresAt}}` and `{{origin}}` placeholders are removed; a brain.yaml that still uses them fails config validation. Regenerate pilot brain.yaml files with `brains-ops reconcile` before pinning this release.

  The anchor setup email and the invitation now share one onboarding body after their own opening: a first save-and-ask in chat, Studio, and how to connect AI tools over MCP (the brain's `/mcp` address, the Claude Code command, Claude Desktop custom connectors, OAuth sign-in with the passkey). Both have text and HTML parts. brains-ops no longer writes Rover-specific setup email copy.

### Patch Changes

- [#507](https://github.com/rizom-ai/brains/pull/507) [`46c7739`](https://github.com/rizom-ai/brains/commit/46c773981cdd998539a0ef65b71339b5978ac136) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render invitation emails with a text and an HTML part that name the inviter, the brain (from the anchor profile, falling back to the host) and the invited role, print the expiry as a readable UTC date, and explain passkeys and the next steps. Invitations are now sent with secret sensitivity.

## 0.2.0-alpha.484

### Patch Changes

- [`fdca4f8`](https://github.com/rizom-ai/brains/commit/fdca4f8d5e98f222fed1743ab55a74b6acc52169) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Drain complete auth HTTP handlers and facade operations before runtime shutdown. Keep independent requests concurrent, allow admitted handlers to finish nested auth calls, and defer later callers until cleanup settles. Track nested operations independently, give admitted background callbacks the same owner while skipping new scheduled ticks during shutdown, reject self-close instead of deadlocking, and prevent detached continuations from reusing completed request scopes.

## 0.2.0-alpha.483

### Patch Changes

- [#504](https://github.com/rizom-ai/brains/pull/504) [`ec15b37`](https://github.com/rizom-ai/brains/commit/ec15b37f5004d2fbdae5ab907277cb300ce858b4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask room: the atlas kit now carries one runtime and one set of styles for a page that presents the Ask box beside a drawing of what an answer may cite, shared by the atlas sites and rizom.ai. The room matches an answer's sources to the drawing's marks, draws the leads between the listed sources and their marks, lends the drawing to a phone's open conversation and brings a cited source into view from its mark; the atlas keeps only what is the map's own, its turn towards the cited pieces and its names.

## 0.2.0-alpha.482

## 0.2.0-alpha.481

### Patch Changes

- [#499](https://github.com/rizom-ai/brains/pull/499) [`45aa372`](https://github.com/rizom-ai/brains/commit/45aa3720eafc0829adbb33ccbbcf7a7f1eaee0da) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A guest Ask box that mounts with nothing to show above its composer no longer takes more room than the composer its host showed before it: the empty welcome area loses its padding and fade, and the composer keeps no gap or divider above it, until a welcome, an answer or a notice arrives. On rizom.ai the composer used to drop a row the moment it was focused.

## 0.2.0-alpha.480

## 0.2.0-alpha.479

### Patch Changes

- [#495](https://github.com/rizom-ai/brains/pull/495) [`c5d4d2f`](https://github.com/rizom-ai/brains/commit/c5d4d2fd949357353b4e4f42186a0d105fe5c6a1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `brain start` boots in the instance directory even when launched from elsewhere with `INIT_CWD`, as the dev start scripts do. The supervising process ran migrations against `./data` relative to where it was launched while its web and worker processes opened the instance's own `data/`, so a fresh instance failed to start (`Unable to open connection to local database ./data/runtime-state.db`) and an existing one ran on unmigrated stores.

## 0.2.0-alpha.478

### Patch Changes

- [#493](https://github.com/rizom-ai/brains/pull/493) [`760a0bb`](https://github.com/rizom-ai/brains/commit/760a0bb09722929829ebb8db17fd30fc19026a23) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An answer's source can name the brain whose published memory it came from. The citation and the Ask box's `ask:sources` event carry it, and the box's source rows show the brain and who answered — "Rizom, with Becca and Jo" — so a host page can show whose memory answered.

- [#493](https://github.com/rizom-ai/brains/pull/493) [`934ebe5`](https://github.com/rizom-ai/brains/commit/934ebe5cc8707c8a0c2569c57dcc560aea198776) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A question asked before is answered before the model. A FAQ captured from a visitor's reply keeps the sources the answer drew on; a visitor's question is first put to the published FAQs over a new shell channel, and a hit answers the turn from the FAQ, with its kept sources, counting one more asking and calling no model. The box says "Asked before" above such an answer, in the live reply and in history, while still naming the brains whose memory it drew on. The FAQ datasource carries each FAQ's sources for pages to show.

- [#493](https://github.com/rizom-ai/brains/pull/493) [`afeef92`](https://github.com/rizom-ai/brains/commit/afeef92134464dd8af977005564674bc359ea1cb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The network index learns a connected brain's ATProto repository from its home when the directory holds none: an approved agent without a repository DID is asked at its well-known address once per sync, the DID is kept on the agent, and its published pieces are indexed from then on. Every connected brain with a repository is indexed, each piece keyed and cited to its own.

- [#493](https://github.com/rizom-ai/brains/pull/493) [`eecbdea`](https://github.com/rizom-ai/brains/commit/eecbdea7dc0467b0df76f0c9ecb2a6e4265c284e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain keeps the connected brains' published pieces as `network-piece` entities: for every approved agent with an ATProto repository, each projected collection is read on the directory's daily cadence and kept keyed by brain and record — created, left alone when unchanged, deleted when withdrawn, kept when the repository cannot be reached. The pieces are public, searchable and citable to their brain, never this brain's site pages and never re-published. A visitor's answer cites such a piece at its origin, naming the brain.

- [#493](https://github.com/rizom-ai/brains/pull/493) [`4d887da`](https://github.com/rizom-ai/brains/commit/4d887da17558420fbe2580f0cdd918215b2e6245) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Every projected ATProto record names its page: the atproto plugin hands each projection the entity's page on this brain's site, when the site gives the type one, and the projection writes it as `canonicalUrl` (an essay first published elsewhere keeps that address). The deck, project, note, link, series, topic and social-post lexicons declare the optional field. A brain that keeps another's records can now send a reader to the piece itself.

## 0.2.0-alpha.477

### Patch Changes

- [#472](https://github.com/rizom-ai/brains/pull/472) [`99f6c6b`](https://github.com/rizom-ai/brains/commit/99f6c6b28bef79a39b083142d4c7717f3452fdf9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The pre-deploy backup verifies embedding databases whether or not they still carry the retired libSQL vector index. Before, it read the index's shadow table unconditionally and failed once the index was dropped. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.

## 0.2.0-alpha.476

### Patch Changes

- [#490](https://github.com/rizom-ai/brains/pull/490) [`d3d8e82`](https://github.com/rizom-ai/brains/commit/d3d8e8299d7262666a2e0f4f4ac90d730f32100f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On a touch screen, the first tap on the atlas legend's "Latest" opens the latest piece's card instead of following its link.

## 0.2.0-alpha.475

### Patch Changes

- [#487](https://github.com/rizom-ai/brains/pull/487) [`d823d75`](https://github.com/rizom-ai/brains/commit/d823d7572fb84bd745772062bebf59ce50de4479) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The atlas homepage rings the most recently published piece and names it "Latest" in the legend, which opens its card; marks keep clear of the legend along the map's foot.

## 0.2.0-alpha.474

### Patch Changes

- [#483](https://github.com/rizom-ai/brains/pull/483) [`673f737`](https://github.com/rizom-ai/brains/commit/673f73756990cdd82b5e4bc48b242c2ccce07681) Thanks [@yeehaa123](https://github.com/yeehaa123)! - FAQ answers on the atlas homepage are set in the FAQ band's own type, one size below the question, instead of blog-post prose sizes that made paragraphs larger than the question on phones.

- [#483](https://github.com/rizom-ai/brains/pull/483) [`0f327b4`](https://github.com/rizom-ai/brains/commit/0f327b42a64aac7ce1a9d0bea61431b87b3005f9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An owner can rank FAQs: an optional `rank` in a FAQ's frontmatter puts it first on a site, in rank order; unranked FAQs follow, most asked first and newest first on a tie. Entity listings can sort NULLs last with `nullsLast`.

## 0.2.0-alpha.473

### Patch Changes

- [#481](https://github.com/rizom-ai/brains/pull/481) [`7a44bf1`](https://github.com/rizom-ai/brains/commit/7a44bf14a42322dcc5e6f3f69e40aa6b67524535) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make new FAQ captures restart-safe with native mutation receipts committed atomically alongside their FAQ writes. Preserve existing ambiguous claims without automatically replaying them, and prevent repeated attempts from incrementing asked counts or recreating deleted FAQs. Classification may still repeat; no public authoring capability is added.

## 0.2.0-alpha.472

### Patch Changes

- [#475](https://github.com/rizom-ai/brains/pull/475) [`3e113f0`](https://github.com/rizom-ai/brains/commit/3e113f003bdb075d12d20f13c8d3d8c526561146) Thanks [@yeehaa123](https://github.com/yeehaa123)! - FAQs that need the owner now come to the Inbox instead of a separate FAQ review workspace. A captured question appears as a new item with its drafted answer, to **Publish** or **Decline**; a published FAQ that a repeated question answered differently appears with its current answer and each alternative, to **Use alternative N** or **Keep current answer**. The FAQ review workspace is removed.

## 0.2.0-alpha.471

### Patch Changes

- [#474](https://github.com/rizom-ai/brains/pull/474) [`a54ab05`](https://github.com/rizom-ai/brains/commit/a54ab05f3e5f789cbe5f2803b6453c848ee70540) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Published FAQs under the atlas homepage start closed: a "+" marks each question, tapping one opens its answer beneath it, one at a time, the same on every screen; the side-by-side reader is gone. Visitor questions are now screened against what the brain's public work is about: the titles of its public topics, which the topics plugin answers on a new `topics:public-titles` channel, and the owner's `ask-content` introduction. The page's starter questions no longer double as the site's scope, so a site can drop them.

## 0.2.0-alpha.470

### Patch Changes

- [#466](https://github.com/rizom-ai/brains/pull/466) [`2e17b92`](https://github.com/rizom-ai/brains/commit/2e17b929f9df55d02ac34cafbdf028c771f4a6af) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep FAQ merge retries within the initially selected visibility and question. Concurrent changes to either stop the merge without rewriting the edited FAQ; same-question, same-visibility merges still retry with storage CAS.

  Fold duplicate FAQs through a native-only atomic destination update and source removal, checking both full revisions and committing FTS and projection/export journals together. Failed writes preserve both records; retries after a committed fold do not restore the source or count its askings twice. This does not add a public authoring SDK capability.

## 0.2.0-alpha.469

### Patch Changes

- [`6cd10dc`](https://github.com/rizom-ai/brains/commit/6cd10dca14b6cdcbac184045359aaa0ea0258a00) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serve owner-switched guest chat on the site itself as well as its preview. One Studio switch, monthly budget and set of limits cover both hosts; each host accepts guest requests only from its own pages, and the Ask box is served on both while guest chat is switched on. An authorization stored under the former preview-only origin authorizes nothing: switch guest chat on again in Studio after upgrading.

- [#469](https://github.com/rizom-ai/brains/pull/469) [`674a5af`](https://github.com/rizom-ai/brains/commit/674a5afa237babe39adb02093168ec75792e15f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The RSS feed now links each post to where the site actually publishes it, so a site that calls its posts "Essays" links to `/essays/<slug>` instead of a missing `/posts/<slug>` page.

## 0.2.0-alpha.468

### Patch Changes

- [#468](https://github.com/rizom-ai/brains/pull/468) [`b9fe336`](https://github.com/rizom-ai/brains/commit/b9fe33614a0e9a05f978899337d24c3b581bea05) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On a wide screen, the open FAQ answer under the atlas starts level with the first question, whether or not the owner wrote a heading over them.

## 0.2.0-alpha.467

### Patch Changes

- [#464](https://github.com/rizom-ai/brains/pull/464) [`8af0ca0`](https://github.com/rizom-ai/brains/commit/8af0ca0e94ac335c9aeb88c1d58c5f305ae6c456) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional site's atlas homepage shows the owner's published FAQs in a band under the atlas: the six most asked, under the owner's optional `faqHeading` from `ask-content` (unwritten, there is no heading). One answer is open at a time and every answer reads without a script; on a wide screen the atlas script shows the open answer beside the questions. Nothing renders until a FAQ is published; a preview build shows drafts too, like any draft content. `@brains/faq` exports `loadPublicFaqs` for sites that show FAQs beside their other content.

## 0.2.0-alpha.466

### Patch Changes

- [#463](https://github.com/rizom-ai/brains/pull/463) [`fa9c090`](https://github.com/rizom-ai/brains/commit/fa9c090c26e3534b5be0592e657c41974abb80f3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The site builder's route registry hears the pages plugins declare in the worker process too. The site builds in the worker, which takes no ordinary message subscriptions, so pages registered through the site builder's channel — the contact form's — were missing from every built site while the serving process listed them.

## 0.2.0-alpha.465

### Patch Changes

- [#462](https://github.com/rizom-ai/brains/pull/462) [`aa4fd04`](https://github.com/rizom-ai/brains/commit/aa4fd046bc0b4103168ac49f5d3ea0927c29172c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - FAQ capture now includes site visitors' questions. A reply to a visitor becomes a public draft FAQ for the owner to review, merges with the same question asked before, and counts toward how often it was asked; a visitor's own messages and refusals create nothing. The conversation service tells plugins about visitor messages on a new `conversation:guestMessageAdded` event that carries only where the message is, never its text, so no other plugin hears visitor conversations. The capture rewrite leaves out who asked and does not follow instructions inside the exchange.

## 0.2.0-alpha.464

### Patch Changes

- [#460](https://github.com/rizom-ai/brains/pull/460) [`033af2d`](https://github.com/rizom-ai/brains/commit/033af2d1305aed4677ec7bb781e6b183ec957c0e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form's default limits fit a proxied deployment: every visitor arrives from the proxy's network, so the network limits now equal the global ones and requests and forms take their bound's maximum. Before, a hundred page views an hour from behind the CDN refused every visitor for the rest of the hour.

- [#461](https://github.com/rizom-ai/brains/pull/461) [`3e69c19`](https://github.com/rizom-ai/brains/commit/3e69c196335b7897a12425f4157bebcef536e6b5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact plugin declares the site's `/contact` and `/contact/thanks` pages while it registers, with `site-builder` as a dependency so the builder is listening. A deployment builds its site in a worker process that registers plugins but never runs their ready phase, so pages declared at readiness never reached it and the built site had no contact page.

## 0.2.0-alpha.463

### Patch Changes

- [#459](https://github.com/rizom-ai/brains/pull/459) [`7543016`](https://github.com/rizom-ai/brains/commit/75430166391b8b1bf8d6d7bc0650e57ac2f821b0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Contact alerts and other background jobs can send email again. The queue worker runs no interfaces, so it had no Email sender and every alert failed as `transport-missing`. Message interfaces now register their channels and senders in a `registerChannels()` step that the worker also runs, without the interface's daemons, routes or subscriptions. Declarative message interfaces' `setup` runs there too, so `deliver` has its state; `setup` must build clients without connecting or listening.

## 0.2.0-alpha.462

### Patch Changes

- [#458](https://github.com/rizom-ai/brains/pull/458) [`f5e4f68`](https://github.com/rizom-ai/brains/commit/f5e4f685db85e0c4d57fdbf836b3f0be04c40ce1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact plugin declares the site's `/contact` and `/contact/thanks` pages in every process. A deployment builds its site in a separate worker, which was never told about them, so the built site had no contact page and the form fell back to its own page.

- [#434](https://github.com/rizom-ai/brains/pull/434) [`516d79c`](https://github.com/rizom-ai/brains/commit/516d79c8bd355dcf683bc94c6757c70e2439930f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the FAQ plugin to the chat bundle: reusable question-and-answer pairs from chats are captured as draft `faq` entities at the visibility of the turn that answered them, and a repeated question counts against the existing FAQ of the same visibility. Published public FAQs are available to sites as the `faq-section` template, which each site places itself. Differing answers from repeated questions are kept as alternatives, which the owner settles in the new FAQ review workspace in Studio. FAQs are left out of the agent's broad searches (new `includeInBroadSearch` entity type option), so answers never cite unreviewed FAQ drafts as sources. Guest conversations are never captured. Capture can be switched off with `plugins.faq.enabled: false`, same-question matches are shortlisted by a configurable distance (`sameQuestionDistance`) and confirmed by a short AI check so opposite questions never merge, and duplicate FAQs captured moments apart are folded together once they are embedded. `deleteEntity` takes an `expectedContentHash` option: it deletes only while the stored entity still has that hash and returns false otherwise. `searchWithDistances` takes optional `types` and `maxDistance` filters, applied in the query, so a lookup for one close match no longer returns every embedded entity.

- [#445](https://github.com/rizom-ai/brains/pull/445) [`762f3f9`](https://github.com/rizom-ai/brains/commit/762f3f973847ee64fa3d1f3511a5e124e220abaa) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `system_search` no longer returns a bare empty list when matches exist below `minScore`. It adds a `belowThreshold` block with the number of weaker matches the caller may see, the best score and a hint to search again with a lower `minScore`. Broad questions such as "What do you mostly write about?" match content weakly and used to fall under the default threshold, which led the agent to answer that no saved writing existed.

- [#457](https://github.com/rizom-ai/brains/pull/457) [`b34d7d2`](https://github.com/rizom-ai/brains/commit/b34d7d294b40110a7bff7c87d218024ccb2b41ee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Topic extraction and topic reconciliation ask the embedding index only for topics when they look for a topic to merge with, and reconciliation only for topics within its merge distance. Before, each lookup returned the distance to every embedded entity in the brain.

- [#446](https://github.com/rizom-ai/brains/pull/446) [`83fbb6a`](https://github.com/rizom-ai/brains/commit/83fbb6a1254d60573161aef9bebe927c0d9d922f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The `topic-distribution` insight no longer returns a bare empty list when no topics exist yet but there is content to extract them from. It adds `unextracted` with the number of visible source entities and a hint to answer from `system_search`. Topics are extracted in the background, so right after content arrives the empty list read as "nothing written", and the agent told the owner there was not enough content.

- [#434](https://github.com/rizom-ai/brains/pull/434) [`516d79c`](https://github.com/rizom-ai/brains/commit/516d79c8bd355dcf683bc94c6757c70e2439930f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Wishlist deduplication now recognises a reworded wish by embedding distance and counts it against the existing wish. Previously only a wish whose title slug repeated exactly was merged. Reworded wishes within the configurable `sameWishDistance` (default 0.3) are shortlisted and confirmed by a short AI check, so opposite requests such as "send emails" and "stop sending emails" stay separate.

## 0.2.0-alpha.461

### Patch Changes

- [`b4896a7`](https://github.com/rizom-ai/brains/commit/b4896a7c237d5b60ba702274d249eb695176d36c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serialize auth initialization, lazy startup, invitation recovery startup, and shutdown in admission order. Settle both signing-key loads before rollback, release partially acquired resources on failure, continue cleanup after supervisor errors, and recreate database-bound account settings after restart.

- [`059f85e`](https://github.com/rizom-ai/brains/commit/059f85e35bfd32a76caad601d87f45dc74e82403) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Validate and propagate causal provenance for collected messages through the same operation scope as sent messages, including nested dispatch and caller-context restoration.

- [`23f916d`](https://github.com/rizom-ai/brains/commit/23f916d1dcb42d4d4511a6167ebfbd41eabc37d2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Wait for every recurring-check cleanup task before reporting service-stop or plugin-unregistration failures. Preserve a single cleanup error and aggregate multiple failures instead of letting the first failed schedule bypass sibling drains.

- [`815edf3`](https://github.com/rizom-ai/brains/commit/815edf384e2acec98043b510c5b93568e2991cfe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Drain admitted recurring-check callbacks and alert deliveries after Effect interruption, before plugin or service teardown completes. Do not record cancelled checks as successful after their final alert delivery.

- [`d41d6c5`](https://github.com/rizom-ai/brains/commit/d41d6c5c9059eaea5097e022479c3bac339b6d8f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish first-Anchor setup tokens only after persistence succeeds. Serialize token lookup, rotation, consumption, and clearing so concurrent requests cannot expose unpersisted tokens or let pending creation undo setup-state clearing.

- [`a294aa5`](https://github.com/rizom-ai/brains/commit/a294aa5756acd7a44d55971e30c62becf15708e0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden shell registration, acknowledgement barriers, and resource teardown:

  - Reject duplicate MCP capabilities without overwriting their owners, and propagate registration failures for plugin rollback.
  - Retain failed message collection acknowledgements so successful subscribers cannot hide a failed projection-wave completion effect.
  - Reject scoped plugin acquisition before registry mutation and keep attachment release handles bound to their own registrations.
  - Drain admitted durable progress polling before runtime teardown; progress monitor stop is now terminal and Promise-based.
  - Clear runtime-state prefixes atomically without parsing stale values, preserving literal wildcard, Unicode, and embedded-NUL matching.
  - Separate operator runtime contracts, schemas, action normalization, block normalization, and diagnostics into private responsibility-owned modules without changing rendered output.

## 0.2.0-alpha.460

### Patch Changes

- [#452](https://github.com/rizom-ai/brains/pull/452) [`7a51f32`](https://github.com/rizom-ai/brains/commit/7a51f32b9264e81a9083e4b62cb9aba05e19ca34) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form runs on its own policy the moment a brain adds the `contact` plugin: its origin is the brain's site URL (the local one in a development run), the deployment's preview host is served beside it, and the alert's Inbox link is derived from Studio's mounted workspaces route. Configuration is only for a value the owner wants different — a longer retention, tighter limits — and each override is held to the policy's bounds. Behind a TLS-terminating proxy, which is how an HTTPS origin is served, the proxy's protocol is believed.

## 0.2.0-alpha.459

### Patch Changes

- [#453](https://github.com/rizom-ai/brains/pull/453) [`e1bd16e`](https://github.com/rizom-ai/brains/commit/e1bd16ecaa0be303c5b3392b6eb03377402e35d5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A visitor's question is screened before the guest model answers it. One call on the guest model classifies the question, from the question, the visitor's two before it and the site's public topics, as in scope, off topic, abusive, an injection attempt or harmful. A question outside scope gets the site's refusal line, or a neutral one, without running the answer or finding sources for it; its cost is the screening call alone. A screening call that fails lets the answer through and marks the turn unscreened. The turn's response carries the outcome, and the screening call's usage counts toward the turn's settlement.

- [#453](https://github.com/rizom-ai/brains/pull/453) [`8c92284`](https://github.com/rizom-ai/brains/commit/8c92284d48f22a3a9c7e490f17958a21684f0f55) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The guest usage record keeps a screened-out question as `refused`, with its category, and marks an answer given because screening failed as `unscreened`. The Studio guest chat monitor counts screened-out questions today and this month, by category, shows the category on recent questions, and counts unscreened answers. Its today and this month now follow the record's clock rather than the host's.

- [#453](https://github.com/rizom-ai/brains/pull/453) [`8fcfa2f`](https://github.com/rizom-ai/brains/commit/8fcfa2f51da01d03cf3bb8fe3457e7e9a2ec0459) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Web Chat screens each guest question against the site's `ask-content` topics, and `ask-content` gains an optional `refusal` line: what a visitor reads when their question is off topic, abusive, an injection attempt or harmful. Without it, the visitor reads a neutral line. The team recipe's `ask-content` no longer carries the removed `attribution` field.

## 0.2.0-alpha.458

### Patch Changes

- [#448](https://github.com/rizom-ai/brains/pull/448) [`f7bbbe2`](https://github.com/rizom-ai/brains/commit/f7bbbe23090da7e9851a03ac3cd36df17653b036) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A visitor's answer is charged for its embeddings: the searches its tools ran and the search that found its sources. The embedding provider reports each call to a usage meter, each guest turn is measured, and its settlement counts the tokens and prices them at text-embedding-3-small's published rate ($0.02 per 1M tokens). An embedding model without pricing leaves the turn's cost unknown, so it is charged at the turn's maximum. Before, every guest answer recorded 0 embedding tokens.

## 0.2.0-alpha.457

### Patch Changes

- [#444](https://github.com/rizom-ai/brains/pull/444) [`166d77e`](https://github.com/rizom-ai/brains/commit/166d77ea46aa8e601fa2974712307708f23a2aba) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Closing the keyboard in the phone Ask sheet fills the screen again, with the composer at the bottom where a tap brings the keyboard back. The sheet follows the visible area only while its composer has focus: Safari blurs the field while it still reports the keyboard's height, and may report nothing once the keyboard has gone, which left the sheet at half height.

## 0.2.0-alpha.456

### Patch Changes

- [#443](https://github.com/rizom-ai/brains/pull/443) [`cf06121`](https://github.com/rizom-ai/brains/commit/cf061218d627c52e00a9e4ce7c0698922ee5c08c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - While the phone Ask sheet covers the page, no blur on the page behind it paints. Safari kept drawing a hidden frosted header's blur, so a text-less bar sometimes showed at the top of the open sheet. The cover now switches blur off everywhere but the sheet, and restores it when the sheet closes. The Ask box contract gains `ASK_COVER_ATTRIBUTE` and `ASK_COVER_STYLE`.

## 0.2.0-alpha.455

### Patch Changes

- [#441](https://github.com/rizom-ai/brains/pull/441) [`b683034`](https://github.com/rizom-ai/brains/commit/b68303447e2a9117ee50f9e6bf76df66ea102a44) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An agent file that leaves out its About, Skills or Notes section keeps the sections it has, so a hand-written agent no longer loses its skill tags, its place in a named constellation, or its capabilities in SWOT assessments. Agent bodies are now read and written by one shared format in `@brains/plugins`.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`9d172de`](https://github.com/rizom-ai/brains/commit/9d172de3fe1f5336bfe34f23c94859c1556b70f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Agents saved before agent kinds were renamed on 22 July 2026 read again instead of being quarantined: a `professional` agent reads as a `person` and a `collective` as an `organization`, both when a file is imported and when a stored agent is parsed. A kind that was never valid is still refused.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`3bd0a1c`](https://github.com/rizom-ai/brains/commit/3bd0a1cc9deab7582349128b3e808a8841ce901c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask box host takes an optional prompt for its field, so a page can show its own words (such as the shared Ask note's title) before the visitor types.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`d468310`](https://github.com/rizom-ai/brains/commit/d46831011f1aa959e434213b55cdeb0e01083044) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The homepage's authored Ask copy can be read on its own (`loadAskContent`) by a page that docks the box itself and needs no contact door, the Ask box host is a shared piece a site can place, and the proximity map's authored copy fields are exported as their own schema.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`3830822`](https://github.com/rizom-ai/brains/commit/3830822088cc236df8518c2032f1cf4485a082b2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form states only the retention period its owner configured. It no longer tells visitors that deletion can run late or that backups may keep copies, claims no owner had set, and drops the expired-form note; an expired form still says so when it is sent.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`9dca756`](https://github.com/rizom-ai/brains/commit/9dca7567927842c78d24f14e916ba38d0f362b08) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form now appears inside the site's own page. The contact plugin gives the site `/contact` and `/contact/thanks` pages that the site builds with its own layout, fonts, bar and footer around an empty slot; on each request the plugin fills the slot with the form and its one-time token, so the form still works without JavaScript. A route handler can return a `SitePageResponse` with a slot for this, and the webserver fills the slot for any method or status, falling back to the handler's own page where the site has no such page. Every brain site gets a contact page in its own look, the professional and organization sites included.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`51a03d6`](https://github.com/rizom-ai/brains/commit/51a03d64a6cd0e69a5316e4932b871f34b9839c4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form serves the local preview host beside a local origin (`http://preview.localhost:8080` beside `http://localhost:8080`), as the webserver already serves the preview site there, and treats `*.localhost` names as loopback. A preview-built page's link to the form no longer lands on "Contact unavailable" when a brain runs locally.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`e1edce0`](https://github.com/rizom-ai/brains/commit/e1edce0f707f656530717ab5cc65f2305d34988e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A built site's pages link only the icons the build has: `/favicon.svg` and `/favicon.png` each appear in the head only when the site package or the app's public folder provides them, with the SVG listed last so browsers that take the last icon use it. Sites without an icon no longer send every visitor's browser to two missing files.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`8e30c3f`](https://github.com/rizom-ai/brains/commit/8e30c3f88b40edb83d647665a0574ccf2510c282) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An anchor profile whose content is invalid, such as one carrying a key the profile schema no longer accepts, is now quarantined by directory sync as `anchor-profile.md.invalid` with its content intact. Before, the failure was treated as retryable, so on a brain's first start the default "Unknown" profile was written over the author's file, and with git sync pushed back to the content repository. A persist validator can now report that content is invalid in itself with a schema-phase validation error, which is kept rather than treated as a live policy refusal.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`31e0bf6`](https://github.com/rizom-ai/brains/commit/31e0bf692f3e22157bc07d070af2cb1bfdaa3df7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Team brains get their own site. The new organization site opens on a radar of the people, teams and organizations the team works with, drawn in the professional site's look: the team at the centre of a quiet scope, each agent placed by how close its work runs to the team's and named beside its mark, related agents gathered into named constellations, and a pulse radiating from the centre that lights each agent as it arrives. Beside it sits the team's authored opening, or its anchor profile's words when nothing is authored, with the topics, the contact door and the Ask box when the brain serves them. An about page presents the team's purpose, focus areas, capabilities and working principles, or an organization's mission, offerings and values. New team brains scaffold the site; existing brains keep the site they set in `brain.yaml`, and any team or organization brain can select `@brains/site-organization` there.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`3d8d163`](https://github.com/rizom-ai/brains/commit/3d8d163d17d9b4d9b142040a788ac78c9ef6c388) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional site's atlas homepage, its authored opening and Ask box checks, and its site layout now come from a shared atlas package, so other sites can build on them. Nothing a visitor sees changes.

- [#441](https://github.com/rizom-ai/brains/pull/441) [`b28cf5a`](https://github.com/rizom-ai/brains/commit/b28cf5a8b5f649c170f69024988db7bcd8a4cc4d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render the site once after every start, so an upgrade's template, component and style changes reach the published site even when no content changed; unchanged builds are still skipped while the app runs. The per-template `renderVersion` option is removed.

## 0.2.0-alpha.454

### Patch Changes

- [#440](https://github.com/rizom-ai/brains/pull/440) [`467f476`](https://github.com/rizom-ai/brains/commit/467f476a1c089ae0f46b8e65938f87675f489c37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask box says nothing under its composer: the note and "About this chat" are gone, and only an over-limit warning appears there, while the draft is too long.

- [#440](https://github.com/rizom-ai/brains/pull/440) [`170627a`](https://github.com/rizom-ai/brains/commit/170627a74751e592f1818776a8209aa2ef2b21f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The site-builder takes a site's entity display settings through the site contract's own schema instead of a copy that dropped what it did not list. A site's `citable` choices now reach the answers: on the professional site a visitor's sources are its essays, presentations and projects, not topics or social posts. An unknown entity display key now fails at startup instead of being dropped.

## 0.2.0-alpha.453

### Patch Changes

- [#439](https://github.com/rizom-ai/brains/pull/439) [`3d40351`](https://github.com/rizom-ai/brains/commit/3d40351fa5b05ab04d1e7a196a3287a4fda5bf57) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Honor explicit citable:false exclusions even when no entity type opts into citations. Keep published-only list and count views bounded when callers supply lifecycle-status filters or publishedOnly:false: intersect those filters with the publication gate instead of exposing drafts. Preserve unbounded preview behavior and custom per-type published statuses.

## 0.2.0-alpha.452

### Patch Changes

- [#438](https://github.com/rizom-ai/brains/pull/438) [`8df97bf`](https://github.com/rizom-ai/brains/commit/8df97bf413df6bc4d5d0d20e06366b2720a591c6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A visitor's answer lists only the pieces of work a site marks `citable` in its entity display: on the professional site, essays, presentations and projects — the pieces that light up on the homepage atlas. Topics, series, links and social posts no longer appear as sources next to the essays they point at. A site that marks no type keeps citing any type it has pages for. A site override that relabels a type now keeps the base site's other display settings for it instead of replacing the whole entry.

- [#438](https://github.com/rizom-ai/brains/pull/438) [`8d401d0`](https://github.com/rizom-ai/brains/commit/8d401d0d1388223963de9765303a964dcd298bb8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask box reads as one conversation. There are no "You" and owner labels over each turn (screen readers still hear who speaks), one rule parts the turns, and an answer's lists and headings keep the text's rhythm and size. Sources are a list of rows instead of pills. The note under the composer is the same in every state, "Answers use published work only. Leave private details out.", with "About this chat" beside it in place of the About link above the conversation. The waiting line names the work, not the person. "↓ Rest of the answer" takes the note's line while there is more to read, instead of a round button over the text, and text fades out toward the composer instead of being cut. The send button is quiet until there is something to send. On a phone the open sheet has no title row: its close button floats over the top corner, the starting questions are a list, and answers read at 15px. `ASK_SHEET_HEADER_HEIGHT` is removed from the Ask box contract.

- [#438](https://github.com/rizom-ai/brains/pull/438) [`57bb96e`](https://github.com/rizom-ai/brains/commit/57bb96e61b54f676a04c2c467124da739ef6ef18) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional site's atlas homepage says the owner's name once: the byline over the headline is gone, and with it the ask-content `attribution` field. The ask box asks "Ask about my work…" before and after it mounts (a host sets the box's first placeholder with `ASK_PLACEHOLDER_ATTRIBUTE`). An answer's sources take their mark's shape and are named as the map's legend names their kind. A lit piece is its shape in the accent with one thin ring. The send button is quiet until there is something to send. On phones, the type is smaller, the starting questions are a list between hairlines, the map strip keeps lit pieces near its edge in view, and text passes under a short fade below the strip.

- [#438](https://github.com/rizom-ai/brains/pull/438) [`0d57efc`](https://github.com/rizom-ai/brains/commit/0d57efc8e96dd0dd2978ff4c06369c1218675a1b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - People reading a brain publicly — site visitors asking in the Ask box, public chat users — only reach published work. Search, lookups by id, slug or title, listings, insights and an answer's sources all leave drafts out, using each entity type's own published statuses. Before, a visitor's answer could quote and link an unpublished draft, and the insights tool listed draft titles. A production site build's search now applies the same gate as its listings.

## 0.2.0-alpha.451

### Patch Changes

- [#437](https://github.com/rizom-ai/brains/pull/437) [`9c69413`](https://github.com/rizom-ai/brains/commit/9c694130035731efe61b97c2c5e3b9e76bbb735b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Site runtime scripts that the build serves itself now load from a content-fingerprinted src (`/scripts/homepage-atlas.js?v=…`). A release that changes a script reaches visitors on their next page load instead of after the four-hour browser and CDN cache runs out.

## 0.2.0-alpha.450

### Patch Changes

- [#436](https://github.com/rizom-ai/brains/pull/436) [`db31d1f`](https://github.com/rizom-ai/brains/commit/db31d1f8c7c1211ae667c99b5a2966b0a88cd755) Thanks [@yeehaa123](https://github.com/yeehaa123)! - In the phone conversation, a tap on the map's strip brings the whole map back to the top, rather than opening a mark too small to aim at; at full height, taps work on the marks as before.

## 0.2.0-alpha.449

### Patch Changes

- [#435](https://github.com/rizom-ai/brains/pull/435) [`1c4c0cb`](https://github.com/rizom-ai/brains/commit/1c4c0cbd7ba417f9cd73cd399d8539063b50f5eb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The first opening of the phone conversation hides the page behind it too, from the moment the sheet has risen, not only once the conversation has loaded (which can take a second or more).

## 0.2.0-alpha.448

### Patch Changes

- [#433](https://github.com/rizom-ai/brains/pull/433) [`2c0c48b`](https://github.com/rizom-ai/brains/commit/2c0c48bf16807acd11917ff24a866fe41b9328e0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - While the phone conversation is open, the rest of the page is out of sight: once the sheet has risen over it the page is hidden, and it shows again as the sheet starts to fall away. Nothing of the homepage or footer can show through wherever Safari's keyboard and bars briefly leave the sheet short of the screen.

## 0.2.0-alpha.447

### Patch Changes

- [#431](https://github.com/rizom-ai/brains/pull/431) [`c5af76a`](https://github.com/rizom-ai/brains/commit/c5af76a051bde7ddcdba5e13525023f1a482ba23) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On phones, the page behind the Ask conversation is held where it was when the visitor's finger landed on the box, not where Safari had already scrolled to reveal it, so closing the conversation returns to that place.

- [#432](https://github.com/rizom-ai/brains/pull/432) [`5949cb4`](https://github.com/rizom-ai/brains/commit/5949cb4caf89a1168b45d8fb243a5f2a0f4a7240) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Opening the phone conversation again from the page holds the page still exactly as the first opening does: where the finger landed, at once, before Safari moves anything for the keyboard.

## 0.2.0-alpha.446

### Patch Changes

- [#426](https://github.com/rizom-ai/brains/pull/426) [`f58e0fc`](https://github.com/rizom-ai/brains/commit/f58e0fcf0bc58f6d88184a8efe1a10fec74d90a4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add plugin-owned `content`/`system` entity-type classification, defaulting to content and available through public `defineEntity` authoring. Mark prompts, skills, playbooks, assessments, agents, identity and site configuration, and grouping definitions as system types.

  Use one registry-enforced grouping eligibility rule for runtime declarations and Studio discovery. System types never contribute fields or membership counts and never appear as exclusion choices. Studio navigation consumes registration metadata, including custom system types, rather than inferring classification from type names.

  Keep authored Markdown and exact memberships unchanged. Previously saved system exclusions remain in source but are not presented as selectable or unavailable options. Other unavailable exclusions remain visible and removable.

- [#429](https://github.com/rizom-ai/brains/pull/429) [`03341b3`](https://github.com/rizom-ai/brains/commit/03341b348d06aa11e216d043a499cacb2f0a8fe7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On phones, the page behind the Ask conversation now holds still in Safari too: it is pinned at its scroll position from the first tap (Safari scrolled a page whose root only hid its overflow, both to reveal the focused field and under a swipe), so the homepage and footer cannot move into view behind the conversation, and closing returns the page to where it was.

## 0.2.0-alpha.445

### Patch Changes

- [#428](https://github.com/rizom-ai/brains/pull/428) [`91d165d`](https://github.com/rizom-ai/brains/commit/91d165d4b1f10e3978561e0760a6fe6ad2216d8c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The phone conversation's header is its title and a way out; it no longer links to "About", whose notice the line under the composer already gives.

## 0.2.0-alpha.444

### Patch Changes

- [#427](https://github.com/rizom-ai/brains/pull/427) [`ad725df`](https://github.com/rizom-ai/brains/commit/ad725dfb44ae84502a91dec1991d792b66d9f74e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On the atlas map, an open title card on a lit piece now sits above the other lit pieces instead of under them.

## 0.2.0-alpha.443

### Patch Changes

- [#424](https://github.com/rizom-ai/brains/pull/424) [`eaf4cc3`](https://github.com/rizom-ai/brains/commit/eaf4cc36792d9564715dd0c9d8900bba9d765f3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix a rare "Projection batch cannot join active batch" fencing failure that could hit unrelated jobs. The job queue dispatches jobs as Effect fibers, which have no relationship to Node's `AsyncLocalStorage` tracking, so an unrelated job's leftover projection-batch scope could appear ambient to a different job and trip the identity fence on jobs that were never actually nested inside it. The worker now resets the projection-batch coordinator's ambient scope to empty before running each job, so a job's batch identity can never leak from another job.

## 0.2.0-alpha.442

### Patch Changes

- [#423](https://github.com/rizom-ai/brains/pull/423) [`7bfcaa6`](https://github.com/rizom-ai/brains/commit/7bfcaa635c9b23e51d59129612ce4293ca3f7570) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The phone conversation's map is now part of the conversation rather than a layer over it: Web Chat's box offers a dock at the top of its scroll (`ASK_DOCK_ATTRIBUTE`), and the atlas lends its map there while the conversation is open. It scrolls up with the answer until only a strip is left, pinned under the header with the lit pieces in view, so a swipe anywhere, the map included, scrolls the conversation with the phone's own momentum. "Where it's cited" now sits beside its piece, where no edge of the map cuts it off.

## 0.2.0-alpha.441

### Patch Changes

- [#391](https://github.com/rizom-ai/brains/pull/391) [`f9b6e36`](https://github.com/rizom-ai/brains/commit/f9b6e3696b76b921e939c7140c5e41a67dfc00f1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare image and document binary storage through entity type configuration. Sanitize binary bodies and search excerpts, exclude binary entities from stale insights, and reject unsupported prompt generation without hardcoded type checks.

- [#391](https://github.com/rizom-ai/brains/pull/391) [`f9b6e36`](https://github.com/rizom-ai/brains/commit/f9b6e3696b76b921e939c7140c5e41a67dfc00f1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Recover mangled entity update confirmations from the exact stored proposal rather than implicitly approving agents. Preserve entity identity, optimistic concurrency, permissions, and single-use tokens. Keep agent approval instructions with agent-discovery.

- [#391](https://github.com/rizom-ai/brains/pull/391) [`f9b6e36`](https://github.com/rizom-ai/brains/commit/f9b6e3696b76b921e939c7140c5e41a67dfc00f1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Let entity types declare their default system_list sort order. Apply blog post publishedAt ordering in the entity service before pagination rather than reordering an already limited page.

- [#391](https://github.com/rizom-ai/brains/pull/391) [`f9b6e36`](https://github.com/rizom-ai/brains/commit/f9b6e3696b76b921e939c7140c5e41a67dfc00f1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Let entity types opt into extract-markdown uploads with markdownImport. Notes declare support; unsupported imports list the installed types that accept markdown extraction.

- [#391](https://github.com/rizom-ai/brains/pull/391) [`f9b6e36`](https://github.com/rizom-ai/brains/commit/f9b6e3696b76b921e939c7140c5e41a67dfc00f1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the anchor-profile fields-only update prohibition. Use the generic persistence probe to reject non-persisting declared field changes while allowing supported updates such as visibility under the existing authorization policy.

## 0.2.0-alpha.440

### Patch Changes

- [#419](https://github.com/rizom-ai/brains/pull/419) [`f1548a5`](https://github.com/rizom-ai/brains/commit/f1548a56b26f962d3094ab4833dad81f9b5b380b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - In the phone conversation on the atlas homepage, the map under the header is as tall as the page's at the top of the conversation and shrinks to a strip as the answer scrolls beneath it, keeping the lit pieces in view. A listed source takes you to its piece: the map grows back, the piece pulses and its card opens; a lit piece's card offers "Where it's cited", which scrolls the answer to that source. Title cards near the map's top open below their mark. Web Chat's box opens an answer below whatever a host docks under its header.

## 0.2.0-alpha.439

### Patch Changes

- [#418](https://github.com/rizom-ai/brains/pull/418) [`ee1213f`](https://github.com/rizom-ai/brains/commit/ee1213f9276e952cefa8fd85819a8f92c9c35a63) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The phone conversation's map strip keeps its size as the conversation opens, and changes height only while the keyboard folds it or it opens into the whole map; marks cut by its edges fade out. An open title card on the map sits above every other mark. "Connecting to chat…" is said to screen readers only, so the sheet opens complete.

## 0.2.0-alpha.438

### Patch Changes

- [#415](https://github.com/rizom-ai/brains/pull/415) [`cfe9ad5`](https://github.com/rizom-ai/brains/commit/cfe9ad50eed5160fe281f59ff4a5d6eee3c80b30) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The phone conversation on an Ask box behaves as one piece. The sheet opens complete (the chat's files are fetched once the page is idle), rises into view and falls away when closed, and never reopens by itself after being closed while loading. A reload with it open returns to where the page was. While an answer is written, the box shows where it will appear and offers to stop waiting only after 20 seconds; the "Latest" control is a round button clear of the text, and the sheet no longer links to the full chat. On the atlas homepage the map strip is a window onto the same map at the page's size and zoom, pans only when an answer moves it, keeps its marks at their own size while zoomed, folds with the keyboard, and opens into the whole map until "Back to the answer".

## 0.2.0-alpha.437

### Patch Changes

- [#393](https://github.com/rizom-ai/brains/pull/393) [`cc7500a`](https://github.com/rizom-ai/brains/commit/cc7500af3a6a0deb593c221f2009c121d1708b71) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Apply groupings to every eligible content type by default. Replace the explicit contributor checklist with optional `excludeTypes` under a collapsed Exclude types disclosure. Singleton controls, types without frontmatter adapters and binary asset types stay outside grouping participation by convention.

  Resolve participation consistently for schema extensions, validation, scoped descriptors and reprojection. Removing an exclusion restores participation without rewriting stored memberships. Preserve unavailable exclusions rather than silently dropping them.

  Prevent queued directory imports from undoing newer Studio saves. Capture per-file entity revisions at admission and use atomic conditional upserts; skip stale work with a visible issue while preserving source files and pending exports. Conditional upserts never retry a raced create as an unconditional update.

  Definitions no longer accept explicit `types` lists. There is no compatibility reader or automatic conversion; smoke's test definitions must use the current document shape when this version is deployed.

## 0.2.0-alpha.436

### Patch Changes

- [#414](https://github.com/rizom-ai/brains/pull/414) [`e6c1f40`](https://github.com/rizom-ai/brains/commit/e6c1f4080e3c87f06dd53e566ef5cbc73c66b151) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A visitor's answer's sources are now found on deployments whose site address is configured as a bare domain, such as `yeehaa.io`; before, building their links failed and the answer fell back to its lookups' sources.

## 0.2.0-alpha.435

### Patch Changes

- [#413](https://github.com/rizom-ai/brains/pull/413) [`c3c8caf`](https://github.com/rizom-ai/brains/commit/c3c8caf1d6ed3ba835814002273c50e7461a4672) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A visitor's answer now cites the public pages closest to it in meaning: with embeddings enabled, the brain searches with the finished answer and keeps up to five pages the site shows, near the closest match, each with its address on the site. The homepage map lights those pages, so an answer about three essays lights the three essays even when the model read about them in a note or a social post. When the closed Ask box on a phone leaves the page, its "Latest" button no longer lingers there.

## 0.2.0-alpha.434

### Patch Changes

- [#412](https://github.com/rizom-ai/brains/pull/412) [`4b385c3`](https://github.com/rizom-ai/brains/commit/4b385c3781e96c2099abf18a196bb110b8556697) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On phones, the open Ask sheet speaks in the site's words: it is titled "Ask <owner>", labels answers with the owner's name, shows the visitor's question as a bubble, lists an answer's sources as links and notes that answers come from what the owner has published; the "Answer received" status is gone. The atlas map strip under the sheet is now a window onto the map at its normal proportions instead of a squashed copy, and it slides to where an answer's sources sit.

## 0.2.0-alpha.433

### Patch Changes

- [#410](https://github.com/rizom-ai/brains/pull/410) [`8dfc94d`](https://github.com/rizom-ai/brains/commit/8dfc94d9cab307024909e81c86817cba619915db) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Redirect retired operator Ask pages to Studio Chat at `/chat`, leaving authentication to Studio. Return 404 when Studio Chat is not registered. Public guest Ask remains unchanged.

- [#410](https://github.com/rizom-ai/brains/pull/410) [`8dfc94d`](https://github.com/rizom-ai/brains/commit/8dfc94d9cab307024909e81c86817cba619915db) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retire Web Chat's operator bundle, page renderer, asset routes and browser-only session UI. Package only the guest Ask, box and dashboard bundles alongside Studio Chat. Remove browser-supplied `inboxContext` and its one-shot prefill contracts; Studio's authorized stored Inbox handoff remains. The old detach button is intentionally retired: start a new conversation for a different topic.

- [#410](https://github.com/rizom-ai/brains/pull/410) [`8dfc94d`](https://github.com/rizom-ai/brains/commit/8dfc94d9cab307024909e81c86817cba619915db) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add confirmed permanent conversation deletion to Studio Chat, including archived conversations. Protect drafts, uploads and active turns, lock the composer during deletion, and ignore late completion after navigation. Failed or unacknowledged deletion stays visible without automatic retries. This restores an operator-chat capability required before retiring the old Ask bundle.

- [#410](https://github.com/rizom-ai/brains/pull/410) [`8dfc94d`](https://github.com/rizom-ai/brains/commit/8dfc94d9cab307024909e81c86817cba619915db) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Let Studio own the Chat interaction, advertised endpoint, and source-backed Inbox “Discuss in chat” handoff. Link directly to `/chat`, and register these entry points only when web-chat is installed. Web-chat no longer advertises a second operator chat UI.

## 0.2.0-alpha.432

### Patch Changes

- [#411](https://github.com/rizom-ai/brains/pull/411) [`2a3f74f`](https://github.com/rizom-ai/brains/commit/2a3f74fc4b328336b36f75bfd96b8c8c18f36865) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A guest answer now opens at its question, so it reads from the start; "Latest" follows the end again. An answer's sources are now the search results it names, however they scored, plus what it read directly. An answer that names none keeps each search's best results, as before. So the essays an answer discusses light up on the homepage map, rather than the higher-scored notes and topics it passed over.

## 0.2.0-alpha.431

### Patch Changes

- [#389](https://github.com/rizom-ai/brains/pull/389) [`7650439`](https://github.com/rizom-ai/brains/commit/7650439502c4bf91d9370b72d952aec25bdff8c2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Start modern Streamable HTTP responses in the SDK's SSE mode so its keepalive comments cover silent model/tool execution before the final result. This prevents that initial silence from exhausting a proxy's response-header timeout without increasing deployment timeouts. Authentication, confirmation handling, request cancellation, and stateless legacy compatibility remain unchanged.

- [#409](https://github.com/rizom-ai/brains/pull/409) [`aeb4e6c`](https://github.com/rizom-ai/brains/commit/aeb4e6c2f28c2c213955514893306cd05f02fcee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On a phone, the Ask box opens full screen once the visitor engages, instead of staying half-way down the page under the keyboard.

  - **Keyboard:** the sheet fits the visual viewport, so the composer sits on the keyboard.
  - **Page:** the page behind the sheet is locked.
  - **Closing:** the close button, Back and Escape all close it, and sending closes the keyboard so the answer gets the screen.
  - **Map:** the homepage atlas docks its map as a strip under the sheet header, where the answer's sources light up, and folds the strip away while typing.
  - **After closing:** the box offers "Continue conversation" above its composer.
  - **Contract:** `@brains/contracts` adds `ASK_SHEET_MEDIA`, `ASK_SHEET_ATTRIBUTE`, `ASK_KEYBOARD_ATTRIBUTE` and `ASK_SHEET_HEADER_HEIGHT` for hosts.

- [#409](https://github.com/rizom-ai/brains/pull/409) [`48f328a`](https://github.com/rizom-ai/brains/commit/48f328aa66fce00557d54a9c128268514d8513ab) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Ask box's code is now loaded at versioned addresses, so a release reaches visitors straight away instead of after their browser or edge cache expires (up to four hours on Cloudflare). The unversioned `/ask/assets/box.js` that sites reference is now a stub that never changes: it reads the current version from `/ask/assets/version`, which is never cached, and loads `/ask/assets/boot.js?v=…`, which loads `guest.js` and `guest.css` at the same version.

## 0.2.0-alpha.430

### Patch Changes

- [#396](https://github.com/rizom-ai/brains/pull/396) [`c26ff7a`](https://github.com/rizom-ai/brains/commit/c26ff7ab7ee8529a3b4776ae52b9d995c8340dd7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The public Ask page and Ask box follow the newest message the way Studio Chat does: one "close enough to the bottom" distance for all three, and "Latest ↓" moves focus to the conversation it scrolls.

- [#397](https://github.com/rizom-ai/brains/pull/397) [`b2f9b74`](https://github.com/rizom-ai/brains/commit/b2f9b745a713014cf08077c025747c229c01cf49) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A guest lookup that returns an answer instead of results, such as the entity types a list knows, now reaches the model in the tool's own words (bounded to 500 characters), so it can correct its request. Guest answers speak of the brain's anchor in the third person.

## 0.2.0-alpha.429

### Patch Changes

- [#394](https://github.com/rizom-ai/brains/pull/394) [`9077f1c`](https://github.com/rizom-ai/brains/commit/9077f1cf3f9d461fe077c6cf66004e608c9973b1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat now runs on the brain's own agent as a public user.

  - **Same agent as owner chat:** the brain's model, identity, public profile (without the owner's email) and instructions, the reviewed public read tools, and normal search. A short visitor instruction tells it to answer from the brain's public content.
  - **Guest-only limits removed.** They ended answers early or emptied them: a three-step cap, output, context and lookup caps, a 32 KB request guard, a separate guest search and a 30-second stream idle timer.
  - **Deadline:** an answer is bounded by a three-minute deadline.
  - **Cost:** measured from each step's reported usage, and charged the answer cap when it cannot be measured.
  - **Diagnosable failures:** a failed or empty guest turn is logged with its reason; visitors still see only that the answer failed.

## 0.2.0-alpha.428

### Patch Changes

- [#392](https://github.com/rizom-ai/brains/pull/392) [`223282b`](https://github.com/rizom-ai/brains/commit/223282ba7bc0735a901655988269185662ca0f1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The embedded Ask box opens empty on every page load instead of restoring the tab's last conversation. The full chat page (`/ask`) still continues the conversation the box hands it, and the browser's back button still returns to an answer.

- [#392](https://github.com/rizom-ai/brains/pull/392) [`e26b1ef`](https://github.com/rizom-ai/brains/commit/e26b1ef5b4eb6d9c626332da0139618150abe8bb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat and the contact form no longer show a retention notice. The chat session carries no `recording` notice, a question carries no `disclosure` revision, and every admitted question is kept for the owner's Studio view. The contact form drops its "Your note is kept for N days" paragraph. Retention and deletion work as before.

## 0.2.0-alpha.427

### Patch Changes

- [#390](https://github.com/rizom-ai/brains/pull/390) [`7dea587`](https://github.com/rizom-ai/brains/commit/7dea587a0f9549ddc1fda21096d48feb9994ee1f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat is quieter and more honest.

  - A guest lookup that finds nothing now tells the model that nothing public matches. Before, every failed lookup read as "Public retrieval unavailable", so the model told visitors that retrieval was down.
  - A lookup past the turn's limit, or with an oversized result, now says so, so the model can answer with what it found.
  - The homepage atlas scrolls a docked conversation only with its text column, with a thin themed scrollbar; the answer area no longer has a scrollbar of its own.
  - The box drops "You can draft while you wait."
  - The recording notice now reads "Questions are kept for the site owner for N days, even if you delete this chat."

## 0.2.0-alpha.426

### Patch Changes

- [#386](https://github.com/rizom-ai/brains/pull/386) [`8e6a93f`](https://github.com/rizom-ai/brains/commit/8e6a93fc80511ff66c30d4b97dac094f1d5be716) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A job whose attempt lease expired is reclaimed by the next free worker even while the worker that claimed it is still running; the attempt fence stops the old attempt's late writes. Before, a worker that stopped renewing a lease without exiting left the job processing indefinitely, which kept the queue from ever going idle and blocked every deploy at the pre-deploy backup. The backup gate now treats such an abandoned job as rerunnable work, names it in the deploy log and backs up.

- [#388](https://github.com/rizom-ai/brains/pull/388) [`7086bff`](https://github.com/rizom-ai/brains/commit/7086bffad5695733bb11f150a57e88e08a2845ca) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An environment variable set to an empty string now counts as unset in `brain.yaml` interpolation, the way deploy tooling passes a secret that is not configured. The plugin it configures is skipped as missing config instead of failing validation on an empty value.

- [#387](https://github.com/rizom-ai/brains/pull/387) [`17f5453`](https://github.com/rizom-ai/brains/commit/17f5453ea6821f0db371c5845556bb7cfaa4cc78) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A guest answer that fails no longer holds its place. When the model call returns an error, the answer settles as failed and is charged the $0.05 answer cap, so the visitor can ask again; an answer still active past its deadline (a process that died mid-answer) settles as interrupted at the cap on the next admission. Before, both stayed reserved for good, and three failed answers filled preview guest chat's concurrency so every later question was refused as busy.

- [#386](https://github.com/rizom-ai/brains/pull/386) [`ee6a4dd`](https://github.com/rizom-ai/brains/commit/ee6a4ddd0275726256928a173f6054e81c7d0024) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A plugin whose configuration is wrong — an unknown key or a value of the wrong type — now stops the brain from starting with the validation message, instead of being dropped without a trace. A plugin is still skipped when its only problem is a required value that is not set, such as a credential whose environment variable is absent.

## 0.2.0-alpha.425

### Patch Changes

- [#383](https://github.com/rizom-ai/brains/pull/383) [`fb6d178`](https://github.com/rizom-ai/brains/commit/fb6d178aebdfde6ab0544bd97ac1fc425e0ba937) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Activate the shared Groupings document after contributor registration. Derive Studio labels, contributor descriptors and all four open/closed and one/several membership modes from its source. Refresh current rules after refused saves without discarding local drafts.

  Reject the removed Studio `groupings` configuration and competing static declarations. Remove the vocabulary entity and runtime readers, and update canonical permissions to `grouping-definitions`. There is no compatibility reader, alias, dual write or startup conversion. The old feature is used only on the smoke test site; its test setup will use the new document directly, without a legacy converter or conversion rehearsal.

  Check schema-admitted entities when probing field-tool persistence. Source-only definition fields must not appear to save when validation would strip them: use full Markdown replacement instead. Cover source activation through real plugin/session/editor integration and the exact packed Brain CLI, including refused writes and unchanged drafts/source. Smoke deployment and running-app acceptance remain separate from this code change.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`48b29ff`](https://github.com/rizom-ai/brains/commit/48b29ff5ff9ec28de232330db609540b8d3732eb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Read raw entity source when draining durable directory exports. Presentation-time image expansion must not replace authored body references, grouping memberships or allowed values in exported Markdown. Preserve existing visibility scope, placement, acknowledgement and retry behavior.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`a0d561f`](https://github.com/rizom-ai/brains/commit/a0d561fe3e73f08d4a21eb85b89103ae38bba39f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refuse the grouping definitions control document as a contributor, with a section-level validation issue and repairable handling of invalid stored definitions.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`0ce2ac5`](https://github.com/rizom-ai/brains/commit/0ce2ac5b2b8ab789ec21628db66c3c9f3fc0533f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep automatically opened singleton creation drafts clean until edited, and disable pristine singleton creation saves through the button, form and keyboard paths.

  Implement the approved Groupings editor and unified membership control, with independent cardinality/list rules, exact literal values, explicit removals, immutable saved keys, lossless duplicate-key drafts and read-only views. Ordinary editor integration uses document-owned descriptors and visibility-scoped usage reads.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`125d96f`](https://github.com/rizom-ai/brains/commit/125d96f90cf388ab7e5eaef26d341c40bd4b0f1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add read-only grouping-source refresh hooks before persistence, projection and grouping-dependent reads, and provide Studio's document-backed definitions contract with independent cardinality and list validation. Refresh failures refuse operations rather than use stale policy; uncached frontmatter parsing keeps repeated malformed-document reads repairable.

  These hooks underpin Studio's document-owned groupings and process-local reprojection readiness. The old configured groupings are used only on the smoke test site. Its test setup will use the new document directly; no legacy converter or automatic conversion is introduced.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`c55e0ea`](https://github.com/rizom-ai/brains/commit/c55e0ea460cf0c5a605b1adaf61061a910d8f4b2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add grouping usage reads with distinct entry totals and bounded, exact-value counts, including zero counts for unused values. One SQL statement applies admitted contributor types and visibility to every aggregate; duplicate and overlapping memberships do not inflate entry totals.

  Expose the read through Studio's trusted-session API and typed client, retaining cancellation, source refresh and initializing/retry behavior. No durable state or content changes are introduced. Mounting usage data in the reviewed Groupings page and activating the replacement document source remain pending.

- [#384](https://github.com/rizom-ai/brains/pull/384) [`d26d585`](https://github.com/rizom-ai/brains/commit/d26d5856a121236778fa9d386ff303afb0fb4d79) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat's budget works simply. A question is admitted while guest chat is on and the month's spend is under the owner's budget; nothing is reserved up front. Each answer runs within fixed limits (prompt size, answer length, model steps, searches) that hold it to about two cents, and when it finishes its measured cost is added to the month, or $0.05 when the provider reports no usage. The per-call cost quotes that refused real answers are gone from `GuestTurnBudget` (its accounting now only prices a settled turn), and changing the configured limits no longer locks out sessions or the owner's approval. The Studio budget starts at $0.05.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`6c9ccfb`](https://github.com/rizom-ai/brains/commit/6c9ccfbf70b0ae49cd038a0ebba41527b56ccf8f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reproject added grouping type/field pairs after definition writes, using the existing bounded metadata-only scan. Keep pending work and readiness entirely in memory: Studio returns initializing during scans, failed scans remain retryable without misreporting saved definitions, and startup reconstructs progress from source.

  Guard ordinary entity commits against a definition change after preparation. Stale writes, including no-op updates, are refused for retry before committing source or exports, using an in-memory publication revision and the existing write transaction.

  Independent processes conservatively verify their own projections on observed definition changes, including remove/re-add cycles detected through existing document timestamps. No database tables, migrations or persistent status records are added. The new definitions registration module remains an internal implementation checkpoint, not yet activated by StudioPlugin.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`cf1b1f5`](https://github.com/rizom-ai/brains/commit/cf1b1f515330ba07f179da997876fbb1ebe88d37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect the reviewed grouping definition editor to ordinary draft, save, conflict, and navigation handling. Supply eligible contributor types and repair issues, batch visibility-scoped usage without adding repeated entry totals, and show initialization, unavailable counts, and retry states. Reuse the unified membership control in ordinary fields.

  Preserve invalid local drafts and literal definition values. Expose unparseable source for explicit repair rather than silently replacing it. Production definition-source activation and removal of the legacy configuration/vocabulary ownership path remain separate work; no migration is performed.

  Apply the documented Bun/StyleX DFG workaround to Studio UI builds as well as tests. Production runtime settings are unchanged; this is not an underlying Bun fix.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`d9925ab`](https://github.com/rizom-ai/brains/commit/d9925ab9386021c377b7ef8c5f138c75938ee549) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Read raw source for Studio editing and mutation preparation so image-like grouping values, unclaimed frontmatter and body references cannot be rewritten by presentation-time image expansion.

  Resolve Markdown preview images separately through an authenticated, visibility-scoped image read. Use the injected client, cancel superseded requests and discard previously authorized image data when the client/session changes. Preserve literal code examples and existing Markdown sanitization. Cover exact Note/Post source round trips, mounted preview-and-save behavior, opaque image IDs and restricted-image non-disclosure.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`89a70c1`](https://github.com/rizom-ai/brains/commit/89a70c1f048aa9d1ba9e895e837a4dfb6764ac5f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add atomic replacement of an entity registry's complete grouping set through `replaceGroupings`. Grouping-owned schema extensions are kept separate from permanent plugin extensions, so removing a grouping preserves owner/plugin fields and their refinements. Invalid replacements leave the active set unchanged; authored memberships and file identities are never rewritten.

  `validateGroupings` now preflights a complete replacement set. Studio's existing registration path includes already-registered declarations in that preflight. These registry primitives do not load a definitions document, coordinate readiness or automatically reproject stored content; their caller still owns those steps.

- [#383](https://github.com/rizom-ai/brains/pull/383) [`86e8937`](https://github.com/rizom-ai/brains/commit/86e89377bb1c1dfe98d752a791469597c737b8b6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore ordinary no-op saves for existing System documents without weakening Groupings draft guards. Pristine singleton creation and unchanged Groupings remain blocked, including direct save actions as well as form and button submission.

## 0.2.0-alpha.424

### Patch Changes

- [#382](https://github.com/rizom-ai/brains/pull/382) [`33a50f0`](https://github.com/rizom-ai/brains/commit/33a50f0c131cfda826a35c4d80a014bc288e2567) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat sessions no longer stay refused after a release changes their limits. The session ledger adopts new limits only through an explicit owner action, and nothing ever took it, so after the preset change every visitor saw "Chat isn't available" even with guest chat switched on. Switching on in Studio (or reopening through the activation endpoint) now adopts the session limits too, and at startup a deployment whose owner authorized exactly the current policy brings its session ledger to that policy's limits.

## 0.2.0-alpha.423

### Patch Changes

- [#381](https://github.com/rizom-ai/brains/pull/381) [`272188b`](https://github.com/rizom-ai/brains/commit/272188bf8d8534fa7567da9ae002075de708dc84) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Managed guest chat is limited by a monthly budget the owner sets, not by counts of sessions or questions. The owner opens guest chat in Studio's Guest chat workspace with a budget in US dollars ($0.50 to $10,000), confirmed before it applies; the same form changes it while open. Each question reserves a $0.50 quote until its cost is measured from the provider's reported usage, and the unused part returns to the budget; unknown cost keeps the whole quote. The budget covers one UTC month. The activation endpoint still accepts only `{ enabled }` and reopens with the budget set in Studio. The preview preset's session and question counts become flood limits sized far above normal use (the old four sessions a day, deployment-wide, shut out everyone). The two-question lifetime trial is retired: a deployment that had guest chat on must open it again with a budget.

## 0.2.0-alpha.422

### Patch Changes

- [#380](https://github.com/rizom-ai/brains/pull/380) [`9f05393`](https://github.com/rizom-ai/brains/commit/9f053937e22deff5804427868bf0ad30e6b5c25b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The homepage chat box stays on preview across a restart. Web Chat records at startup whether the box is offered, and it checked that guest chat could answer, which waits for the search index. That is never ready at startup, so every restart or deploy recorded the box as off until the owner switched guest chat again. The record now follows the owner's switch and remaining allowance; the box itself says when chat cannot answer yet.

- [#376](https://github.com/rizom-ai/brains/pull/376) [`39cc6eb`](https://github.com/rizom-ai/brains/commit/39cc6eb4cde86fc1a2adb38c85d45fab6fe98319) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate MCP protocol registration from HTTP and stdio hosting. Hosted interfaces and protocol-only embeddings share the same tool handlers and registration lifecycle. Add the explicit ProtocolPluginProvider contract and have --mcp-basic use the selected interface's protocol provider without starting listeners or restoring disabled host dependencies. Preserve hosted HTTP dependency and authentication checks.

  Add regressions for listener-free registration, canonical headless/personal composition, unsupported providers, and an MCP chat/confirm long-note edit with exact stored-content assertions.

- [#376](https://github.com/rizom-ai/brains/pull/376) [`39cc6eb`](https://github.com/rizom-ai/brains/commit/39cc6eb4cde86fc1a2adb38c85d45fab6fe98319) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add exact-match `edits` to agent-backed `system_update` so small changes do not require regenerating an entire document. Reject missing, ambiguous, overlapping, and mixed-mode edits; preserve confirmation and content-conflict protection. Refresh changed source-derived metadata so a note heading edit also updates its title. Reject entity updates that supply both fields and content instead of silently discarding content. Align confirmation preview lines so insertions and deletions do not mark an unchanged suffix as rewritten, and preserve visible blank-line changes. Add long-note coverage for exact content and backslash preservation through confirmation.

  Add agent evals for 7, 14, and 17 KB note edits and combined title/body edits. Exact tool-result assertions verify stored Markdown after cancellation and approval, rather than relying on the assistant's success claims.

## 0.2.0-alpha.421

### Patch Changes

- [#379](https://github.com/rizom-ai/brains/pull/379) [`84a2aac`](https://github.com/rizom-ai/brains/commit/84a2aaccbd73ac2e3d40f500374ad92fc401dcf6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A failed notification now says why, without any message content. The email transport reports Resend's error name (`resend_validation_error`) or HTTP status (`resend_http_500`) instead of a generic failure, notifications passes that code on (`NOTIFICATION_FAILURES` and `notificationFailureCode` in `@brains/contracts`), and contact keeps the latest attempt's code with a failed alert and counts failed alerts by code in its operational health (`failures`). A missing recipient or transport reads `recipient-missing` or `transport-missing`.

- [#378](https://github.com/rizom-ai/brains/pull/378) [`b65b207`](https://github.com/rizom-ai/brains/commit/b65b207deb99878407cf5b1661eecc3450dca52f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The public Ask page loads its own guest bundle (`/ask/assets/ask.js` and `ask.css`, about 1.9 MB) instead of the signed-in chat app (`app.js`, about 15 MB), which it mounted only to render the guest conversation. The app bundle stays served for sites that still load it.

## 0.2.0-alpha.420

### Patch Changes

- [#374](https://github.com/rizom-ai/brains/pull/374) [`b6a1e11`](https://github.com/rizom-ai/brains/commit/b6a1e114fc21cbf00e915c07a9d08c7a3356af02) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional homepage atlas starts its copy on the header's content edge at every width: the centred layout column on wide screens (it sat 48px from the window edge while the header logo moved inward), and the header's 1.5rem / 3rem gutter on phones and tablets, with the map legend on the same edge. The map keeps the rest of the width, and a map-less atlas keeps its measure.

- [#373](https://github.com/rizom-ai/brains/pull/373) [`13b492f`](https://github.com/rizom-ai/brains/commit/13b492f449757eaa6e449d280060d5a44854b4b4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Territory names on the professional homepage atlas carry a solid halo in the page colour, so contour lines part around them and dense rings no longer run through the letters.

- [#373](https://github.com/rizom-ai/brains/pull/373) [`d6285e2`](https://github.com/rizom-ai/brains/commit/d6285e2583af61652d37242ab025f624450c7cb0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form opens in the site's own theme when a link names none, instead of always opening dark. Contact reads the theme from the site's metadata at startup and follows changes to it; a `?theme=` on the link still wins.

- [#373](https://github.com/rizom-ai/brains/pull/373) [`5a70a6f`](https://github.com/rizom-ai/brains/commit/5a70a6f918644186ee01cfbffe7c23b64c97c479) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A successful pre-deploy backup now shows the runtime's own notices, such as the degraded checks it backed up anyway, as workflow warnings. Before, the remote output of a successful capture was discarded. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.

- [#375](https://github.com/rizom-ai/brains/pull/375) [`ce39ab4`](https://github.com/rizom-ai/brains/commit/ce39ab4156e7d91cf5d472bde174095c947ec2f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional homepage now offers the chat box in a preview build while the owner has managed guest chat switched on. The box rule required guest chat to be open to the public even for a preview build, so preview-only guest chat never showed it.

- [#373](https://github.com/rizom-ai/brains/pull/373) [`b84a4c3`](https://github.com/rizom-ai/brains/commit/b84a4c380f2681f53544422daf2dcd575c51b701) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Published sites paint the page colour on the document itself, so scrolling past the footer on a phone never shows a white band in dark mode. The rule lives in the site build's own base stylesheet; Studio and rendered media pages are unchanged.

## 0.2.0-alpha.419

### Patch Changes

- [#372](https://github.com/rizom-ai/brains/pull/372) [`b3a8c6e`](https://github.com/rizom-ai/brains/commit/b3a8c6e5f46691550e2e85be278208cb21fc1087) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A contact request whose email alert failed now keeps contact's operational health degraded only until the owner marks the request Done in the Studio Inbox, instead of for the request's whole retention with no way to clear it. Health details gain `failedUnhandled` beside the existing `failed` count.

- [#372](https://github.com/rizom-ai/brains/pull/372) [`e3d947f`](https://github.com/rizom-ai/brains/commit/e3d947fcb7aaa67b9ff6a8478e975ef32f816c66) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The pre-deploy backup no longer refuses a runtime whose plugins report degraded health. It still requires a ready runtime with an idle job queue, names the degraded checks in the deploy log and backs the runtime up, because a deploy is often the fix for what a plugin reports. A refusal now states its reason (runtime not ready, job queue not idle) instead of exiting silently. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.

## 0.2.0-alpha.418

### Patch Changes

- [#371](https://github.com/rizom-ai/brains/pull/371) [`2884fca`](https://github.com/rizom-ai/brains/commit/2884fca8d6d7c9144626e677e7a506975162cf66) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Studio now has an admin-only **Guest chat** workspace wherever guest chat keeps a usage record. It shows what the public endpoint did — questions, measured cost, unknown-cost and unresolved counts for today and this month, a meter of questions and reserved cost against the allowance (measured cost never returns allowance), recording health and retention, recent questions, refusals by reason with their detailed and counted coverage, and the most active visitors within the retained window — with the switch beside the numbers. Opening guest chat asks for a prepared confirmation that states what the allowance still permits; closing it is one step and stops admissions at once. A recorded question can be saved as a note through its own confirmed action: web-chat sends it to the note plugin over the new `note:capture` message (`@brains/contracts`), and the note plugin keeps such notes restricted to the owner.

## 0.2.0-alpha.417

### Patch Changes

- [#369](https://github.com/rizom-ai/brains/pull/369) [`34b0419`](https://github.com/rizom-ai/brains/commit/34b04190acdc2575fa6bbbffd1ad985facb848f7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The owner's guest usage record now keeps refused questions. An admission denial is recorded with its reason and the visitor's salted digest; the guest send route's own refusals (forbidden origin, wrong method or media type, invalid, oversized, unknown conversation, closed access) are recorded by category without their body or a visitor; and a full or unwritable record records its refusals too. Detailed denials have their own allowance, the guest policy's new required `usageRecord.maxDenialRecords` (presets: 1,000), so denial traffic never takes the places admitted questions need. Beyond it, denials become daily counts by reason, held in memory and written by the guest maintenance tick, so a flood of refused requests writes at most once a minute; counts that could not be written wait for the next tick.

- [#370](https://github.com/rizom-ai/brains/pull/370) [`35c4939`](https://github.com/rizom-ai/brains/commit/35c49397982afd1b8cf81fcf9c9f2cea345e71f5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The owner's guest usage record now keeps to its own retention and reports its health. The guest maintenance tick removes records, denials and daily denial counts past the record's retention (a day's counts once the whole day is past it), without touching admission accounting or unresolved reservations, and deleting a conversation leaves its record in place, as the visitor notice says. Kept question text has a total bound, the guest policy's new required `usageRecord.maxStoredBytes` (presets: 4,000,000): a request whose largest possible question could exceed it is refused like one arriving at a full record. Operators see the record's bounded health as `guest-usage-record` — degraded while it is full and refusing questions, unhealthy while its writes fail — with counts only, never question text or storage errors.

## 0.2.0-alpha.416

### Patch Changes

- [#368](https://github.com/rizom-ai/brains/pull/368) [`6916f21`](https://github.com/rizom-ai/brains/commit/6916f216a2fd84ad0b408af03077ef46dff2a3a9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat now tells visitors, with the composer, that their questions are kept for the site's owner, for how long, and that deleting the conversation does not delete them, and records a question's text in the owner's usage record only when the visitor was shown that notice. The notice is composed from the guest policy's `usageRecord` retention and returned by the guest session with a revision; the standalone Ask page and the shared Ask box show it as a visible line that describes the question field, and each question carries the revision it was shown. Question text is kept within the policy's new required `usageRecord.questionBytes`, cut on a character boundary and marked when cut; the presets keep 16,000 bytes.

## 0.2.0-alpha.415

### Patch Changes

- [#367](https://github.com/rizom-ai/brains/pull/367) [`7957c18`](https://github.com/rizom-ai/brains/commit/7957c18f85f4e481123c50324462b3895eb956c6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat turns now settle their actual cost. The guest turn budget records the usage the provider reported for every model call (input, cached, cache-write and output tokens, reasoning included) and every query embedding, and the OpenAI guest profile prices it at a pinned revision of the published gpt-5.6-luna and text-embedding-3-small rates, charging requests over 272K input tokens at the long-context rates throughout. The settlement travels on the agent response as `guestSettlement` and is kept in the owner's usage record with the turn's outcome. A turn whose usage is missing, a long-context request with cached input (whose rate is not published), or an accounting without pricing is recorded as unknown cost, never as zero; quotes are never recorded as cost.

## 0.2.0-alpha.414

### Patch Changes

- [#366](https://github.com/rizom-ai/brains/pull/366) [`53f028a`](https://github.com/rizom-ai/brains/commit/53f028a7d1ebe2a038c6a2ebed8c264d24b4656a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Guest chat now keeps an owner's record of what its public endpoint did. Each guest request takes a place in the record before admission is asked, so a full or unwritable record refuses the request (the existing `unavailable` response) instead of running work nobody can see, and spends no allowance. An admitted request is recorded as unresolved before any generation and records its outcome once; work that stops without one stays visibly unresolved. The record holds no credential, conversation locator or reply, and names a visitor only by a digest salted per deployment. Guest policies now carry a required `usageRecord` section with finite `maxRecords` and `retentionSeconds`; the built-in presets set both.

## 0.2.0-alpha.413

### Patch Changes

- [#365](https://github.com/rizom-ai/brains/pull/365) [`210ef3c`](https://github.com/rizom-ai/brains/commit/210ef3c55d778720bf113120d25502fd1cf62da5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On touch screens the homepage topics now get the tap size and spacing meant for them: the touch styles came before the resting styles they override, so at equal specificity the resting padding and gap won and the choices sat 37px tall and nearly touching. They are now 44px targets with room between them.

## 0.2.0-alpha.412

### Patch Changes

- [#364](https://github.com/rizom-ai/brains/pull/364) [`e811d5d`](https://github.com/rizom-ai/brains/commit/e811d5d2e145c325c3e1d91fe93412b7c5417c7a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional homepage's topics now carry into the contact form: each topic links to the form with the topic, and the form starts the visitor's message with it (bounded and escaped), so the thread they picked is not lost on the way. Links to the form also carry the visitor's current light or dark theme, which the script-free form cannot read itself, and follow a change. On touch screens, where no hover reveals them, the topics rest as the choices they are.

- [#364](https://github.com/rizom-ai/brains/pull/364) [`e324acb`](https://github.com/rizom-ai/brains/commit/e324acb5cbdae3d12aa850b6795b6fceba18aaa9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Atlas territory names now move in proportion to the map: a desktop map finds every name a place near its territory, while a phone map, too small for all of them, keeps the largest territories named at full size and never lets a name wander off to another part of the map. A name the map cannot fit keeps its place empty, so a smaller territory's name never stands in for it, and each mark's card now names its territory, so every territory stays one tap away. On touch screens the open card's title is underlined, since the card is the way in.

- [#364](https://github.com/rizom-ai/brains/pull/364) [`d248e16`](https://github.com/rizom-ai/brains/commit/d248e16eca3f5a21fb2103e92e7afbda9ddf3466) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The contact form now speaks to the visitor. It names who the note goes to from the Brain's profile ("Write to Yeehaa"), says in plain words that the note is private, never published and never part of what the site knows, and states on the form how long a note is kept, that deletion can run late and that backups may keep earlier copies. The confirmation says the note is saved without promising the owner's alert arrived. Labels, the button ("Send note") and errors use sentence case and plain wording instead of the console's uppercase mono chrome, and inputs and the button have rounded corners; the page still loads no external fonts, assets or scripts.

## 0.2.0-alpha.411

### Patch Changes

- [#362](https://github.com/rizom-ai/brains/pull/362) [`ba403f4`](https://github.com/rizom-ai/brains/commit/ba403f4423a71cd7a4969b49c624d7d47c53dc69) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The atlas never shows a chat box that cannot answer. Web Chat now records the Ask box as available publicly only for a configured guest policy, and on preview for managed guest chat only while the owner has it switched on; it rewrites the record on every start and activation change. The shared box boot marks its host `data-ask-ready` once the controls are live, and the atlas keeps the box out of sight until then. On phones, the atlas text flows with the page with the box docked, instead of scrolling inside a clipped column.

## 0.2.0-alpha.410

### Patch Changes

- [#361](https://github.com/rizom-ai/brains/pull/361) [`7ac481d`](https://github.com/rizom-ai/brains/commit/7ac481d869b35bd914a49c82da88124d70ed89a0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The atlas homepage docks the guest chat box on deployments that run a separate worker. Web Chat now records in shared runtime state whether it serves the shared Ask box boot (and on preview), and site builds read that record instead of Web Chat's routes, which a worker does not have. Without the record, or with guest chat off, the homepage keeps only the contact door.

- [#360](https://github.com/rizom-ai/brains/pull/360) [`fde11f4`](https://github.com/rizom-ai/brains/commit/fde11f4b9c2bc169e9738dcef5c05acdbe0a3666) Thanks [@yeehaa123](https://github.com/yeehaa123)! - On phones the atlas text now starts where the map's content ends: the build records how far down marks and names reach, and the legend and the opening move up over the fading outer rings instead of leaving an empty strip. Long territory names wrap to two short lines on phones, so more of them fit, and names stay above that line.

## 0.2.0-alpha.409

### Patch Changes

- [#358](https://github.com/rizom-ai/brains/pull/358) [`a83fa6f`](https://github.com/rizom-ai/brains/commit/a83fa6f699695f7011db996b98d93c661e429c41) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Atlas territory names no longer collide on real maps. The build keeps each name inside the map's edges, and the atlas script re-places names by their rendered size, largest territory first: each takes the nearest free spot off marks and apart from other names, or is hidden when none is free. On phones the first screen now holds the map and the headline together, with a compact legend on the map's lower fade and a quieter byline.

## 0.2.0-alpha.408

### Patch Changes

- [#357](https://github.com/rizom-ai/brains/pull/357) [`e44477c`](https://github.com/rizom-ai/brains/commit/e44477c763351b94692a98c1d13c554cc02325d9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Contact intake and the homepage opening work when a brain runs a separate worker process. The worker now builds contact's intake and declares its routes, so site builds there see the form, and it can run contact's daily maintenance, whose freshness is shared through runtime state; before, the check failed as unknown in the worker and intake closed as overdue after 26 hours. The worker never serves or gates the form. The homepage opening no longer requires an advertised contact endpoint, which only the web process registers, so preview and production builds in the worker render it.

## 0.2.0-alpha.407

### Patch Changes

- [#356](https://github.com/rizom-ai/brains/pull/356) [`249fcec`](https://github.com/rizom-ai/brains/commit/249fcec187ca4c3a837c49bba554e0d8f7311c23) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Contact intake works behind a TLS-terminating proxy and on the preview host. With `http.trustForwardedProto: true`, a request forwarded as plain HTTP by a loopback or private-network proxy (such as Kamal's) counts as HTTPS when the proxy reports `X-Forwarded-Proto: https`; the header is ignored from public peers, and visitor identity stays the socket peer. With `preview: true`, the form also serves the deployment's preview origin, and a preview build's homepage opening links its contact door there.

## 0.2.0-alpha.406

### Minor Changes

- [#355](https://github.com/rizom-ai/brains/pull/355) [`9204df2`](https://github.com/rizom-ai/brains/commit/9204df219fee7f726a38ba60281f780373110403) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The professional homepage atlas docks the public chat when guest chat is enabled: the composer sits in the opening, topics fill its draft instead of opening the contact form, and a finished answer lights the sources it drew on and turns the map towards them, zooming only as far as keeps each in view. On desktop, dotted leads run from each source the answer lists to its mark. Without guest chat, the topics stay links to the contact form.

  Web Chat now serves the shared Ask box boot at `/ask/assets/box.js`, only while guest assets are enabled. It enhances every host that renders the `@brains/contracts` ask-box markup, never sends on load or focus, and keeps the draft with an unavailable notice when the box cannot load. The mounted box reports each answer's sources to its host as an `ask:sources` event, and each source it lists carries `data-ask-source` with the same `entityType:entityId` key. Hosts that set `data-ask-styled` get Web Chat's shared box presentation, themed with `--ask-*` tokens that default to the site theme; the dashboard's Ask panel now uses it.

- [#355](https://github.com/rizom-ai/brains/pull/355) [`40c3e77`](https://github.com/rizom-ai/brains/commit/40c3e77ce66a3dadabb342ca6e2bf8ce1e3f7777) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Professional sites that opt into the authored homepage opening now render it as an atlas: everything published — essays, talks and projects — placed by topic on server-rendered topographic terrain from the knowledge map, with the authored opening and the contact door over it. Every word on the page is authored: Ask content gains optional `topicsHeading`, `contactLabel`, `contactNote`, `attribution` and `mapCaption`, and copy nobody wrote is left out. Drafts and private entities never appear; without embeddings the opening and door render on their own. The page works without JavaScript; a small script ships only with the atlas to let the terrain drift slowly (still under reduced motion and off screen) and to open a mark's title on the first tap on touch screens.

### Patch Changes

- [#355](https://github.com/rizom-ai/brains/pull/355) [`56d0c9e`](https://github.com/rizom-ai/brains/commit/56d0c9e48bcb8226bd88709a0da2041862275cbc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the no-JavaScript contact form rejecting legitimate submissions: its pages sent `Referrer-Policy: no-referrer`, so browsers posted the form with `Origin: null` and the strict origin check refused it. The pages now use `same-origin`, which keeps referrers from leaving the site while identifying same-origin posts. The retention notice also reads "1 day" instead of "1 days".

- [#355](https://github.com/rizom-ai/brains/pull/355) [`262ae00`](https://github.com/rizom-ai/brains/commit/262ae00e458c936d25ef941d5a7bdbf2f5295188) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Stop warning on every site build that static pages have "no formatter but saved content was requested". Site builds offer saved content to every section; templates without a formatter now skip it quietly.

## 0.2.0-alpha.405

### Patch Changes

- [#353](https://github.com/rizom-ai/brains/pull/353) [`eef433e`](https://github.com/rizom-ai/brains/commit/eef433e436770aca170136cb5b2e79b304ae2c55) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Apply bounded asynchronous SQLite lock retries to queue claims, progress, heartbeats and terminal writes, including contention with enqueue transactions through the same client. Preserve attempt/session fencing and existing job retry policy; retry rejected database statements rather than handlers, and propagate non-lock errors or an exhausted write budget.

## 0.2.0-alpha.404

### Patch Changes

- [#302](https://github.com/rizom-ai/brains/pull/302) [`18f2586`](https://github.com/rizom-ai/brains/commit/18f2586ba20a15400402d34d4289d6035c6f9e3b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Build the browser-safe Chat export separately from server library chunks. Server subpaths still share their runtime, while browser consumers no longer inherit Node-only imports through shared chunks. Keep frontmatter-only contract parsing independent of Markdown AST initialization, so the export also loads in headless runtimes without a DOM. Verify the exact packed export with the existing browser-build and headless canary.

- [#302](https://github.com/rizom-ai/brains/pull/302) [`18f2586`](https://github.com/rizom-ai/brains/commit/18f2586ba20a15400402d34d4289d6035c6f9e3b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A registered entity type can now carry its own `actionPolicy` floor, so an admin-only type stays admin-only in a brain assembled without the bundle carrying its rule. Each action preserves the stricter of the type's minimum and the wildcard policy, including `never`; an explicit per-type entry still overrides the result. Primary buttons keep a visible hover cue when motion is reduced. System forms omit empty field sections, including the Groupings reader's empty Access section.

  Add admin-managed grouping vocabularies in Studio's System → Structure area. Admins can close a grouping to an exact list of values and choose single or multiple membership without restarting. Trusted editors choose from dropdowns or checkboxes; open groupings keep literal input. The vocabulary is always shared so the editors it constrains can read it. Create/update persistence enforces closed lists across Studio, tools, MCP and imports.

  **Derived projection upserts are now validated.** They previously wrote without owner validation or persist validators; they now reconstruct the adapter's fields, project membership from the full source, and run both inside the admitted rule transaction. A rule can no longer write an entity its own type would reject, and supplied metadata cannot invent membership the source does not carry. A refusal rolls back the entire rule result, including export intents and ownership claims, and completed rule reports stay idempotent. Queued directory imports and cleanup retain their durable batch identity through the active-service facade rather than attempting to open unrelated nested batches. Policy-refused imports fail without quarantining valid source. Existing out-of-list values stay visible and marked, never rewritten. Persist validators compose with owner constraints instead of replacing them. Validation field issues survive separate runtime/plugin module copies. Primary buttons retain their contrast-tested colors on hover, and membership warnings stay visible on phones.

  Add configurable, visibility-scoped virtual collections across entity types, with source-authoritative frontmatter membership, startup reprojection, and Studio browsing and editor return navigation. Multiple grouping fields and multiple values per field are supported without copying entities or changing file placement.

  Notes use the normal frontmatter/Properties editor while their type participates in any registered grouping, including Notes with no membership. Notes without a grouping retain whole-document Markdown editing. Removing configuration preserves authored fields. Grouping inputs preserve literal commas and whitespace with explicit Enter/Add submission, mark spaces a reader could not otherwise see, and offer the values that already exist so exact matching does not fragment one group into several. Ordinary tag inputs and stored memberships are unchanged.

  **Behaviour change for every frontmatter entity type:** ordinary frontmatter-form saves and entity exports now preserve existing unclaimed, non-policy frontmatter keys instead of dropping them, including inactive grouping fields. Preservation does not authorize arbitrary new form fields, and explicit full-source replacement remains authoritative. Field-update tools author registered extension fields in Markdown and show their actual previous source values in confirmation previews.

  Each registered field is validated against its own schema entry, so frontmatter the entity owner rejects elsewhere in the document no longer removes an entity from its collections. The bounded startup pass runs on each serving start, including after register-only writes with grouping disabled or changed field constraints. It commits metadata updates in bounded 200-row pages instead of one transaction per entity, retaining per-row source/revision checks, bounded conflict retries, and no-resurrection guarantees. Reusable owner fields are compared conservatively without dropping runtime checks. Failed suggestion refetches discard previously readable values, and the empty-value display marker cannot collide with a literal authored name.

## 0.2.0-alpha.403

### Patch Changes

- [#352](https://github.com/rizom-ai/brains/pull/352) [`d991409`](https://github.com/rizom-ai/brains/commit/d9914097d9c7a915e310b1d02062fc14472a4318) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix directory imports and orphan cleanup failing with “Projection batch cannot join active batch” when executed as children of a queued sync. Carry the durable root batch identity through the inner DirectorySync operations instead of generating a conflicting callback batch ID. Keep coordinator identity fencing and standalone callback batches unchanged.

## 0.2.0-alpha.402

### Minor Changes

- [#349](https://github.com/rizom-ai/brains/pull/349) [`f601b75`](https://github.com/rizom-ai/brains/commit/f601b7596f788dc23f6dc761893a0faa925d97f9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add Resend Contacts, Segments, and Broadcasts as a selectable newsletter delivery provider, move Buttondown onto the same provider-neutral publishing and subscriber seam, and render one shared HTML email body through both providers.

  Newsletter configuration now uses a discriminated `provider` block. Provider-less configurations retain newsletter entities and generation without registering external publishing, subscriber tools, routes, or signup UI. Public signup routes now target a subscribe-only route tool instead of exposing the administrative subscriber action surface.

## 0.2.0-alpha.401

### Minor Changes

- [#351](https://github.com/rizom-ai/brains/pull/351) [`8458106`](https://github.com/rizom-ai/brains/commit/845810658c7a7424f366e2553cd5289c100b2b82) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a default-off contact capability for explicitly configured brains. Contact requests are stored as restricted, non-indexed Markdown records behind bounded public form admission, recovered through durable notification delivery, exposed only in the authenticated Inbox, and removed by bounded retention maintenance. Professional sites can opt into an authored contact-first homepage opening when the matching public form is available.

### Patch Changes

- [#350](https://github.com/rizom-ai/brains/pull/350) [`4692154`](https://github.com/rizom-ai/brains/commit/46921546f52da55ec039ea222ccb7ff1ebb0057f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fail closed when a guest request crosses its elapsed-time deadline even if the event-loop timer has not run yet or the host resumes after sleep. Invalid or regressing clock readings now cancel guest execution without exposing backend details.

## 0.2.0-alpha.400

## 0.2.0-alpha.399

## 0.2.0-alpha.398

## 0.2.0-alpha.397

## 0.2.0-alpha.396

### Patch Changes

- [#285](https://github.com/rizom-ai/brains/pull/285) [`6fa0d8e`](https://github.com/rizom-ai/brains/commit/6fa0d8edbfc3f3e3363e7ed7ba5c101eba57587c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Compose operator-generated brain configuration as an object and serialize once. Carry per-user canonical plugin configuration through reconciliation, using the runtime's shared merge implementation with explicit preservation of null deletion markers until runtime resolution. Plugin schemas remain authoritative; no dashboard-specific operator switch is introduced.

## 0.2.0-alpha.395

### Patch Changes

- [#304](https://github.com/rizom-ai/brains/pull/304) [`18aec18`](https://github.com/rizom-ai/brains/commit/18aec1819582a18a5e4c7b5bb19393186e5a0d11) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use manifest-selected, content-hashed Studio JavaScript and CSS entry URLs so browser caching cannot mask new releases. Keep authenticated shells uncached, serve immutable public assets only from the validated manifest, and offer explicit draft-loss confirmation rather than automatically reloading when an Account or Chat chunk cannot load.

## 0.2.0-alpha.394

### Patch Changes

- [#274](https://github.com/rizom-ai/brains/pull/274) [`46d8477`](https://github.com/rizom-ai/brains/commit/46d847799d564a8b71302b0cb4faaa70b95632fc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Account into accessible Profile, Sign-in & sessions, Linked identities, and capability-driven Personal settings sections. Preserve unsaved values while switching sections, clarify that settings belong to the current account on this brain, and link administrators to separate access management.

  Preserve the account client binding when starting Add passkey so the existing authenticated WebAuthn registration ceremony can run.

  Use consistent linked-identity terminology in Administration and label its existing audit tab Access activity. Preserve access checks, account-recovery controls, passkey protection, System navigation, and existing mutation contracts; do not expose proposed app-grant or shared-integration management features.

## 0.2.0-alpha.393

## 0.2.0-alpha.392

## 0.2.0-alpha.391

### Patch Changes

- [#270](https://github.com/rizom-ai/brains/pull/270) [`1a0278b`](https://github.com/rizom-ai/brains/commit/1a0278b4f49143968abb0e2b3c61fc701bb6265d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep the public Chat browser contract free of server-only markdown parsing dependencies by separating the authored Ask schema from its markdown loader.

## 0.2.0-alpha.390

### Patch Changes

- [#269](https://github.com/rizom-ai/brains/pull/269) [`54d112a`](https://github.com/rizom-ai/brains/commit/54d112a5335806940e1a8fba23c85e6f929fc3fa) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an optional public dashboard Ask tab using the existing guest runtime and a dedicated authored Ask content entity. Share safe welcome content and topics across guest presentations without changing permissions, budgets or activation.

## 0.2.0-alpha.389

### Patch Changes

- [#268](https://github.com/rizom-ai/brains/pull/268) [`5b10272`](https://github.com/rizom-ai/brains/commit/5b10272c4f9108b1d2c8404190724c79427d70df) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Start each claimed job under worker supervision before requesting the next claim. A later dequeue error or stall can no longer strand an earlier durable processing attempt without its handler or lease heartbeat. Preserve attempt fencing, concurrency limits, retry policy, and stop/drain behavior.

## 0.2.0-alpha.388

## 0.2.0-alpha.387

### Patch Changes

- [#266](https://github.com/rizom-ai/brains/pull/266) [`ceebad4`](https://github.com/rizom-ai/brains/commit/ceebad44bc43dc5672453681a70d40bb0e22149d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Cap first-line note title fallbacks at 80 characters including an ellipsis, preferring word boundaries and avoiding split Unicode surrogate pairs. Preserve authored titles, H1 headings, meaningful stored metadata titles, and exact note content. Stored Untitled placeholders use the same capped adapter projection without read-side writes.

## 0.2.0-alpha.386

### Patch Changes

- [#265](https://github.com/rizom-ai/brains/pull/265) [`217ad1b`](https://github.com/rizom-ai/brains/commit/217ad1b24c96f6eee715281ec9455da1ba50a065) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the console climate toggle when Studio mounts or remounts its React chrome after document readiness. Keep theme tokens, accessible labels, and the shared preference synchronized.

  Restore note title fallbacks to the first nonblank body line when no frontmatter title or body H1 exists. Studio requests adapter metadata projections for list and detail labels, so stored Untitled placeholders also display useful titles without a database backfill or read-side writes. Preserve authored titles and source content.

## 0.2.0-alpha.385

### Patch Changes

- [#264](https://github.com/rizom-ai/brains/pull/264) [`b290b28`](https://github.com/rizom-ai/brains/commit/b290b2832c5246e7294bc326c4b08f416e28a28b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Complete Studio's presentation follow-through: widen Properties without clipping native date/time values or upload guidance; neutralize disabled primary buttons; add distinct collapsed navigation marks; give grouped site links shared outlined controls; place published totals in the page head; use clear protection language and consistent connected-channel counts in People; share collection search, filters, ranges, and pagination while preserving separate query contracts; and retain exact timestamps with truthful relative/absolute presentation. Filter panels fit their containers and dismiss safely with the keyboard. Chat detail guidance uses accessible text colors. Permissions, source content, draft safety, and configured typography remain unchanged.

  Preserve agent-reported failures through Web Chat's stream protocol so their error messages cannot disappear during Studio's history handoff. Explicit failure metadata produces sanitized stream errors instead of successful completion, while retry review and approval handling preserve no-replay guarantees.

## 0.2.0-alpha.384

### Patch Changes

- [#263](https://github.com/rizom-ai/brains/pull/263) [`3ec2b73`](https://github.com/rizom-ai/brains/commit/3ec2b73902389be86ff5e1fe358841ce05504a90) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Put every single destination above the toggles in phone Browse. Overview, Chat and Admin share one block at the top, separated by a rule from the Library, Work and System groups below. A lone destination placed between two group headers reads as the tail of the group above it whichever slot it holds, so position alone cannot carry that distinction.

## 0.2.0-alpha.383

### Patch Changes

- [#262](https://github.com/rizom-ai/brains/pull/262) [`6376bb3`](https://github.com/rizom-ai/brains/commit/6376bb31e305c9591e0f499035013088231823fe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Apply the public Ask design with editable suggestions, a scrollable transcript and a compact conversation menu. Let admitted public-page handlers use the installed site's generated presentation, retaining a headerless fallback when no site page exists. Keep provider and retention information in the existing Privacy and limits disclosure, and preserve guest admission, ownership controls and the embedded Brain-page box.

## 0.2.0-alpha.382

### Patch Changes

- [#260](https://github.com/rizom-ai/brains/pull/260) [`3fde4a0`](https://github.com/rizom-ai/brains/commit/3fde4a0421c787fe7c58fc7902bfc81ab7f85a04) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep the rail's Overview/Chat/Library/Work/Admin/System order in phone Browse. Admin is area 04 and now stays between Work and System instead of being hoisted into the top block, so the phone and the desktop rail agree on where a destination lives. A direct destination is marked by its treatment rather than its position: group children indent under their header while a direct destination sits flush and rule-separated, so Admin cannot read as the last row of the group above it.

- [#260](https://github.com/rizom-ai/brains/pull/260) [`28793f1`](https://github.com/rizom-ai/brains/commit/28793f1407de682c65503b149d04bdd0c0a09a86) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A Brain whose instance directory is too deep for a unix socket address can start again. The Git broker socket normally lives in the instance's `.brain-runtime`; when that path exceeds the kernel's limit, the socket now lives in the OS temp dir under a name derived from the instance, so it stays one socket per instance and never inside a checkout. Before, such a Brain refused to boot with "Git broker socket path is too long for a unix socket".

## 0.2.0-alpha.381

### Patch Changes

- [#259](https://github.com/rizom-ai/brains/pull/259) [`d3ca552`](https://github.com/rizom-ai/brains/commit/d3ca552547af0c87f9ce6ad80997395b9dafc868) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A Brain whose instance directory is too deep for a unix socket address can start again. The Git broker socket normally lives in the instance's `.brain-runtime`; when that path exceeds the kernel's limit, the socket now lives in the OS temp dir under a name derived from the instance, so it stays one socket per instance and never inside a checkout. Before, such a Brain refused to boot with "Git broker socket path is too long for a unix socket".

- [#256](https://github.com/rizom-ai/brains/pull/256) [`fbc1b6e`](https://github.com/rizom-ai/brains/commit/fbc1b6e54607e72c91bd31b7fb385e6a627293b9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align System editors with the reviewed form and document presentation: schema-derived field groups, responsive grids, explicit Story and Guidance sections, contextual collections, and readable permission-aware profiles. Preserve nested draft values and supported Markdown bodies through validation and Save. Existing read-only complex lists display structured content rather than disabled JSON. Keep empty documents' Properties visible, distinguish relationship states from publication, and make Markdown source headings and URLs readable in both climates.

## 0.2.0-alpha.380

### Patch Changes

- [#257](https://github.com/rizom-ai/brains/pull/257) [`13ed6d3`](https://github.com/rizom-ai/brains/commit/13ed6d32d46175250464243036d7615cb3f4df9e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `brain tool` and `brain <command>` in the monorepo runner now boot register-only, as the bundled runtime already did. A full boot started a job worker on the queue's stable slot, which superseded a running app's worker session; that app then stopped claiming jobs until it was restarted. A one-shot CLI process owns no runtime work: it registers plugins, invokes the tool, and exits, leaving queued jobs to the running app.

- [#254](https://github.com/rizom-ai/brains/pull/254) [`9fbd8ad`](https://github.com/rizom-ai/brains/commit/9fbd8ad73d1d2f5fca58a4dcc73b92ad6daa97ee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rebuild the phone Browse sheet around its hierarchy. Overview, Chat and Admin gather into one block above the groups instead of sitting between them, group headers become section-heading rows with the chevron leading rather than muted captions with a `+` at the far edge, and groups rest open so the sheet fills with destinations. A filter over every destination replaces the display line that named the sheet, the way out becomes a quiet round control, and a count that needs the operator is set in the accent while an item tally stays quiet. A folded group still names the destination you are in.

## 0.2.0-alpha.379

### Patch Changes

- [#252](https://github.com/rizom-ai/brains/pull/252) [`6ff0d0b`](https://github.com/rizom-ai/brains/commit/6ff0d0b18388509dc907519d46dd26ca06e0256e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move multi-target content generation out of the site plugin and into the shell, so sites, books, courses, and other sectioned compositions share one schema-first pipeline. `shell/content-service` now validates structured destinations, checks template capability and existing output, applies force and dry-run semantics, and enqueues admitted work. Generated entities receive domain-owned metadata instead of mandatory route and section fields, and a generation-only template with no React layout can generate and persist non-web content.

  Destinations use structured `idPath` segments with a shared entity-path codec that serializes to the stored entity ID only at the persistence boundary, so callers never concatenate separators. `plugins/site-content` becomes a site adapter that keeps route discovery and filtering while delegating planning, admission, and persistence.

  Entity-service gains atomic absent/revision preconditions, so a stale or retried job conflicts instead of overwriting a later edit; no table or migration is added. Durable jobs carry the trusted caller, resolved account, and an admission-time permission ceiling; authority is resolved when the job starts and again at the entity write boundary, where revocation blocks persistence. Scoped retrieval fixes knowledge and identity reads to the authorized output visibility, so public output uses public retrieval even for an admin caller.

  Admitted children share one root job ID, which is the returned batch ID, so the queue's existing durable root index recovers them after a restart. Generation jobs run at most once: they are enqueued without retries and never fail after their commit, so an interrupted worker leaves a failed job to re-run rather than regenerating or resurrecting output. The job queue itself is unchanged.

  External authors reach the capability declaratively through `@rizom/brain/services`: generation definitions on service templates, `content.target()` handles bound to public entity definitions with inferred metadata, `content.generate()` for heterogeneous targets, and `contentGenerationResultSchema` for tool output. Completion is observed by reading the destination entity through existing typed readers.

  The brain's own command line now has one identity, `service:brain-cli`, shared by the bundled runtime and the monorepo runner, and every brain grants it admin by permission rule at the app layer. Admission takes the lower of that rule and the level the CLI asserts, so `--permission` still lowers a call, and a job admitted from the CLI re-resolves the same authority at its write. Before this the monorepo runner asserted no level at all, and no brain granted the CLI anything, so any tool that enforces entity-action policy refused it.

## 0.2.0-alpha.378

### Patch Changes

- [#251](https://github.com/rizom-ai/brains/pull/251) [`053304f`](https://github.com/rizom-ai/brains/commit/053304fba16abb9ab7db2e6d76dcd9889d2d157b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add default-off, admin-authorized guest access on the deployment's preview origin, using shared execution bounds and durable lifetime accounting. Repeated activation, cleanup and restarts cannot replenish the two-message/$4 total allowance.

  Serve explicitly declared guest routes and their presentation assets on preview without granting admission or exposing other APIs. Keep management on the authenticated primary origin and deny primary-host guest execution. Preserve owned history and deletion after allowance exhaustion.

## 0.2.0-alpha.377

## 0.2.0-alpha.376

## 0.2.0-alpha.375

## 0.2.0-alpha.374

### Patch Changes

- [#245](https://github.com/rizom-ai/brains/pull/245) [`1469e09`](https://github.com/rizom-ai/brains/commit/1469e09de8c3f63fe91b5c534bd3b86e19e427fe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Empty the Chat composer when the message enters the transcript rather than when the server answers, and restore the draft if the send is refused. Give the library collection and the Chat session index one search field: live, debounced, with its own glyph and clear control instead of a label line and a submit button. Filters move into a panel that does not push the collection down, a filtered collection says how many entries matched, and the session index drops its duplicate labels and its always-present pager.

## 0.2.0-alpha.373

## 0.2.0-alpha.372

## 0.2.0-alpha.371

### Patch Changes

- [#242](https://github.com/rizom-ai/brains/pull/242) [`b00ff46`](https://github.com/rizom-ai/brains/commit/b00ff46c99f42f5bafbec870db28cd1d4624cfc1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Clarify stopped, disconnected, and failed Studio Chat responses while retaining partial output and staging retries for review instead of automatically resending. Restore collection page position through URLs and editor navigation, derive readable document labels from Markdown headings without changing stored content, support content-first mobile entry and Save keyboard shortcuts, and retain successful Chat uploads when other files fail with per-file retry and supported-file guidance. Add server-backed conversation search across titles and messages, paginated active/archived session access, and explicit session rename with recoverable failures while preserving conversation ownership boundaries. Add server-side collection search, visibility/status filters, stable created/updated sorting, and filtered counts; preserve the complete query across refresh, paging, and editor return, with distinct feedback for empty filtered results. Associate save validation errors with their fields and reveal/focus invalid Properties on phones without changing drafts. Add explicit image-upload retry/dismiss, filename and completion feedback, and guards against late saves or uploads affecting another record. Improve Markdown with local syntax highlighting, clearer tables, and keyboard-scrollable overflow regions while preserving copied code. Distinguish empty collections, unavailable destinations, expired sessions, and permission/read failures with explicit, draft-preserving recovery guidance. Improve keyboard navigation with a skip-to-content control, correctly linked main/tab landmarks, focusable conversation and preview regions, and clearer focus treatments. Improve muted-text contrast across Studio and its portaled controls, and avoid referencing missing navigation panels or dialog descriptions. Unify primary page-action emphasis while keeping clean Save available with a quieter outline; retain confirmation styling and subordinate row actions. Remove the redundant Sessions trigger beside the desktop rail without losing access when the rail is absent, and size tag inputs to fit their placeholder at desktop and phone font sizes. Move narrow-screen Working set content into a shared dialog without shrinking the conversation, preserving composer drafts and restoring focus after dismissal or resizing. Unify page-heading insets, level-one title scale, divider, and action placement across Studio while retaining pinned Save and independent editor scrolling. Remove conflicting shared-input padding so tag placeholders remain fully visible. Unify Studio secondary titles, section headings, and uppercase labels through shared compiled type roles, including navigation, editor/publication labels, and hosted card/table headings while retaining other renderer hosts' defaults. Remove Overview's duplicate navigation leaf so its content uses the direct-destination layout.

## 0.2.0-alpha.370

### Patch Changes

- [`cd1def4`](https://github.com/rizom-ai/brains/commit/cd1def4434c2fb9d56fbb7dcfad39eeffd8b0c3a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Report guest execution reservations that are still active past their deadline. `GuestAdmission.cleanup()` returns the removed and uncertain counts, and guest maintenance raises the same operator alert for uncertain execution work that it already raises for uncertain credential writes, after committing its pruning pass. The reservation itself is never released: only the verified recovery procedure may do that, so abandoned turns no longer wedge concurrency or budget silently.

## 0.2.0-alpha.369

### Patch Changes

- [`71104c6`](https://github.com/rizom-ai/brains/commit/71104c6a81203861b0d684c62b1e40980bed8777) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add default-off anonymous Ask using the shared Chat runtime, with visitor-owned conversations, atomic admission, bounded public retrieval, source cards and receipt-based history recovery. Reuse the existing hero chat box with retained drafts and explicit recovery controls.

  Account guest query embeddings inside the turn cap without disabling semantic indexing. Enforce trusted loopback transport and ready-index checks for the local-test preset. Production guest admission remains closed; this release does not authorize live spending or include the paused clock changes.

## 0.2.0-alpha.368

### Patch Changes

- Increase Studio collection pages to 25 entries and keep pagination controls above the records. Add reader-aware Chat scrolling with Jump to latest, retryable read errors that preserve drafts, clearer save status with expandable sync diagnostics, and conflict comparison with rescue copying and explicit draft replacement confirmation.

## 0.2.0-alpha.367

### Patch Changes

- [#241](https://github.com/rizom-ai/brains/pull/241) [`5e04477`](https://github.com/rizom-ai/brains/commit/5e04477d22f5d63d0f0e05c935e1ad3cfcf2cfcb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release Studio entity pagination and refined editor rendering, including independently scrolling editor panes and improved Markdown presentation. Align the affected visual baselines with the reviewed CI captures and updated pagination fixtures.

## 0.2.0-alpha.366

### Patch Changes

- [#240](https://github.com/rizom-ai/brains/pull/240) [`c1662af`](https://github.com/rizom-ai/brains/commit/c1662af0aface6d4f3b976f7eae90ea706da410a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Issue a packaging-only runtime version for a shared immutable image containing the existing Smoke, Docs, and Rizom site/theme package pins. This preserves the Studio implementation from alpha.365 and enables a smoke-first rollout of the same image to Docs and Rizom. No runtime implementation changes are included.

## 0.2.0-alpha.365

### Patch Changes

- [#239](https://github.com/rizom-ai/brains/pull/239) [`4dba750`](https://github.com/rizom-ai/brains/commit/4dba750e83322faa22aa608c32504c115ea15907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reduce Studio chrome noise: remove repeated access pills, page eyebrows, area explanations, singleton markers, and duplicated workspace totals. Simplify Chat and Account introductory copy. Library rows keep publication state as plain text rather than pills, show sync backlog once instead of repeating routine commit status, and leave internal identifiers in hover details. Preserve permissions, warnings, actions, and explicit navigation collapse behavior.

- [#239](https://github.com/rizom-ai/brains/pull/239) [`4dba750`](https://github.com/rizom-ai/brains/commit/4dba750e83322faa22aa608c32504c115ea15907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refine Studio workspaces using existing theme fonts and public block contracts. Use provider-owned compositions with shared StyleX cards, columns, record typography, facts, and notices. Add validated record presentation roles and collapsible supporting sections instead of workspace-specific rendering branches. Place Overview activity alongside attention, prioritize publishing failures and sync issues, remove redundant pipeline diagrams, and separate Site preview and production into explicit tabs while retaining permission checks and production confirmation.

  Compose Overview as an attention list and compact activity feed, with technical and system details available on demand. Separate the publishing queue from failures, give Account independent profile and security columns, and place Chat's session list and conversation beneath a consistent workspace heading. Preserve passkey protections, session actions, and browser navigation preferences. On phones, open Chat sessions in a shared dialog with focus restoration rather than a second navigation dock. Match the mockup's authored-message typography, wrapped session titles, bounded workspace measure, and human-readable activity timestamps without introducing typefaces.

  Remove Account's two handwritten stylesheets and its local style injection in favor of compiled StyleX. Group Content sync diagnostics by operation, preserving every recorded message, path, and timestamp; app hosts disclose long warnings on demand. Flatten repository facts without repeated totals or meters, retain commit debounce and exact commit identifiers, and show readable working-tree statuses with their original codes. Explicitly disclose partial changed-file lists and disable Sync now during active runs. Use the production provider for Content sync visual fixtures.

  Begin the shared renderer and Dashboard StyleX migration with reusable fact rows, notices, cards, columns, record copy, and text links. Keep host density independent of schema-declared editorial, attention, activity, and standard roles. Compile the shared runtime entry and static stylesheet before consumption, deliver its CSS through Studio assets and Dashboard's stylesheet, and remove the migrated fact and notice selectors. SSR uses precompiled classes without a DOM or runtime compiler.

  Replace native Chat's handwritten layout sheet with compiled StyleX. Preserve per-session drafts and attachments in mounted Studio memory, guard departures, and retain received text when stopping a stream. Adopt new conversation routes only after acceptance so rejected first messages remain reachable. Keep the composer inside its working room when the Working set disclosure opens. Align Account profile and security records with the shared typography, timestamps, and supporting disclosures.

  Give Site publication a shared featured card, separate current build failures from the published generation, and fold render history and bounded route references beneath it. Pair the current environment's open link with its build control in a shared card footer. Keep preview and production actions distinct, disable duplicate UI requests during active builds, and retain production confirmation and permissions. Disclose Publishing failure diagnostics and retries behind an attention summary; show destinations as descriptions and queue position/schedule as metadata. Use production Site and Publishing providers over seeded source records in visual fixtures, rather than handwritten view payloads.

  Replace Administration's People, Invitations, and Audit tables with shared record lists and query-backed inspection. Keep Account, person management, protection, and review links in the trailing record controls; fold external brains, access reference, and delivery capabilities. Preserve filtered/deep-linked records, pagination, invitation lifecycle controls, protected Anchor actions, and exact audit identifiers. Resolve audit subjects from recorded user references without exposing arbitrary event metadata. Use actual providers over disposable auth data in browser fixtures instead of hand-composed Administration payloads. Give comfortable supporting disclosures separated, touch-sized triggers while retaining compact Dashboard density.

  Refine Overview and Inbox against the separate screen studies. Group attention metadata and source links beneath the copy, keep supporting disclosures contiguous, and avoid repeating current failure diagnostics in the activity feed. Give Inbox a concise totals line with source availability, inline priority/time metadata, and source-owned text actions beside flexible record copy. Move its pagination below the collection, omit redundant single-page controls, and retain navigation out of emptied later pages. Compile shared filters and pagination with StyleX, remove their old renderer/Studio responsive CSS, and use production providers over seeded source inputs for visual fixtures.

  Migrate Dashboard's public header, masthead, and section navigation to shared compiled StyleX components and delete their handwritten CSS. Preserve guest/sign-in destinations, climate control, no-JavaScript anchors, keyboard/hash navigation, and count badges. Style selected tabs from ARIA state and provide 44px phone entry-link targets. Keep long identities bounded and verify production SSR without a DOM or StyleX loader. Move page framing, section panels/headings, and the colophon into shared compiled components, deleting their old CSS. Preserve no-JavaScript section headings and host-owned documentation/operator destinations; give footer links 44px phone targets. Compile StyleX only once, then embed its collected stylesheet into the compiled JavaScript instead of recompiling source in the embedding pass.

  Move Dashboard's public summary, map, system, and widget card frames and headings to shared compiled panels. Preserve standard, tight-phone, and edge-aligned insets, direct status accessories, source copy, and native content/navigation. Compile the responsive public card grid, delete replaced global card/header/grid CSS and map/system padding overrides, and remove the unused class-based `CardHeader` export from the private UI library. Preserve the registered proximity visualization's responsive query using the shared `operator-panel` container. Require the CSS embedding pass to emit the public `dist/index.js` entry so builds cannot silently leave stale executable code behind.

  Compile Dashboard overview paragraphs, status copy, empty states, and linked/unlinked summaries through shared panel-body components. Reuse shared totals with a responsive ledger presentation and remove the entire legacy overview stylesheet. Preserve source ordering, positive-count filtering, URL safety, cross-source deduplication, limits, and native destinations. Give public contact links 44px phone targets and visible keyboard/hover feedback; bound long labels and badges without dropping their text.

  Move System's primary/supporting panel layout, reference facts, and public availability rows to shared compiled columns, facts, and status components. Delete their replaced layout/row/status selectors. Retain native exact timestamps, zero counts, public-only metadata, availability tones, ordering, deduplication, and the five-row bound; health and totals still consider all advertised surfaces. Keep reference presentation independent of density and bound long metadata values.

  Finish System's StyleX migration with shared snapshot summaries, binary readiness indicators, ordered stages, semantic checks, and status pills; reuse shared totals for the edge-aligned band and panel paragraphs for supporting notes. Delete the entire System stylesheet. Keep update metadata visible on phones, retain full operation identifiers/diagnostics and host-owned health interpretation, and verify degraded/waiting states through the production Dashboard renderer. Isolate the pinned Bun 1.4.0 media-tokenizer JIT workaround to the compiler subprocess so larger style collections compile reliably without changing application runtime settings.

  Move Dashboard map frames, atlas summaries, canvases, responsive SVG roots, decorative coordinates, and empty states into shared compiled components. Delete their replaced map selectors. Preserve source totals, independent territory/index/label limits, exact SVG descriptions and geometry, source-owned focus behavior, both Network rendering paths, and separate phone crops. Keep registered provider visualizations authoritative and verify full-width empty maps without fabricating readiness or data.

  Compile map legends and territory indexes through shared components with explicit marker/tone props and native ARIA selection. Keep legend category interpretation and precedence in Dashboard, preserve full source labels, ranking and counts, and remove replaced legend/index CSS plus the mirrored active button class. Give phone territory controls 44px targets and keep dense-list guidance in flow beneath remainder copy. Validate the dense fixture through the public runtime schema while retaining its point/zone/relationship references.

  Move the remaining Dashboard SVG paint, typography, and animations into shared native SVG components and remove the entire map stylesheet. Keep category/status interpretation, sighting precedence, archived dimming, geometry, and full source values in Dashboard. Contours follow explicit group state rather than a styling class; reduced-motion marks stay visible and drawn. Bound and separate crowded territory labels using grapheme-safe visible abbreviation, retaining exact source titles, accessibility names, counts, IDs, and index records without moving nodes or contours.

  Move line-tab strips, triggers, and counts into shared compiled components, composed by both static operator tabs and UI-library widget tabs. Preserve native IDs, panels, source labels/counts, and host keyboard routing; selection paint follows ARIA even on hover. Bound overflow in narrow desktop panels, provide 44px phone targets and unclipped focus rings, respect reduced motion, and delete the 59 replaced Dashboard tab CSS lines. UI-library consumes the compiled shared runtime rather than adding another StyleX build pipeline.

  Compile pill tabs and filter controls through shared native choice components, removing another 108 Dashboard CSS lines. Keep filtering, search text, the twelve-option initial limit, selected overflow options, and empty-state interpretation in UI-library. Style selection from native ARIA rather than active classes and supply attention counts explicitly. Preserve native hiding, bound long labels, provide 44px phone controls and visible focus, and check both tab variants plus search/overflow/row restoration in Chromium.

  Compose widget action links through shared compiled navigation/link components. Preserve exact destinations, external target/rel behavior, full labels, and decorative indicators; provide bounded wrapping, 44px phone targets, visible focus, and reduced-motion-aware hover. Delete the replaced widget action rules and exercise native keyboard focus, external-link attributes, long labels, and actual ancestor hover in Chromium.

  Finish widget list and status-label migration through shared compiled components and delete the remaining 126-line widget stylesheet. Align record titles/descriptions/metadata with the standard 16/12/11 hierarchy, preserve exact source segments and full tags, keep zero description/trailing values in semantic slots, and bound long trailing statuses. Retain native list/filter attributes and hiding; UI-library keeps ordering, serialization, and status-tone interpretation. Add explicit label presentation to the existing shared status pill rather than another status renderer.

  Compile Dashboard body typography and climate-aware decorative layers through a shared native document-body component. Preserve the Paper/Instrument grain, vignette, layering, and pointer behavior. Remove the unused compatibility tab stylesheet, obsolete column entrance animation, and old theme-button overrides. Keep only the document reset; browser-check computed pseudo-element treatment in both climates. Move registered-widget invalid-data, empty, and pending messages to shared compiled paragraph presentation without changing wording or source conditions. Supply the immutable stylesheet to the standalone proximity site section and remove the final `.muted` rule. Give the shared renderer CSS an asset-specific declaration so downstream consumers do not need ambient CSS shims.

  Migrate CSS-renderer segmented tabs to shared compiled controls. Preserve native selection, count text (including zero), callbacks, and active-panel rendering; bound long labels and provide 44px phone targets and inset keyboard focus. Remove the replaced tab selectors. Migrate list filters to the same shared controls, preserving custom all-values, unclassified rows, counts, and empty states. Correct the leftover filter-container selector from tab migration and remove all replaced filter CSS. Explicitly map the contract’s `gap` emphasis to attention presentation; the former stylesheet incorrectly expected an `attention` source value.

  Compile action-form input, select, and checkbox-label presentation through shared StyleX, removing their legacy selectors. Use the configured console UI font rather than the undefined console-sans token. Preserve host control adapters, query-select styling, native validation, typed defaults, conditional labels, secret-field handling, and submission behavior; provide bounded fields, visible keyboard focus, and 44px phone targets without stretching native checkboxes.

  Compile action disclosure presentation through a shared native details/summary component, replacing the legacy disclosure stylesheet rules. Preserve native state and form edits, use immediate-parent open-state selectors to isolate nested disclosures, and provide bounded labels, visible keyboard focus, and 44px phone targets. App hosts retain their dialog adapter; presentation is explicit rather than inferred from class names.

  Compile action-result frames and definition-list facts through shared StyleX. Preserve declared-field projection, zero/false/null values, sensitive markers, polite announcements, and exact copy behavior. Bound long titles and values, expose complete values in native titles, and keep copy controls available at phone widths. Replace the old result selectors and browser-test the real mounted renderer rather than parallel result markup.

  Compile action-form grids and submit alignment through shared StyleX. Preserve two-column primary forms and single-column phone/sidebar forms, with bounded tracks for narrow regions. A named operator-aside container replaces legacy-class coupling while preserving physical portal boundaries and existing column markup; remove the replaced form layout CSS.

  Replace CSS-host action and confirmation button class generation with the existing shared compiled button vocabulary. Preserve native callbacks, disabled states, consequential-action confirmation, and row text actions. Bound long labels and honor reduced motion in shared buttons, including primary hover translation; verify real disabled and confirmation paths in the browser fixture.

  Compile table framing, cell hierarchy, alignment, native current-row paint, and compact-row visibility through shared StyleX. Preserve source-owned rows, values, links, actions, and compact eligibility. Keep unannotated rows in bounded scrolling tables at phone widths and align row controls explicitly. Remove replaced shared and Dashboard table rules; browser-test real mixed, fully annotated, and ordinary tables with exact row-action inputs.

  Remove audited obsolete Dashboard stats, filter-summary, alignment-class, group, and notice-modifier rules. Keep still-active renderer presentation instead of deleting by class-name resemblance. Move the remaining grouped-action alignment into its compiled style definition and remove the legacy action-group selector; guard retired selectors and production markup with regression assertions.

  Compile meter/progress layouts, typography, tone text, and native progress tracks/fills through shared StyleX. Preserve exact values, maximums, units, states, diagnostics, timestamps, zero, and absent-bar behavior; name native bars from authored labels. Retain bounded two-column card meters through a shared structural attribute. Remove replaced shared/Dashboard rules and Dashboard-only meter overrides. Test native data and all tones, plus production browser fixtures across widths and climates.

  Compile flow stations, connecting lines, captions, and details through shared StyleX. Preserve source order, statuses, direction metadata, full text, host caption slots, and card caption suppression. Bound station widths and keep active halos inside the scrolling desktop track; preserve vertical phone tracks. Remove replaced shared/Dashboard flow selectors; verify relational state paint and mutation, final-station line suppression, card scope, and overflow in Chromium.

  Finish shared notice framing: remove Dashboard-only box/paragraph overrides and the legacy notice class, explicitly own the left rule and zero other borders/radius in StyleX, and make compact gutters consistently override the base frame. Export the shared notice primitive. Preserve full text, line breaks, tones, links, and diagnostic disclosures; test both densities, untitled notices, all tones, and production browser composition.

  Compile spatial framing, canvas/overlay layout, SVG boundaries and relationship presentation, and radial center labels through shared StyleX. Preserve source geometry, viewBox/scaling, radii, relationship admission/tone precedence, and full labels. Remove replaced shared/Dashboard framing selectors while retaining point controls and caption/detail rules for their own migration. Verify both coordinate layouts and unchanged selection, related highlighting, focus, and Escape behavior in real browser fixtures.

  Finish the renderer/Dashboard presentation consolidation: compile spatial controls/captions/details, heads and standing status, action feedback, link placement, matrix cells, and empty states. Replace spatial state classes with native/explicit state attributes without changing relationship interpretation. Remove both legacy operator stylesheets and the old renderer stylesheet export; hosts consume the compiled asset only. Preserve source matrix column counts with working responsive stacking. Reuse the app UI confirmation modal with viewport portals and explicit caller-owned outside dismissal, retaining pending protections and custom confirmation classes.

  Complete Studio-owned StyleX presentation: library/records, editor fields and uploads/tags, source/preview/assist controls, Streamdown prose slots, publication controls, save/conflict/pipeline feedback, document/page-head placement, and responsive editor layout. Remove the remaining legacy Studio sheets and React style tags; retain only host document viewport rules and a scoped static CodeMirror vendor boundary. Keep safe-link and code-block controls, editing/selection behavior, permissions, full values, and the single phone header Save action. Compose control overrides explicitly through shared `xstyle` props, preserving native classes and dynamic variables without atomic-class order conflicts. Check desktop/tablet/phone presentation, disabled structured values, tag targets, and real upload/delete/invalid/conflict workflows; keep PNG approval separate.

  Add validated provider-authored `actionsLabel` for grouped list/matrix actions and `disclosureLabel` for disclosure cards. Publishing supplies “Queue options” and “Review failure”; failure headings/metadata remain visible independently of the trigger. Preserve full diagnostics and retry/removal/reorder controls through host disclosure adapters. Remove menu labels when permissions remove all actions, reject invalid/misplaced labels, and retain existing generic presentation when labels are omitted.

  Use explicit lightweight link triggers for subordinate grouped row actions in both app sheets and native disclosures. Preserve available/disabled choices, source labels, action execution, native open state, and dialog behavior; keep phone targets at least 44px high. No workspace-specific styling or inferred provider labels are introduced.

  The joint workspace review also removes inherited responsive padding and scrolling from embedded renderer frames, with desktop/tablet/phone regression coverage, and presents Site publication status as a flat section rather than a feature card without changing its facts or actions.

  Include React UI sources in the lint task's cache inputs so UI-only edits cannot reuse stale lint results.

  Keep the Overview activity section visible with an honest empty state when attention exists but the in-memory activity feed is empty after restart. Retain the combined quiet state when both are empty. Cover this mixed state separately instead of relying only on populated synthetic activity.

  Check empty, streaming, outage, build-failure, and dense source states through disposable production-provider fixtures. Combine Overview's empty attention/activity explanation; show Chat's retained-draft guidance despite its disabled history query, without an empty Working set. Avoid claiming an Inbox all-clear when sources are unavailable. Admit complete diagnostic records using the existing 100,000-character source-text bound rather than the 4,000-character prose bound, preserving long build failures and their final identifiers. Give shared phone dialog close controls 44px targets and matching heading clearance. Remove empty Chat session rails and Publishing queue tabs, and give an empty Inbox actionable guidance without a redundant pager while retaining selected source content across filters. Place Site failures and active builds above the supporting columns, with shared spacing between successive tab blocks in both hosts. Preserve default visual cases and keep scenario captures separate from unapproved PNG baselines.

  Apply the reviewed Overview / Chat / Library / Work / Admin / System navigation. Keep Account profile-only, preserve admitted attention counts and collapse preferences, and remove empty leaves on direct destinations. Route Account through the existing draft guard; same-page profile and primary navigation retain edits and session/tab queries. Keep mobile Browse groups independently collapsible without a duplicate dock. Compile the complete shell header and profile menu styling with StyleX, delete its handwritten sheet, and let workspace headings use the available canvas instead of retaining the old two-rail width cap.

## 0.2.0-alpha.364

## 0.2.0-alpha.363

## 0.2.0-alpha.362

## 0.2.0-alpha.361

## 0.2.0-alpha.360

### Patch Changes

- [#234](https://github.com/rizom-ai/brains/pull/234) [`38386e9`](https://github.com/rizom-ai/brains/commit/38386e9cb20ba080f599f4e920ccb8044f727cff) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Issue a packaging-only runtime version for a fresh immutable image containing the Rizom homepage rail restoration. No runtime implementation changes are included.

## 0.2.0-alpha.359

### Patch Changes

- [#233](https://github.com/rizom-ai/brains/pull/233) [`b0d505a`](https://github.com/rizom-ai/brains/commit/b0d505ae95a878826f2f17fa61196e2b7b4541f9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Issue a packaging-only runtime version for a fresh immutable fleet image containing the Rizom homepage promotion. No runtime implementation changes are included.

## 0.2.0-alpha.358

### Patch Changes

- [#232](https://github.com/rizom-ai/brains/pull/232) [`89ae051`](https://github.com/rizom-ai/brains/commit/89ae05168ccc679a179051f177f29dd24d6b5bcd) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Issue a packaging-only runtime version for a fresh immutable fleet image containing the Rizom topbar background correction. No runtime implementation changes are included.

## 0.2.0-alpha.357

### Patch Changes

- [#230](https://github.com/rizom-ai/brains/pull/230) [`08746a1`](https://github.com/rizom-ai/brains/commit/08746a13a5544edb308013aaa52e1a5cb25c7c64) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Issue a packaging-only runtime version so the immutable, runtime-version-keyed fleet image can include the updated Rizom site background fix. No runtime implementation changes are included.

## 0.2.0-alpha.356

### Patch Changes

- [#228](https://github.com/rizom-ai/brains/pull/228) [`2942793`](https://github.com/rizom-ai/brains/commit/294279346c136b884af281392e4743b91464517f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Support a content-authored h1 or h2 in proximity-map headings so the living-memory hero can provide the page heading. Existing section maps retain their default h2 heading.

## 0.2.0-alpha.355

### Patch Changes

- [`06ff050`](https://github.com/rizom-ai/brains/commit/06ff050e26b0db643d59323096ac81b82a02367e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep Studio's system navigation coherent by grouping the Style Guide with other brain machinery, preserving the desktop rail while editing, and resetting the document offset when selecting rail destinations.

## 0.2.0-alpha.354

## 0.2.0-alpha.353

### Minor Changes

- [`3ba5b39`](https://github.com/rizom-ai/brains/commit/3ba5b398215a0b6e69bfdab755a1777b2fac85a8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the cross-product console strip with authentication-state chrome: anonymous Dashboard pages receive a public identity masthead, authenticated operators enter Studio directly, and Studio owns one responsive context, command, and identity header across its workspaces.

## 0.2.0-alpha.352

## 0.2.0-alpha.351

### Minor Changes

- [`bd3a718`](https://github.com/rizom-ai/brains/commit/bd3a718f80ae2d51fb1afc157a139a5b1d422b6a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `/chat` the canonical authenticated native Studio Chat route without an encoded-workspace redirect, and move the standalone guest-facing Web Chat surface and its static assets to `/ask`.

### Patch Changes

- [#216](https://github.com/rizom-ai/brains/pull/216) [`58abb61`](https://github.com/rizom-ai/brains/commit/58abb61a25e9aa2d5b8cc45defebfb61cd4da086) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an explicit shared fleet image contract so Build emits one immutable image per effective Brain version, installs the version-wide union of exact site and theme package pins, rejects conflicting pins, and keeps Build and Deploy on the same tag contract.

  Ship React declarations with the public Brain package so packed consumers can typecheck the React-backed service view contract.

## 0.2.0-alpha.350

### Minor Changes

- [`401ad40`](https://github.com/rizom-ai/brains/commit/401ad4006eb0fb1054a86e618d0473842648fd4e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Unify authenticated app controls around statically compiled StyleX and Radix primitives, make Studio, Web Chat, and Dashboard consume the active Brain theme through shared semantic tokens, and package the generated application styles with the browser bundles. Preserve Dashboard's server-rendered CSS boundary and integrate the native Studio Chat workspace with the shared control and asset contracts.

### Patch Changes

- [#213](https://github.com/rizom-ai/brains/pull/213) [`03ee6c8`](https://github.com/rizom-ai/brains/commit/03ee6c80afaac5ea72e415beb0eb7a4a48dccfc9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Avoid falsely failing a projection-rule job when a concurrent coordination sweep has already completed its wave.

## 0.2.0-alpha.349

### Minor Changes

- [`62f8fda`](https://github.com/rizom-ai/brains/commit/62f8fda906f869e456d4d879266d8eb62e9d37de) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore `@rizom/brain/chat` as the headless Chat domain and transport contract after its temporary alpha rollback. The restored surface uses neutral `Chat*` names and provides versioned schemas, bounded API paths, bounded session context locators, a stateless stream decoder, and a fetch-injected client without exporting presentation logic. Keep that decoder aligned with emitted redacted tool-result events while leaving transient presentation status host-owned. Add the capability-gated native Studio Chat working room, durable Inbox context handoff, and conditional `/chat` redirect while retaining standalone Web Chat for Chat-only composition.

## 0.2.0-alpha.348

### Patch Changes

- [#212](https://github.com/rizom-ai/brains/pull/212) [`a83bc11`](https://github.com/rizom-ai/brains/commit/a83bc11cb9af7e1f499d58dd8cb4cf3538807823) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Detect active durable jobs whose types are absent from the finalized execution inventory and report operational health as degraded. Add an exact, confirmation-gated operator recovery command that can terminally retire only known pre-scheduler projection jobs after atomically proving they have no attempt ownership or partial progress.

## 0.2.0-alpha.347

### Patch Changes

- [`7acc0c9`](https://github.com/rizom-ai/brains/commit/7acc0c935b0cee5881e746bbb71d2cafaef2dd78) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Redesign the public Dashboard knowledge map as a calmer semantic atlas with collision-relaxed territory contours, restrained source marks, compact projection metrics, and a keyboard-focusable ranked territory index.

## 0.2.0-alpha.346

### Minor Changes

- [#210](https://github.com/rizom-ai/brains/pull/210) [`03ab79e`](https://github.com/rizom-ai/brains/commit/03ab79e0adbd6bfcef6b486ba67eaef8389007da) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the prematurely published `@rizom/brain/chat` entry and restore standalone Web Chat to its prior internal transport contract.

## 0.2.0-alpha.345

### Minor Changes

- [#209](https://github.com/rizom-ai/brains/pull/209) [`2dd75e8`](https://github.com/rizom-ai/brains/commit/2dd75e873689ca6d425d42aa8f2598bc8d8e2245) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish `@rizom/brain/chat` as the browser-safe, framework-neutral Chat domain and transport contract. The new subpath provides versioned schemas, bounded API paths, and a fetch-injected client for conversations, messages, streaming, uploads, approvals, actions, progress, and durable job status without exporting React, routing, cache, storage, or other presentation logic.

## 0.2.0-alpha.344

### Patch Changes

- [`f574291`](https://github.com/rizom-ai/brains/commit/f574291f157b5488ffd97ee408f07b60528a3268) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore System as the final public Dashboard tab with responsive public-health, runtime, surface, semantic projection, and render-check summaries while keeping private diagnostics and operator activity out of the card.

## 0.2.0-alpha.343

### Patch Changes

- [#205](https://github.com/rizom-ai/brains/pull/205) [`5c2a8e3`](https://github.com/rizom-ai/brains/commit/5c2a8e35478c5d3d6fe26873d48bd2ff0a53e8f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish a new immutable Brain artifact for fleet images built on the required Bun 1.4 runtime.

- [#206](https://github.com/rizom-ai/brains/pull/206) [`5e7d4d9`](https://github.com/rizom-ai/brains/commit/5e7d4d9880451d1c18ddbf4878315e638e01fae1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Gate stateful deployments on a canonical verified rollback snapshot covering online SQLite captures, exact Git checkout state, deployed configuration, and sanitized container metadata.

## 0.2.0-alpha.342

### Minor Changes

- [#203](https://github.com/rizom-ai/brains/pull/203) [`edd7b41`](https://github.com/rizom-ai/brains/commit/edd7b41e1f47d25d99b3758d3f370d04e8911dfa) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Extend Studio's declarative operator contract with collection-owned query controls, source-declared compact table rows, and one explicit top-level primary action. Expose each admitted workspace's host-enforced permission floor, render one Studio-owned page head across declarative and fixed surfaces, co-locate Audit and Invitations controls with their tables, reflow annotated collections behind a two-bar phone chrome, and place each explicit primary action in the desktop head or phone action bar without provider-authored security text or heuristic action hoisting.

## 0.2.0-alpha.341

### Patch Changes

- [#199](https://github.com/rizom-ai/brains/pull/199) [`a2f6ce1`](https://github.com/rizom-ai/brains/commit/a2f6ce12f60c67068b38d4ed32a523267b2a435f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Include an explicit template render version in static-site input fingerprints so output-affecting template changes invalidate retained generations.

## 0.2.0-alpha.340

### Patch Changes

- [#198](https://github.com/rizom-ai/brains/pull/198) [`00aaaf7`](https://github.com/rizom-ai/brains/commit/00aaaf7723322c8000e07e964bb81de64941a2e3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Derive the docs homepage freshness label from the latest documentation entity update instead of displaying a hardcoded month.

## 0.2.0-alpha.339

### Patch Changes

- [#196](https://github.com/rizom-ai/brains/pull/196) [`997d4ac`](https://github.com/rizom-ai/brains/commit/997d4acba2b44a59a9f135f8cc1a01769aa26c1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden site build status against lost writes: reconcile from the queue's recent jobs even when no lifecycle write ever landed, restore in-flight builds to the projection, clear active entries for jobs the queue no longer knows, report the published generation from one shared schema, and derive dashboard state, detail, and tone from a single precedence walk so retained failures can never masquerade as the current attempt.

## 0.2.0-alpha.338

### Patch Changes

- [#195](https://github.com/rizom-ai/brains/pull/195) [`41bbca4`](https://github.com/rizom-ai/brains/commit/41bbca479421b3319ab7d3a8c3485b27db83a5b1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make Site build status truthful: reconcile active attempts from the durable job queue whenever Studio or Dashboard loads, record unchanged-input jobs as skipped instead of successful renders, keep previous failures attached to their own attempts, and report the generation selected by each active output manifest.

## 0.2.0-alpha.337

## 0.2.0-alpha.336

### Minor Changes

- [#191](https://github.com/rizom-ai/brains/pull/191) [`e526178`](https://github.com/rizom-ai/brains/commit/e526178dea6d429a7e7725cfbda68e81eeda43c8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retire the unused Commerce initializer and product entity capability. The remaining recipes are headless, personal, professional, and team.

## 0.2.0-alpha.335

### Patch Changes

- [#189](https://github.com/rizom-ai/brains/pull/189) [`bffda4d`](https://github.com/rizom-ai/brains/commit/bffda4dd53ddcb1907a5c5deaa7e3e944a835098) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace Croner with Bun's in-process cron scheduler and rename `CronerBackend` to `BunSchedulerBackend`. Content pipeline schedules now use standard five-field cron expressions; six-field expressions with seconds are rejected with a migration error.

- [#189](https://github.com/rizom-ai/brains/pull/189) [`b6840d1`](https://github.com/rizom-ai/brains/commit/b6840d1ca54abffde71984818756c31b9e71a9f5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Contain generated deployment, canonical development, and one-shot runner process trees with Bun's `--no-orphans` flag. Existing graceful signal forwarding, runtime drain order, and Git process-group ownership remain authoritative; the flag only handles abrupt parent loss and descendants left after normal shutdown.

## 0.2.0-alpha.334

### Patch Changes

- [#186](https://github.com/rizom-ai/brains/pull/186) [`8e08960`](https://github.com/rizom-ai/brains/commit/8e089602356c04c2547eb33d4c0f684c94f84813) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Build packaged Brain entrypoints with the production React JSX transform so production runtimes never call the development-only `jsxDEV` export.

## 0.2.0-alpha.333

### Minor Changes

- [#182](https://github.com/rizom-ai/brains/pull/182) [`df72bcf`](https://github.com/rizom-ai/brains/commit/df72bcf07a0d196ecb1a41297a88fa2b67c2b0d4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rename the browser authoring surface from CMS to Studio. Replace the plugin id, package, routes, workspace runtime, and public operator authoring exports with Studio-named contracts; migrate canonical brain configuration with `brain config migrate`; and retain permanent deep-path redirects from `/cms` to `/studio`.

### Patch Changes

- [#182](https://github.com/rizom-ai/brains/pull/182) [`0290b90`](https://github.com/rizom-ai/brains/commit/0290b90b4cd7a0925696530b05c6ec54c152d926) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make Admin the source owner for its Audit, People, Invitations, and Peers Studio workspaces without introducing an Admin/Studio package dependency. Add roster detail, Anchor posture, role/status/credential/session/channel administration, peer-first invitations, person-peer linking, prepared confirmations, actor attribution, and ephemeral setup links while retiring the duplicate Admin React views.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`35f7f8c`](https://github.com/rizom-ai/brains/commit/35f7f8c7ba2c59d8dbe52406866add5813b8a7b0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden the tabbed Administration composition with fail-loud named sections, child-declared action routing, stable workspace status, and query-resetting tab changes. Redesign Invitations around the pending/history list with head totals, collapsed creation disclosures, peer-specific provenance, and channel-selected destination labels.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`548f35e`](https://github.com/rizom-ai/brains/commit/548f35ea48ea5c23d0e31bc8fbf0f1533aaa4e16) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Consolidate access administration into one query-backed Studio workspace with People, Invitations, and Audit tabs, one aggregate rail badge, legacy deep-link aliases, peer provenance and unlink controls, and per-tab provider loading. Pin Overview in the rail and rename Directory Sync's entry to Content sync.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`1fc7982`](https://github.com/rizom-ai/brains/commit/1fc798229c946dad335b7489d440fb16a66ce960) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rebuild Dashboard as the anonymous public brain card with fixed Overview, Knowledge, and Network tabs. Scope holdings and declarative providers to Public visibility, keep authenticated sessions from changing card content, preserve the mockup's four-card identity, contact, holdings, and skills Overview, and host source-fed knowledge and agent-proximity maps in Dashboard. Mount the agent domain's registered first-party visualization in the fixed Network slot while retaining the declarative spatial view as a closed fallback.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`8b10704`](https://github.com/rizom-ai/brains/commit/8b107040ea95cb3e87d8ae1bebd8dc3876f84c75) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Consolidate server-rendered JSX on React 19 and React DOM's static renderer, preserving semantic HTML output while removing the parallel Preact runtime.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`005f3c0`](https://github.com/rizom-ai/brains/commit/005f3c04b7c3cc3b255178ff9f507bda7508b344) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move self-service Account into Studio as an active-session Public-floor workspace with a fixed lazy host renderer while preserving the auth-service `/auth/account/*` contracts and WebAuthn ceremonies. Replace `/account` and `/admin` with permanent Studio redirects, remove the independent browser bundles and console doors, reject retired Admin route configuration, retain Admin as a headless workspace provider, and package every manifest-listed Studio split chunk.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`06808e9`](https://github.com/rizom-ai/brains/commit/06808e9b0e4e0f117b8dd0f22bb298a008e19ec6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move Audit presentation into an Admin-only built-in Studio workspace with URL-backed filters and event detail. Keep `/auth/admin/audit` and audit authority in auth-service, and remove only the retired Admin app view and client query wrapper.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`1cf0261`](https://github.com/rizom-ai/brains/commit/1cf0261201397a48daec93a497ea55cb03ba6045) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Admit every active session to the Studio shell while keeping entity authoring Trusted, repository diagnostics Admin-only, and workspace providers behind host-enforced permission floors that default to Trusted. Add active-session admission facets to console, endpoint, and interaction descriptors so anonymous Dashboard visitors do not see Studio while active Public-rank people do.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`c433540`](https://github.com/rizom-ai/brains/commit/c4335408c46179ac33ef79912207de250c0da59b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add schema-driven declarative workspace action forms and bounded ephemeral result presentation. Move invitation creation, delivery, retry, cancellation, manual confirmation, setup-link presentation, and peer-invite handoffs into the Admin-only Studio Invitations workspace while keeping auth-service authoritative. Query Audit pages and action counts in the auth store and share canonical workspace query/date helpers.

- [#182](https://github.com/rizom-ai/brains/pull/182) [`c28974c`](https://github.com/rizom-ai/brains/commit/c28974c7fe745d57b00f3c1d1ec5c49973d8e135) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the Trusted-floor Studio Overview workspace as the operator home. Re-home non-public declarative Dashboard widgets into Overview without changing provider definitions, aggregate their attention badges and launch links, surface failed jobs and expiring invitation setup links, show recent entity/job activity plus system and network state, and keep the public Dashboard from invoking restricted widget providers.

## 0.2.0-alpha.332

## 0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- [#178](https://github.com/rizom-ai/brains/pull/178) [`64f112e`](https://github.com/rizom-ai/brains/commit/64f112e170ca39f36764eadfba69421d6fc50bdb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Adopt Bun 1.4 across the runtime and published brain package. Replace Sharp image optimization with `Bun.Image`, replace Playwright media rendering with `Bun.WebView`, enable measured test parallelism, make time-based tests deterministic, and apply SQLite busy timeouts before contended WAL initialization.

## 0.2.0-alpha.329

## 0.2.0-alpha.328

## 0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- [`d229280`](https://github.com/rizom-ai/brains/commit/d229280a2016bb721559c1ecc2efe74533e1f9d2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Accept Claude Code and Claude Desktop as OAuth clients. Loopback redirect URIs declared without a port in a client ID metadata document now match any port, per RFC 8252 section 7.3, and grant types the server does not support are dropped from a metadata document instead of rejecting the whole document.

## 0.2.0-alpha.325

## 0.2.0-alpha.324

## 0.2.0-alpha.323

## 0.2.0-alpha.322

## 0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- [`657bec2`](https://github.com/rizom-ai/brains/commit/657bec2e521e5feb72b30d817a88939e3eb80372) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Advertise and support OAuth Client ID Metadata Documents for MCP clients, with exact redirect validation, cache-aware and SSRF-hardened document fetching, issuer-bound Dynamic Client Registration credentials, and `application_type` redirect constraints. Keep the deprecated Dynamic Client Registration endpoint available as a compatibility fallback.

- [`0d67c84`](https://github.com/rizom-ai/brains/commit/0d67c840b9cf8276f9f460d825f8a8b6dded93f3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Externalize the MCP server SDK from the bundled Brain runtime so stateless protocol negotiation and permission-scoped server factories share one SDK class identity.

- [`81e8f76`](https://github.com/rizom-ai/brains/commit/81e8f767a67e1efcdb585b3929635b35c6519214) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Adopt the MCP TypeScript SDK v2 packages, serve stateless 2026-07-28 and legacy HTTP requests from one permission-scoped factory, and remove HTTP session state and eviction machinery. Remote Brain CLI calls now negotiate the modern protocol with legacy fallback.

## 0.2.0-alpha.319

### Minor Changes

- [#157](https://github.com/rizom-ai/brains/pull/157) [`54eb85b`](https://github.com/rizom-ai/brains/commit/54eb85b05e0d58c1cd02b83456015d8abf7f0c26) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Require `bundleContract: capability-bundles-v1` before resolving the canonical capability taxonomy so overlapping legacy bundle IDs cannot silently change meaning. Standalone migration now requires an explicitly reviewed recipe, while fleet crossover staging binds each expected pilot/cohort source selection to an exact target and preserves separately reviewed site/theme pins.

### Patch Changes

- [#157](https://github.com/rizom-ai/brains/pull/157) [`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the four-bundle canonical composition contract with eight capability bundles plus the policy-only `team` bundle. Activate the headless, personal, professional, team, and commerce recipe ladder; migrate checked-in apps, eval suites, and legacy migration output to the new selections.

- [#157](https://github.com/rizom-ai/brains/pull/157) [`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prepare the canonical brain for a headless core. The resolver now derives MCP stdio or HTTP transport from webserver selection while preserving explicit instance overrides, and posture-independent CLI/MCP permission rules live on the brain definition rather than member-scoped bundle contributions.

- [#157](https://github.com/rizom-ai/brains/pull/157) [`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Stage the target headless, personal, professional, team, and commerce eval ladder with member-compatible seed content and deterministic startup coverage. Every retained case is categorized for one compatible recipe or an explicit runtime requirement, inherited suite config no longer implies inherited cases, and eval shutdown settles case-triggered jobs before closing the runtime. Curated eval seeds can opt into strict entity-type validation so unsupported fixture content fails startup instead of being skipped.

- [#157](https://github.com/rizom-ai/brains/pull/157) [`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow policy-only bundles to contribute configuration, permissions, and eval exclusions to any active member of the brain catalog. Unknown and inactive targets remain rejected or omitted, and cross-bundle conflicts still require explicit overrides.

- [#157](https://github.com/rizom-ai/brains/pull/157) [`cedf87d`](https://github.com/rizom-ai/brains/commit/cedf87d16c76292695b86ea38eb1e52dfeffd70d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align the repository release toolchain and generated standalone/fleet Docker runtime on Bun 1.4.0 so reviewed instance configurations, operator scaffolding, and published Brain artifacts are validated against one runtime version.

## 0.2.0-alpha.318

### Patch Changes

- [#162](https://github.com/rizom-ai/brains/pull/162) [`5ae10a8`](https://github.com/rizom-ai/brains/commit/5ae10a882c77ee3a9a9603df07ad1769d8a1326d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep Git authoritative for durable entities by deleting database rows that have no valid or quarantined source file, exporting scheduler projection writes through normal entity lifecycle events, preserving projection provenance across unchanged imports, and preventing skill derivation from deleting or overwriting authored skills.

## 0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- [#161](https://github.com/rizom-ai/brains/pull/161) [`2af139c`](https://github.com/rizom-ai/brains/commit/2af139c90e5a85cbe0577947581d32f67471a886) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist per-entity projection-output ownership so directory startup cleanup preserves scheduler-derived entities that intentionally have no source files. Transfer authority to ordinary and file-backed writes, including matching no-op imports, and backfill safe ownership from completed projection history during migration.

## 0.2.0-alpha.315

### Patch Changes

- [`efa711c`](https://github.com/rizom-ai/brains/commit/efa711cfa7a63fc9fac9da586f9e7f749fe53b76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make public package-load, configuration, and composition-conflict diagnostics identify the failing owner and field or capability with a corrective action. Inventory and typecheck every stable authoring TypeScript example, and add an exact-version, credential-gated live authoring harness for semantic retrieval, agent conversation and confirmation, lazy attachments, durable progress, bounded shutdown, and secret-safe diagnostics.

## 0.2.0-alpha.314

### Patch Changes

- [#158](https://github.com/rizom-ai/brains/pull/158) [`6b81a2c`](https://github.com/rizom-ai/brains/commit/6b81a2c6549d36dc4d0eda96c6128113cec79fd3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bound projection coordination during durable import roots by using a read-only active-barrier check for ordinary mutation wakeups, reserving full batch recovery for startup and periodic recovery sweeps, and scheduling one projection wave after the final child closes the root.

  Prevent recovery-triggered wakeups from recursively entering their own coordination sweep. Retry idempotent durable-batch enqueue state writes across transient SQLite contention without masking the original enqueue failure. Add explicit skill and SWOT derivation controls so directory-sync acceptance runs can enforce a genuinely external-AI-free posture.

## 0.2.0-alpha.313

### Patch Changes

- [`c6f8f9e`](https://github.com/rizom-ai/brains/commit/c6f8f9e5e16a1fc136b065d6092e57ec11bf9c73) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reject content-owned anchor profile kinds now that profile kind selection and live content have completed the composition-owned fleet cutover.

## 0.2.0-alpha.312

### Minor Changes

- [`9cdd447`](https://github.com/rizom-ai/brains/commit/9cdd447bf6a253153cb804542b397a04c2dd68db) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Give operator workspaces the composition their surfaces need. The view head gains a kicker, description and standing status; stat items gain a caption; and two container blocks arrive alongside `tabs` and `detail`: `columns`, which pairs a column of work with a rail of standing facts, and `card`, which groups related panels under one caption. Directory Sync, Site, Publishing and Unified Inbox are converted onto them.

  The Inbox collection is reworked for triage: rows carry what is scanned plus the verbs that clear an item, while follow-ups and the reading pane's actions live beside the content they belong to. Paging replaces a "Load more" control that replaced the page rather than appending to it, and an open row surviving a page turn no longer invalidates the view.

## 0.2.0-alpha.311

### Patch Changes

- [#151](https://github.com/rizom-ai/brains/pull/151) [`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Resolve directory-sync environment references inside the dedicated Git broker process before broker host startup.

  Packaged deployments can continue to keep the remote credential in `GIT_SYNC_TOKEN`: the broker resolves the configured reference from its inherited environment, retains the credential only in broker memory, and injects it into each Git network child without persisting it or sending it over the broker protocol.

- [#152](https://github.com/rizom-ai/brains/pull/152) [`a0d20c0`](https://github.com/rizom-ai/brains/commit/a0d20c0df955db7c76404889cf1ab8731cf4eee0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serialize projection coordination sweeps and keep live durable-root recovery read-only so periodic reconciliation does not contend with active import mutations under sustained load.

  Delay lost-callback repair until terminal jobs have had a bounded settlement grace, distinguish legitimately long-lived durable roots from expired callback leases in operational health, and make the packaged soak prove complete process-tree cleanup without waiting forever on an affected Bun completion.

## 0.2.0-alpha.310

### Minor Changes

- [`360d66e`](https://github.com/rizom-ai/brains/commit/360d66e1981bbc0789424213b91083bc4f46cf99) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add master/detail composition to the operator view contract. A `detail` container pairs one collection with the panels of whichever row is open, selection is derived from the open row rather than flagged per item, and a `detail` link target opens a row through canonical query state instead of a workspace navigation. The host renders two panes on wide viewports and a single-pane drill-down on narrow ones. Unified Inbox is converted onto the contract, retiring the `inbox-open-detail` launch intent and the built-in workspace path helper it depended on.

### Patch Changes

- [`756f45b`](https://github.com/rizom-ai/brains/commit/756f45b8ccf9a4d39983d077dd8113752c8929d4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Coalesce explicit Directory Sync mutation batches into one durable projection wave, fence overlapping whole-corpus derives before atomic apply, recover abandoned callback and worker-owned boundaries, and expose bounded projection-batch diagnostics. Narrow service-plugin entity access so scheduler and durable-owner internals remain shell-owned.

## 0.2.0-alpha.309

### Patch Changes

- [#149](https://github.com/rizom-ai/brains/pull/149) [`152859c`](https://github.com/rizom-ai/brains/commit/152859c1b3c0cd1537d22ba96aa6e337501c750f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Close semantic Git broker recovery gaps found during affected-runtime acceptance.

  Replacement generations now keep mutation admission closed until repository and durable
  queue/checkpoint state are reconciled. Request IDs are bound to the exact checkout and
  operation arguments, journal failures return correlated terminal errors, and app roles
  proactively reconcile a lost owner without replaying ambiguous mutation intent.

  Development, chat, startup-check, and supervised runtime paths all use a separate broker
  process with complete process-group cleanup. The packaged broker now runs from a lightweight
  entrypoint instead of loading a duplicate full Brain bundle, preserving the established RSS
  envelope while retaining safe replacement and full-runtime fallback behavior.

## 0.2.0-alpha.308

### Patch Changes

- [`4611fe7`](https://github.com/rizom-ai/brains/commit/4611fe754f59a945ef20f6de9836ff8767947404) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restyle host-rendered CMS operator workspaces in the console's editorial idiom: a display-face head that carries the workspace's leading totals, layout width derived from each semantic block's meaning, and hairline separation in place of uniform cards. Workspace confirmations now use the in-app CMS dialog instead of a browser prompt, and action controls take their weight from consequence rather than rendering identically. The public authoring contract is unchanged.

## 0.2.0-alpha.307

### Patch Changes

- [`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Hand the Git broker's absolute checkout path to every app role alongside its socket.

  Directory Sync now uses the broker-owned path instead of resolving a relative shell data directory again in another process. This prevents development and supervised runtimes from failing plugin initialization with `This broker owns no checkout` when their process working directories differ.

## 0.2.0-alpha.306

## 0.2.0-alpha.305

## 0.2.0-alpha.304

### Minor Changes

- [`62aa30f`](https://github.com/rizom-ai/brains/commit/62aa30f84be1f9e1cfdbab98d1071d56fe443891) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add universal host-rendered Dashboard and CMS authoring semantics, typed workspace query state and catalogs, prepared confirmations, and built-in conformance through the public operator runtime. Remove the retired private widget/workspace renderers and browser assets so first-party and external surfaces share one validated host path.

## 0.2.0-alpha.303

### Patch Changes

- [`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Own every managed Git operation in a supervised broker process.

  Web and worker no longer execute Git. A broker owns each checkout, serializes
  complete operations rather than individual commands, and is started before any
  Git-capable role — so two processes can no longer interleave inside one commit.
  A lost Git completion fails closed: the operation stays owned and is never
  retried or unlocked in place. The supervisor detects a wedged owner by
  heartbeat silence or stale operation progress, terminates its process group,
  and starts one replacement only after an OS probe proves that group absent;
  when absence cannot be proven it exits the runtime for external cleanup rather
  than risking a second writer.

  Credentials are supplied per process and never persisted: a token configured in
  a remote URL is separated from the address before anything logs, clones,
  fingerprints, or configures `origin`, and inherited credential helpers are
  refused. Managed operations run with repository hooks and automatic maintenance
  disabled.

## 0.2.0-alpha.302

## 0.2.0-alpha.301

## 0.2.0-alpha.300

## 0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- [#145](https://github.com/rizom-ai/brains/pull/145) [`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded email threading metadata and ship explicit confirmation-gated sending for saved reply-draft revisions. Recipients, subjects, and reply headers are resolved from fresh mailbox source reads; stable per-revision idempotency and persisted provider acceptance keep retries safe without storing original messages.

## 0.2.0-alpha.297

### Patch Changes

- [#144](https://github.com/rizom-ai/brains/pull/144) [`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rename the email workflow package, add destination-resolved source-specific Inbox follow-ups, and ship private locator-backed IMAP detail reads plus an Admin-only reply drafting workspace. Original messages remain mailbox-owned and non-persistent; only operator-authored reply drafts are stored.

## 0.2.0-alpha.296

## 0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- [#139](https://github.com/rizom-ai/brains/pull/139) [`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fold new-mail triage into the shared Inbox, retire the parallel Email Triage CMS workspace, advertise the mounted Inbox as an Admin interaction, and link new-only email Dashboard counts to canonical source-scoped Inbox filters while retaining history in Mail Items.

## 0.2.0-alpha.293

### Patch Changes

- [`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Run public declarative Dashboard widgets through a host-owned runtime and semantic renderer. Providers receive canonical caller facts, secret-redacted current-account settings, visibility-scoped entity reads, typed jobs, and request/lifecycle cancellation; the runtime validates data and views, owns finalization, rollback, and shutdown, remains inert without Dashboard, and excludes execution-only workers.

## 0.2.0-alpha.292

### Patch Changes

- [#137](https://github.com/rizom-ai/brains/pull/137) [`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded source-scoped Inbox facets with source-owned vocabularies, validated item values, shared workspace and headless filtering, canonical facet URLs, selected-source CMS controls, and category, priority, and reply facets for new mail.

## 0.2.0-alpha.291

### Patch Changes

- [#136](https://github.com/rizom-ai/brains/pull/136) [`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Run background jobs with schema-configured bounded parallelism and honor the existing topic source-change batch delay before projection-wave admission, preventing parallel imports from causing repeated full-corpus topic extraction.

## 0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- [#132](https://github.com/rizom-ai/brains/pull/132) [`ddc0d0c`](https://github.com/rizom-ai/brains/commit/ddc0d0cd2cf4990ae8e917d390e551da92982b60) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add encrypted per-account plugin settings, schema-derived Account forms, and runtime-owned `forAccounts` daemon supervision for declarative service and interface packages.

## 0.2.0-alpha.288

### Patch Changes

- [#128](https://github.com/rizom-ai/brains/pull/128) [`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add destination-owned Inbox follow-up kinds with finalized app-scoped registration, permission- and capability-gated universal launches, bounded same-origin history-state handoffs, CMS note capture and source-entity navigation, and web-chat composer prefill without automatic send or save.

## 0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- [#129](https://github.com/rizom-ai/brains/pull/129) [`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Hold the account-settings secret boundary in the type system and refuse operator declarations until their runtime exists. Settings reaching a widget, workspace, or action now omit every field declared `secret`, since operator data is serialized to the browser, and each settings schema field must carry a field declaration so `secret` is a decision rather than an omission. A service declaring account settings, dashboard widgets, or CMS workspaces now fails to install with a message naming the missing runtime instead of registering nothing, matching how an account-bound daemon already refuses.

## 0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- [`a840b5c`](https://github.com/rizom-ai/brains/commit/a840b5c05389e727c8e5acae3f6c0bcbdb85e78c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make stalled background work visible and recoverable: expose durable worker and due-queue status, persist configured worker-session expiry, fail the runtime after worker restart-budget exhaustion, persist bounded generation-linked projection incidents, and require operational health in post-deploy verification and fleet status.

## 0.2.0-alpha.283

### Patch Changes

- [#122](https://github.com/rizom-ai/brains/pull/122) [`017e9fb`](https://github.com/rizom-ai/brains/commit/017e9fb8ae86aab887a0cefd3501d145caa203a0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist throttled directory Git progress, preserve interrupted pull handoffs for startup replay, and expose request-driven stale-pull degradation through operational health without coupling routing readiness to repository reachability.

## 0.2.0-alpha.282

### Patch Changes

- [#117](https://github.com/rizom-ai/brains/pull/117) [`5abe56d`](https://github.com/rizom-ai/brains/commit/5abe56d8b361d23d85c22aa2fdb61a49c97ae6ff) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist a repository- and branch-scoped directory-sync Git reconciliation checkpoint, replay checkout changes that merged before their import batch was queued, preserve remote-only deletion authority, and advance DB-origin export commits only after push.

## 0.2.0-alpha.281

## 0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect recognizable Inbox senders to verified People identities. Normalize privacy-safe inbound email identity resolution, derive bounded sender labels without retaining mailbox addresses, carry a structured optional contact through the Inbox contract, and link resolved contacts to the exact person through the registered Admin surface while keeping Dashboard and digest projections redacted. Consume shared Dashboard widget primitives from the UI library rather than importing across plugin boundaries.

- [#111](https://github.com/rizom-ai/brains/pull/111) [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the dedicated Admin CMS Inbox workspace with bounded server filters and paging, list/detail triage, source-entity navigation, access-checked rail badges, and server-gated action confirmation. Reduce Dashboard to a redacted five-entry read-only summary, route Dashboard and daily digest navigation to the custom CMS workspace mount, retain `inbox_list` as the conversational read surface, and remove the superseded Dashboard mutation route and script.

## 0.2.0-alpha.278

### Patch Changes

- [`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep HTTP route snapshot bindings available across the separately bundled runtime entrypoints so canonical brains can start their webserver reliably.

## 0.2.0-alpha.277

## 0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- [#101](https://github.com/rizom-ai/brains/pull/101) [`145761b`](https://github.com/rizom-ai/brains/commit/145761bf398e67161b4a4bcbad09aa60fea8e345) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prevent Git pull and push subprocesses from leaving unmanaged automatic-maintenance descendants while retaining normal maintenance for local Git commands.

## 0.2.0-alpha.274

### Patch Changes

- [#99](https://github.com/rizom-ai/brains/pull/99) [`ea55df8`](https://github.com/rizom-ai/brains/commit/ea55df836408c0d4111e69198d71a5775c1835ce) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep large remote-deletion pulls convergent by returning when the Git command exits even if a detached descendant retains its output pipe, batching targeted delete jobs in groups of 50 while accepting existing single-delete jobs, and isolating the packaged import soak from external AI work.

## 0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- [#92](https://github.com/rizom-ai/brains/pull/92) [`2c9cc6f`](https://github.com/rizom-ai/brains/commit/2c9cc6f38bfbd054baaf11b0d147ce7ae5c06bc9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Introduce schema-backed package definitions, typed `use()` composition, object-referenced bundles, and declarative entity packages for the stable `0.2` authoring API. Entity definitions now compose runtime fields, generated markdown adapters, optional typed codecs, and scheduler-owned projections. Installed package metadata and peer compatibility are resolved by the loader, including external brain definitions booted from packed artifacts.

  Bundled instances can explicitly disable provider-backed semantic indexing while retaining lexical full-text search. Exact bundled tool invocation supports structured input, generated confirmation replay, and explicit permission scopes.

  Declarative service packages now infer setup state and config, expose schema-first tools with plain typed output, and register durable typed jobs with queue-owned retries, deadlines, progress, cancellation, status, and restart recovery. Resources, prompts, templates, views, and cleanup remain lifecycle-owned.

  `@rizom/site` is now the sole site-authoring SDK, with canonical `defineSite()`, schema-first sections, a blessed schema vocabulary, initial content validation, and runtime-derived structural validation. App-managed builds preserve package CSS, global head scripts, and static assets. The removed alpha `@rizom/brain/site` subpath and `@rizom/site-sections` workspace package have no compatibility facade. Brand-specific `Rizom*` layout and chrome types are owned by `@rizom/site-rizom`, not the base SDK.

  Generic and message interfaces now use declarative definitions for schema-validated routes, protocol authentication, canonical caller permissions, typed cross-package job enqueue, supervised daemon health and shutdown, channel registration, outbound delivery, normalized send/edit behavior, lazy attachments, and runtime-owned conversational progress. Declarative brains receive the shared HTTP host when they compose a generic interface, while interface plugins remain excluded from worker processes.

  This intentionally removes alpha-only root and plugin authoring exports including `PLUGIN_API_VERSION`, class-first plugin APIs, tuple/factory contracts, factory package loading, and the root Zod convenience export. Family authoring entries own their blessed schema helpers.

## 0.2.0-alpha.271

### Patch Changes

- [#93](https://github.com/rizom-ai/brains/pull/93) [`05e5df4`](https://github.com/rizom-ai/brains/commit/05e5df4583e7da138b927611557b50b6b23798f5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep remote Git deletions authoritative by suppressing late entity exports until targeted delete jobs complete, reconciling files that survive a remote delete/modify merge, and covering concurrent cleanup in the packaged import-burst soak.

## 0.2.0-alpha.270

### Patch Changes

- [#91](https://github.com/rizom-ai/brains/pull/91) [`38ca87e`](https://github.com/rizom-ai/brains/commit/38ca87e4ebe34f30abfe34f22cda42c27debae08) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bound text and legacy binary directory imports with a configurable `maxImportFileBytes` limit (5 MiB by default), skip oversized files before reading or parsing them, and expose those skips as operational import issues without moving the source files.

## 0.2.0-alpha.269

### Patch Changes

- [#90](https://github.com/rizom-ai/brains/pull/90) [`bbc7f08`](https://github.com/rizom-ai/brains/commit/bbc7f0834c241fde76d996224d7ef4392f94ab77) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Skip deserialization and schema validation when imported file content already matches the stored canonical hash, while still importing document sidecar metadata changes and reusing the prefetched entity lookup.

## 0.2.0-alpha.268

### Patch Changes

- [#89](https://github.com/rizom-ai/brains/pull/89) [`eb42c08`](https://github.com/rizom-ai/brains/commit/eb42c089f3af3432375cd1ec45b943a862c5ddeb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Suppress directory watcher echoes before auto-export creates, updates, or deletes entity files, including document sidecars, to avoid redundant re-import work.

## 0.2.0-alpha.267

### Patch Changes

- [`1f94bde`](https://github.com/rizom-ai/brains/commit/1f94bdee59ea9e5a3b352657b1c74c36ca2af3ea) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bump @modelcontextprotocol/sdk to 1.30.0, the v1 maintenance release with SSE keep-alive lifecycle fixes, stricter Content-Type validation, and security-advisory dependency updates.

## 0.2.0-alpha.266

### Patch Changes

- [`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Behavior-preserving quality refactors: shared SerialQueue/KeyedSerialQueue primitive in @brains/utils replacing five hand-rolled promise-tail mutexes; directory-sync stress system split into command runner, git checkout, and health monitor modules; job-queue worker heartbeat/deadline/error-callback dedup and table-generic schema column helpers; consolidated pilot starter staleness detection; single-pass HTTP route registry views; projection wave planning simplification with indexed graph edges.

- [`f3987de`](https://github.com/rizom-ai/brains/commit/f3987de9284e09c8e6b693cc68a537f67467c884) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add first-class `public`, `shared`, and `restricted` visibility to `system_create` so agent-backed interfaces can save non-public notes and uploads without rewriting exact source material. Preserve the requested scope through confirmation, permission checks, direct persistence, and asynchronous upload promotion, and add personal/team routing eval coverage.

  Let Trusted collaborators capture notes and links on every posture, not only on a team brain. The platform baseline is `"*": admin`, and only the team bundle granted those types, so `system_create` was offered to a Trusted caller and then refused with "Creating `note` requires Admin permission". The core bundle now grants `note` and `link` at Trusted for create and update, leaving delete, extract, and publish with Admin. Public callers remain unable to create either type.

## 0.2.0-alpha.265

### Patch Changes

- [`db855c1`](https://github.com/rizom-ai/brains/commit/db855c121ac191ef1dbb3713ba321a43e9fcee50) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Run all network Git operations (pull, push, ls-remote, clone) through Bun-owned, process-group-scoped children with stall timeouts, guaranteed reaping, and credential-redacted errors — so large directory imports cannot leave unreaped Git processes or deadlock the web runtime.

## 0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- [`cfbec3b`](https://github.com/rizom-ai/brains/commit/cfbec3b4dcafc5d67f7f905d2c4fd3bf082df600) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Serialize durable job deduplication in explicit database write transactions across queue clients and processes. Validate duplicate requests before selection, reserve projection budget only for committed inserts, and preserve in-flight enqueue transactions during service shutdown.

## 0.2.0-alpha.262

### Patch Changes

- [`e45aba7`](https://github.com/rizom-ai/brains/commit/e45aba721f635b79e79c25a439a4598e17c19852) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reconcile prior generated deploy scripts on init rerun, so existing standalone and fleet repositories pick up the scoped health watchdog installer (and future script updates) instead of keeping the vintage they were scaffolded with. Content that no longer carries the generated-script fingerprint is treated as owner-customized and left untouched.

## 0.2.0-alpha.261

### Patch Changes

- [#88](https://github.com/rizom-ai/brains/pull/88) [`d2ee712`](https://github.com/rizom-ai/brains/commit/d2ee71207bf8f60d66136bcc1e86b21fa787f28c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Finalize plugin HTTP routes into one immutable, collision-checked shell registry before the shared webserver starts. Preserve existing handler and tool precedence while rejecting malformed or reserved routes, avoiding per-request getter traversal, and failing closed before non-public tool routes execute. Remove the unused standalone API server so all routes continue through the shared host. Remove the aggregate `/health` endpoint after migrating probes to `/health/ready`; operational app metadata is now reported by `/health/operate`.

## 0.2.0-alpha.260

### Patch Changes

- [#87](https://github.com/rizom-ai/brains/pull/87) [`46f31a0`](https://github.com/rizom-ai/brains/commit/46f31a0b72c4c8a4efe35d63eb31caaae3515027) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Scope the host health watchdog to unhealthy containers carrying the explicit Brain ownership label, and label generated standalone and fleet runtime images accordingly.

## 0.2.0-alpha.259

## 0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- [#85](https://github.com/rizom-ai/brains/pull/85) [`d273d5e`](https://github.com/rizom-ai/brains/commit/d273d5e902005fc509f2d57ce9000d5b16f7a538) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep durable jobs pending until a capable worker can execute them, recover projection waves whose queued jobs are terminal, and report stranded projection waves through operational health.

## 0.2.0-alpha.256

### Minor Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace event-owned derivations with durable scheduler-owned projection waves, atomically journal entity mutations, memoize immutable effective inputs, reconcile derived embeddings, trigger automatic site builds only at successful wave boundaries, remove the obsolete manual extraction tool, normalize optional undefined site data at the JSON boundary, and begin same-bundle runtime supervision with a lightweight parent that owns migrations, the web child lifecycle, bounded IPC readiness, and signal escalation.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Validate scheduler-owned projection composition before runtime startup, propagate causal operation provenance across jobs and entity mutations, persist bounded projection circuit diagnostics into readiness, and add schema-validated projection-rule and entity-database wave coordination contracts.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate dependency-free liveness from runtime readiness, expose bounded process and queue health signals, terminate unrecoverable job workers, and add Docker plus restart-budgeted host supervision to generated deployments.

### Patch Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist fenced job progress and terminal updates for bounded, indexed cross-process publication, and mark internal subscriptions required by durable execution separately from ordinary ingress subscriptions.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bound background job execution with per-handler deadlines and required cancellation signals. Persist worker sessions and renewable attempt leases, fence completion, failure, progress, and heartbeat writes by unique attempt token, and immediately recover attempts when a stable worker slot starts a replacement session.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden deployed process ownership by draining aborted Git subprocesses, cancelling and awaiting active Git work during directory-sync shutdown, bounding initialization network probes, and running the packaged Brain entry point under `tini`.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate web routing readiness from full operational health, expose durable worker-session degradation, and add `/health/operate` for operator alerting.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prevent derived entity feedback loops by excluding projection outputs from generic projection inputs by default and making SWOT a terminal projection output.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep SWOT projection inputs JSON-compatible when optional evidence is absent, and start each durable projection wave with a fresh causal root so successor waves cannot falsely trip repeated-lineage circuits.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split the bundled runtime into supervised web and durable execution children, with immutable handler inventory, execution-only plugin registration, web-owned enqueue validation, and budgeted worker restart isolation.

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Detect stuck durable workers with a five-second IPC heartbeat and replace them after three missed beats under the existing restart budget.

## 0.2.0-alpha.255

## 0.2.0-alpha.254

### Minor Changes

- [`757c902`](https://github.com/rizom-ai/brains/commit/757c90211ca9f263f879b458fdea7647789181e4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retire the private `@brains/rizom-ecosystem` package and remove its `rizom-ecosystem` capability from the canonical catalog. Rizom sites now own their ecosystem or faces content through their site section packages, and existing instances must remove `rizom-ecosystem` from `add` and any `rizom-ecosystem:ecosystem` template references.

## 0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- [#82](https://github.com/rizom-ai/brains/pull/82) [`2f8a48e`](https://github.com/rizom-ai/brains/commit/2f8a48eac1b316c44cd765ca35e9393ae856c78a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Register restricted derived mail items as the first unified-inbox source. New items are projected live with high-priority urgency and Admin-enforced reviewed, handled, and archive actions that reuse email triage's typed status workflow without persisting raw mailbox content or duplicate inbox state.

## 0.2.0-alpha.251

### Patch Changes

- [#81](https://github.com/rizom-ai/brains/pull/81) [`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the schema-first unified-inbox source contract, finalized app-scoped registry, and opt-in failure-isolating live aggregation DataSource. Sources retain ownership of attention state; the inbox stores no duplicate items.

## 0.2.0-alpha.250

### Patch Changes

- [#79](https://github.com/rizom-ai/brains/pull/79) [`246dcb8`](https://github.com/rizom-ai/brains/commit/246dcb8fe1f8abede1acf7fd00e5c946f9d22e3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move editable email-classification guidance from plugin configuration to the standard `email-triage:classification` prompt entity while keeping privacy and schema invariants code-owned.

## 0.2.0-alpha.249

### Patch Changes

- [#77](https://github.com/rizom-ai/brains/pull/77) [`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the shared inbound-email source reference contract and the opt-in email-triage capability. Meaningful inbound mail is conservatively filtered, classified into a restricted derived mail item, persisted before acknowledgement, and retried with a safe unclassified fallback without copying mailbox content into Brain storage or logs. Admins can review the derived queue through a typed CMS workspace, a combined-filter tool, status actions, and a compact dashboard contribution.

## 0.2.0-alpha.248

### Patch Changes

- [#78](https://github.com/rizom-ai/brains/pull/78) [`bf899db`](https://github.com/rizom-ai/brains/commit/bf899db444e357cdb00a82245107a0aa71b5f3f3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Compose standalone `src/site.ts` overrides over an explicit `site.package` base so canonical rebuilds retain the base site's plugin, templates, and datasources.

## 0.2.0-alpha.247

## 0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- [#76](https://github.com/rizom-ai/brains/pull/76) [`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add optional IMAP intake to the Email interface. Configured interfaces now connect to a read-only mailbox, parse MIME messages, publish the exported `EMAIL_INBOUND` contract, and persist an acknowledgement-gated, UIDVALIDITY-scoped cursor for at-least-once delivery. Poison messages no longer block later mail. Intake stays live through per-connection IDLE fallback and capped reconnect backoff, including failed initial connections, and enriches known senders through the auth principal registry. Outbound-only setups remain unchanged, and mailbox content, addresses, and credentials stay out of logs.

## 0.2.0-alpha.244

### Minor Changes

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add public `defineBundle`, transitional `bundles:` authoring, and deterministic bundle resolution behind the existing brain resolver. Bundle-aware definitions now compose capability selection, member config, instructions, eval exclusions, and validated permission contributions while preserving legacy presets, external plugins, local site conventions, and instance overrides.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Activate the single canonical brain contract: require explicit fixed bundles, scaffold recipes into visible instance configuration with composition-owned profile kinds, consolidate eval and runtime assets with suite-specific fixture directories, compose every registered agent-context provider, remove built-in model/preset selection, and replace versioned fleet formats with one strict canonical desired-state contract. Require exact hosted site and external-theme package pins, add temporary secret-free offline crossover staging, and move onboarding to its model-neutral package. Harden canonical model validation by preserving judge evidence, recording failed tool results, aligning migrated fixtures with canonical tools, and clarifying unmet-request, generation, and playbook-status routing. Eval runs without a locally built database drain seed-content ingestion before running turns; `--build-db` remains the fast path and its databases stay out of version control.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the package-owned canonical capability catalog, the model-neutral `core` bundle definition, and a consolidated canonical environment schema while leaving existing model selection unchanged until the coordinated crossover.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the canonical `site` and `publishing` bundle definitions, including deterministic dashboard routing, publishing defaults and instructions, bundle-owned eval exclusions, and a parallel explicit personal-posture fixture. Existing model selection remains unchanged until the coordinated crossover.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the canonical `team` bundle with shared-memory and topic posture, model-neutral team instructions, member-scoped trusted write policies, and explicit Admin-only delete, extract, and publish defaults. Add a parallel instance-owned team fixture and structural Relay migration characterization without changing legacy model registration.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prepare the clean brain-model crossover without activating it: add deterministic model/preset migration previews, explicit recipe expansion, a typed canonical model subpath, dormant runner/registry/packed-consumer support, and an opt-in next-schema migration preview for hosted desired state. Legacy runtime and ops loaders remain the only active paths until the coordinated crossover.

### Patch Changes

- [#73](https://github.com/rizom-ai/brains/pull/73) [`9c4150b`](https://github.com/rizom-ai/brains/commit/9c4150bedd802edb402ccac361a7348fc19f061c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden canonical sync routing, projection-owned summary safety, and argument-scoped negative evaluation assertions.

## 0.2.0-alpha.243

### Patch Changes

- [`84d70d7`](https://github.com/rizom-ai/brains/commit/84d70d7dfb222a3fd9223a45d13335da0d25ccf5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Unwrap `ZodDefault` when deriving section template field mappings. Fields authored as `z.string().nullable().default(null)` (as in `@rizom/site-rizom-ai`) threw at plugin-init time, which took down the whole site-package plugin and dropped every custom section from the build with missing-template warnings.

## 0.2.0-alpha.242

### Patch Changes

- [`97cb22d`](https://github.com/rizom-ai/brains/commit/97cb22d1702edeee99aa8a08356dc1a97f9bba2e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix site sections rendering empty when a query omits an optional value. Section content must be a JSON document, but the requirement was enforced only at the end of the build pipeline, so a schema declaring `.optional()` produced an explicitly-`undefined` property that the gate rejected by dropping the section with a warning. The blog and agent-discovery datasources returned `baseUrl: query.baseUrl`, and no first-party site sets `baseUrl`, so `writing/essays` and `network/directory` rendered empty on every build.

  Section and template schemas now model absence as `null`, template and datasource output is bound to JSON-object types so a non-JSON schema fails to typecheck, and the frontmatter writer drops `null` alongside `undefined` so authored markdown still round-trips as written.

## 0.2.0-alpha.241

### Minor Changes

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Retire the standalone Discord interface. `chat` is now the single chat transport for Rover, Ranger, and Relay, covering both Discord and Slack through the Chat SDK, and the Discord adapter wires itself up from `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and `DISCORD_APPLICATION_ID`.

  **Breaking for instances that configured `plugins.discord`.** The interface id `discord` no longer exists; move its settings under `plugins.chat.adapters.discord` and supply the two additional credentials, which the Chat SDK adapter requires:

  ```yaml
  plugins:
    chat:
      adapters:
        discord:
          botToken: ${DISCORD_BOT_TOKEN}
          publicKey: ${DISCORD_PUBLIC_KEY}
          applicationId: ${DISCORD_APPLICATION_ID}
  ```

  Permission rules and space selectors are unaffected — messages still arrive under the `discord:` namespace. Relay also declares the chat env vars for the first time, so its generated `env.schema.template` and `secrets push` candidates now include the Discord and Slack credentials it was already using.

### Patch Changes

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Let a brain definition select its profile kind. `profileKind` could previously only be set through an instance's `kind:` override, so no shipped brain selected one and the anchor profile always fell back to the base field schema. Rover's onboarding playbook writes `role` and `expertise`, and its starter content ships `expertise`, `currentFocus`, and `availability` — all kind-owned fields — so the persist validator rejected them and directory sync quarantined the profile. Rover now selects `professional`, Relay `team`, and Ranger `organization`; an instance `kind:` still wins. Also drops the `starterIdentity.anchorKind` config the three brains passed, which the profile plugin's schema silently discarded.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bring the chat interface to parity with the standalone Discord interface: a Discord speaker linked to a brain account now gets that account's permission level and anchor flag (with revoked bindings denied outright rather than falling back to permission rules), and unmentioned traffic in a configured space is captured into the space conversation without spending an agent turn.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a `dashboard` namespace to the plugin context so widgets register with `context.dashboard.registerWidget({ ... })` instead of addressing the message channel by hand. The namespace supplies `pluginId`, so a widget can no longer register under another plugin's id.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the `@rizom/brain/themes` subpath export. It existed so a standalone site repo could call `composeTheme` itself; that consumer (`apps/mylittlephoney`) is deprecated and no theme needs it — a theme is a CSS string, and the shell prepends the shared base when the brain resolves. The function is now internal to `@brains/theme-base` and named `withThemeBase`, which says which base it adds.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Converge the entity media attachment providers on shared factories. `@brains/media-page-composer` gains a `renderPrintablePdf` primitive alongside `renderOgImagePng` plus `createOgImageProvider`/`createPrintableProvider`, and the blog OG image provider moves off its hand-rolled temp-dir/server/screenshot path onto the shared pipeline it had drifted away from.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the singleton accessors from every shell-owned service. Services are constructed by the shell's layer graph and handed to their consumers, so `getInstance`, `resetInstance`, and `static instance` carried process-global state that outlived shutdown for no benefit. `EntityService` now requires the `entityRegistry` option instead of silently reaching for a global registry, and `brain operate` reports a boot that returns no brain rather than falling back to a global shell.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Extract the runtime-state status engine that directory-sync and site-builder each hand-rolled into `SerializedStatusStore` in `@brains/plugins`, on top of a shared `SerialQueue`. Fixes a latent race in site-builder's startup reconciliation, which read and wrote its status document outside the write queue and so could clobber a concurrent build mutation.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Share the shell's plugin AI namespace between entity and service contexts, and give the scoped service layers (entity-service, job-queue, conversation-service, runtime-state) one `scopedServiceLayer` helper instead of four hand-built acquire/release nestings.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix status badges rendering dark in light mode on rizom-themed sites. Both rizom brand themes declared the dark status palette at `:root`, which matches in both modes, so `.bg-status-*` / `.text-status-*` resolved to dark colours even with `data-theme="light"`. The palette now lives once in `@brains/theme-base`, keyed by `[data-theme]`, and the themes keep only genuine deltas.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `buildThemePackage` to `@brains/build-tools` so theme packages share one publish-artifact builder, and drop the `@theme inline` declarations the rizom brand themes restated verbatim from `@brains/theme-base`. The composed CSS is unchanged — verified by compiling both themes through the real Tailwind pipeline before and after.

- [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a shared `WidgetCard` shell to `@brains/ui-library` so dashboard widgets stop repeating their panel, title row, and empty state, and make `@rizom/ui` depend on `@brains/ui-library` instead of carrying byte-copies of `cn` and `renderHighlightedText`.

## 0.2.0-alpha.240

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. From this release on, `@rizom/brain` and `@rizom/ops` are licensed **AGPL-3.0-only**, while `@rizom/ui` remains **Apache-2.0** as part of the SDK/interface surface. Plugins, themes, and site packages built against the Apache-licensed interfaces (including type imports from `@rizom/brain`) are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

## 0.2.0-alpha.239

## 0.2.0-alpha.238

## 0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- [`4d9a36b`](https://github.com/rizom-ai/brains/commit/4d9a36b618782071c8fe3c685907fbd4767c34da) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `brain auth reset-passkeys --yes` atomically clear passkeys, WebAuthn challenges, sessions, authorization codes, refresh tokens, and global setup links from `auth.db` while preserving users, OAuth clients, signing keys, and untouched legacy backup files.

- [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the standalone Email Resend service with an outbound-first Email message interface. Email now owns its channel descriptor and configured Resend provider, Notifications remains channel-agnostic, channel registration is restricted to message-interface plugins, and brain configuration uses `plugins.email`; existing `plugins.email-resend` configuration must be renamed.

## 0.2.0-alpha.235

## 0.2.0-alpha.234

## 0.2.0-alpha.233

## 0.2.0-alpha.232

## 0.2.0-alpha.231

## 0.2.0-alpha.230

## 0.2.0-alpha.229

## 0.2.0-alpha.228

## 0.2.0-alpha.227

### Minor Changes

- [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist exact interface grants and Anchor bindings in private auth runtime storage, seed declarations only on first initialization, make connected accounts authoritative, keep the no-login channel allowlist out of the person-centered Admin console, and provide explicit access-only CLI recovery.

### Patch Changes

- [`219e273`](https://github.com/rizom-ai/brains/commit/219e27392f7322ba3349c8d234e42f537d02aa6e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the authenticated `/account` UI out of auth-service into a dedicated account console plugin. Keep session-derived account APIs in auth-service while giving self-service the shared console shell, climate, route-derived navigation, responsive React UI, and bundled runtime asset.

- [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

  Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the Admin-only People section in the standalone Admin console and migrate browser authentication from legacy operator terminology to role-aware auth sessions. Existing session rows and legacy browser cookies remain compatible through an explicit, release-gated migration window. Legacy dashboard `needsOperator` registration inputs remain accepted and normalize to `needsAttention`.

- [`7d18545`](https://github.com/rizom-ai/brains/commit/7d18545696fc5dd3908107cbeecc9bfdc2f17655) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare Anchor profile flavor in brain configuration, project person/team/organization into auth runtime ownership, remove runtime Anchor mutations, and resolve Admin-console names and CMS links from profile entities.

- [`ac0a860`](https://github.com/rizom-ai/brains/commit/ac0a86019965195895ac801f5d89599722062b7a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fold the account console into the admin package as a second plugin and browser bundle. Admin and account are two surfaces over the same people domain, so they now share one package, the detail-layout primitives, and one stylesheet, while keeping separate plugin registrations, admission levels, routes, and JS bundles — a non-admin browser still never downloads the admin SPA.

- [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add access-neutral links between local people and independent external peer brains, including atomic peer-first invitations and existing-account linking, without inherited roles, identity claims, or attribution. Because the former representation model never shipped outside the feature branch, replace it through a clean generated schema correction rather than a historical data-copy transform or permanent dual-read path.

  Replace the unreleased My agents and representation-consent flow with the permanent Overview, Members/People, Invitations, and Audit Admin sections. Show passkeys under Sign-in, verified human-facing email and Discord under Connected channels, and optional external peers as a separate account facet. Keep hosted members without peers profileless, retain CMS ownership of the Anchor profile, omit internal IDs and generic Advanced identity tooling, expose actor-attributed audit events through an Admin-only endpoint and plain-language viewer, and bridge approved directory peers into the Admin invitation flow. Keep the monitoring dashboard free of management UI and expose Admin through route-derived console navigation and the Admin-gated command palette.

  Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on supervised maintenance. Deprecate ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results; bulk-load the Admin roster without per-user query fan-out; avoid duplicate browser-session resolution in web chat; preserve hash-only setup-delivery dedupe per recipient; centralize legacy imports, private mutation guards, safe error projection, mutation feedback, and persisted SHA-256 encodings; and retain exact private identity reconciliation without exposing canonical provider subjects.

## 0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- [`0e83b5c`](https://github.com/rizom-ai/brains/commit/0e83b5c85b2f60d3659b06333ad8ae8bc68178cb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Canonicalize anchor kinds as `person | team | organization`, move kind-aware profile fields into the shared profile capability, add deterministic safe agent aliases with bounded context-generated characters and strict legacy-default backfill, add the singleton style-guide entity for data-driven voice and visual generation, and let site metadata select whether a site represents the brain or its anchor.

- [`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move optional semantic profile kind selection into `brain.yaml`, derive a closed structural category through an app-scoped finalized registry, validate profile persistence with the selected kind schema, and publish the new `{ kind, category }` A2A and ATProto card contract.

## 0.2.0-alpha.224

## 0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- [#70](https://github.com/rizom-ai/brains/pull/70) [`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refresh known ATProto agent cards from a daily recurring check, preserving local relationship metadata while updating remote-owned snapshots and centralizing domain message-channel constants.

## 0.2.0-alpha.221

### Patch Changes

- [#68](https://github.com/rizom-ai/brains/pull/68) [`5b7f0b5`](https://github.com/rizom-ai/brains/commit/5b7f0b5b0ea7586647d2c3bd98f69b78a4ad0bd6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align preview URL topology across runtime metadata and fleet deployment. Dedicated domains use `preview.<domain>`, while direct sites under the shared `rizom.ai` parent use `<site>-preview.rizom.ai` so both hosts remain covered by one-level wildcard TLS.

## 0.2.0-alpha.220

### Patch Changes

- [`470e240`](https://github.com/rizom-ai/brains/commit/470e2401c8cb87f27c464b840e26532098fedb9c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make topic source selection default-open with an excludeEntityTypes blacklist, add a secondary source role for discounted minting, remove model-level source allow-lists, and allow public notes to mint topics by default.

## 0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- [#66](https://github.com/rizom-ai/brains/pull/66) [`b840046`](https://github.com/rizom-ai/brains/commit/b8400466c02fa2c4b8b671a0467bea7a9577eab1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a public Rover site/theme pair for the hosted external-package canary. The site uses only the documented `@rizom/brain/site` contract and ships a deterministic well-known marker; the signal theme composes the default theme with a high-contrast, light/dark instrument-panel visual system.

  Preserve the real personal/professional site plugin instances returned by `@rizom/brain/site` so externally authored packages retain required runtime lifecycle methods. Align the Chat SDK and all adapters on 4.34 to keep their private nominal types compatible during the release checks.

## 0.2.0-alpha.217

## 0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- [`36bbb02`](https://github.com/rizom-ai/brains/commit/36bbb026b64734c099ea39853b1922208b73a6fb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Avoid exposing internal ground/source-kind class names in the knowledge map DOM; render quiet background marks as source context.

## 0.2.0-alpha.214

### Patch Changes

- [`7c26353`](https://github.com/rizom-ai/brains/commit/7c263531813efa805b40010b5c3e106cf312d681) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Simplify the knowledge map legend to topics, sources, and published work so the widget no longer exposes internal source-type jargon.

## 0.2.0-alpha.213

### Patch Changes

- [`0da54ac`](https://github.com/rizom-ai/brains/commit/0da54ace0708e3f5236ac76a598f8201504fbf9b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Remove the confusing unfiled knowledge map highlight and keep unassigned evidence styled by its normal entity kind.

## 0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- [`320061d`](https://github.com/rizom-ai/brains/commit/320061d6b494a66d57f3b1fa41b8c7dd68b1b50c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Finish aligning the knowledge map renderer with the latest cartographic mock labels, semantic links, unfiled callouts, and legend treatment.

## 0.2.0-alpha.210

### Patch Changes

- [`a067fc5`](https://github.com/rizom-ai/brains/commit/a067fc55548595d8f057774c97278c583cc5cf01) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align the knowledge map dashboard widget with the proximity-field visual treatment and remove hardcoded color fallbacks from its map styles.

## 0.2.0-alpha.209

### Patch Changes

- [`9e3fe42`](https://github.com/rizom-ai/brains/commit/9e3fe420c252e1aecb929fc94872bd50f39b9adf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add generic projection source roles to entity type configuration and make topic extraction use role-based source authority policies instead of package-specific entity type defaults.

## 0.2.0-alpha.208

### Patch Changes

- [`6b03c83`](https://github.com/rizom-ai/brains/commit/6b03c836ff153b56b52a37bf7198f4a22d032052) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Enforce the topic soft ceiling when semantic merge synthesis says an incoming topic is distinct, preventing corpus rebuilds from minting topics past the calibrated ceiling.

## 0.2.0-alpha.207

## 0.2.0-alpha.206

## 0.2.0-alpha.205

## 0.2.0-alpha.204

## 0.2.0-alpha.203

## 0.2.0-alpha.202

## 0.2.0-alpha.201

## 0.2.0-alpha.200

## 0.2.0-alpha.199

## 0.2.0-alpha.198

## 0.2.0-alpha.197

## 0.2.0-alpha.196

## 0.2.0-alpha.195

## 0.2.0-alpha.194

## 0.2.0-alpha.193

## 0.2.0-alpha.192

## 0.2.0-alpha.191

## 0.2.0-alpha.190

## 0.2.0-alpha.189

## 0.2.0-alpha.188

## 0.2.0-alpha.187

## 0.2.0-alpha.186

## 0.2.0-alpha.185

## 0.2.0-alpha.184

## 0.2.0-alpha.183

## 0.2.0-alpha.182

## 0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- [#59](https://github.com/rizom-ai/brains/pull/59) [`e52ca13`](https://github.com/rizom-ai/brains/commit/e52ca13cf888013687734af3bb39469859d4e23c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add shell-owned recurring checks with deterministic UTC staggering, a shared Effect test clock, cooperative cancellation, startup catch-up, bounded retries, condition-based alert deduplication, and notification delivery. Agent discovery now scans peer directories daily, while generated Rover and fleet configuration reuse the onboarding recipient for recurring alerts.

## 0.2.0-alpha.179

## 0.2.0-alpha.178

## 0.2.0-alpha.177

## 0.2.0-alpha.176

## 0.2.0-alpha.175

## 0.2.0-alpha.174

## 0.2.0-alpha.173

## 0.2.0-alpha.172

## 0.2.0-alpha.171

## 0.2.0-alpha.170

## 0.2.0-alpha.169

## 0.2.0-alpha.168

## 0.2.0-alpha.167

## 0.2.0-alpha.166

## 0.2.0-alpha.165

## 0.2.0-alpha.164

## 0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- [`457e95f`](https://github.com/rizom-ai/brains/commit/457e95f38476ef5fdc2b676ae83153de6be66599) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Themes become independently published npm packages, completing the
  published-package model for brain.yaml: `@rizom/theme-default` (the editorial
  base) and `@rizom/theme-rizom-ai` (the consolidated rizom.ai theme, depending
  on the base so fixes flow via npm resolution) publish dist-only artifacts with
  their CSS inlined. The brain entrypoint registers `@rizom/theme-default` and
  keeps a `@brains/theme-default` alias for pre-rename brain.yaml files; hosted
  deployments install `@rizom/*` theme refs next to the brain instead of
  requiring themes to be bundled into a brain release.

## 0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- [`7a1d3a0`](https://github.com/rizom-ai/brains/commit/7a1d3a0417afba050565948dc3f1e7aadc4eff89) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Schema-first site sections: new `@rizom/site-sections` package authors a content
  section from a single zod schema (`defineSection` ties the component props to
  `z.infer<schema>`; `sectionGroup` bundles a namespace). The brain derives the
  CMS fields and the markdown formatter from the same schema by introspection, so
  there is no hand-written field DSL to keep in sync. `@rizom/site` carries the
  opaque `SiteSectionGroup` contract and `SiteDefinition.sections`;
  `createRizomSite` gains `sections` and `entityDisplay` options, `themeProfile`
  becomes optional (omit it to ship no profile canvas and no
  `data-theme-profile`), and `RizomFrame` gains a `canvas` prop to drop the dead
  canvas mount on profile-less sites.

## 0.2.0-alpha.159

## 0.2.0-alpha.158

## 0.2.0-alpha.157

## 0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- [`643847f`](https://github.com/rizom-ai/brains/commit/643847fb9ae8298fdc501da9381129c528064c03) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Isolate MCP chat conversations by verified caller and return an opaque conversation handle for explicit follow-ups and confirmations. Authenticated HTTP transports now forward their verified subject into MCP tool context instead of allowing client metadata or a shared fallback identity to collapse unrelated sessions together.

## 0.2.0-alpha.154

### Patch Changes

- [`a7f257b`](https://github.com/rizom-ai/brains/commit/a7f257bfbfd8947d63a0b6d9aefef698c799cdcc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix A2A request signing across local and deployed instances. Local callers no longer send signatures with unreachable loopback key URLs, while deployed receivers verify signatures against the public forwarded URL instead of their internal reverse-proxy URL.

## 0.2.0-alpha.153

### Patch Changes

- [`c3c816d`](https://github.com/rizom-ai/brains/commit/c3c816d4cfa909aab95e4c520695d3a37fdac563) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use an OpenAI-compatible email regex in Buttondown tool input schemas so configured newsletter tools no longer invalidate every tool-bearing agent request under Zod 4.

## 0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- [#55](https://github.com/rizom-ai/brains/pull/55) [`07f7f45`](https://github.com/rizom-ai/brains/commit/07f7f45f2671cfca411f1b2210bf895b47f9cf42) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix conventional `src/site.ts` overrides that structurally match a plugin-less site package so they merge with the brain model's base site and preserve its runtime plugin and templates.

## 0.2.0-alpha.150

## 0.2.0-alpha.149

## 0.2.0-alpha.148

## 0.2.0-alpha.147

## 0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- [`34bf814`](https://github.com/rizom-ai/brains/commit/34bf814558ae017cc5d9f70aba9f3bbcbc6093e6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow Rover instances to opt into site-content for hosted Rizom site packages.

## 0.2.0-alpha.144

### Patch Changes

- [`4b939fc`](https://github.com/rizom-ai/brains/commit/4b939fcf6fe66e2a2daf2721ab765ae4dae878ee) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restructure the dashboard into a tabbed operator console. Widgets now declare required dashboard groups that derive visible tabs, the Overview renders vitals and group digest cards, the System tab owns runtime/endpoints/status cards, and first-party widgets provide group/digest metadata for the new layout.

## 0.2.0-alpha.143

## 0.2.0-alpha.142

### Minor Changes

- [`42c4bbf`](https://github.com/rizom-ai/brains/commit/42c4bbf5bed121c3c7b5d8c118c1b324b010e447) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Expose the AT Protocol registry as an opt-in Rover capability so rizom.ai can migrate from Ranger while preserving canonical protocol registry routes.

- [`442a843`](https://github.com/rizom-ai/brains/commit/442a843b07b0ee90a7332df86fc56bc8fb15db37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow docs.rizom.ai to run on Rover by making the docs capability opt-in on Rover, letting hosted user config render additional `add:` capabilities, and installing selected `siteOverride.package@version` refs into hash-tagged rover-pilot fleet images.

### Patch Changes

- [`08fca47`](https://github.com/rizom-ai/brains/commit/08fca474be4f558b6de89b4ee53dcf690db914b2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use the shell returned by the in-process booted app when invoking built-in CLI tools so installed-package site builds run against the initialized brain instead of a fresh singleton shell.

## 0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- [`f30d603`](https://github.com/rizom-ai/brains/commit/f30d603ef2384df63381227754f8178ef6b88a06) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tech-debt sweep: dashboard CSS extracted to a real stylesheet; deploy scaffolding forks (push-target, run-subprocess, push-secrets, ssh-key-bootstrap) consolidated into @brains/deploy-support with drift-guard tests; atproto-contracts split into modules with the @brains/plugins dependency removed; hackmd, notion, plugin-examples, and mcp-bridge plugins deleted (zero consumers).

## 0.2.0-alpha.139

## 0.2.0-alpha.138

## 0.2.0-alpha.137

## 0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- [`37db2bc`](https://github.com/rizom-ai/brains/commit/37db2bc759e606f42efacedd70056e9c2f440a4e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix Discord approval interactions so approve/decline buttons are removed after a response, and deliver generated image artifacts as native Discord files after approved generation actions.

## 0.2.0-alpha.134

### Patch Changes

- [`0738da5`](https://github.com/rizom-ai/brains/commit/0738da59cef4005980bc896a9d6453979fa53348) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Stabilize system_generate flows by normalizing model-authored generation operation arguments, preserving publish state during generated updates, and tightening related Rover tool invocation coverage.

## 0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- [`d70659e`](https://github.com/rizom-ai/brains/commit/d70659ede3ab9247dd8f777a52494073d76c04af) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make confirmed `agent_connect` save verified A2A contacts as approved immediately so users do not need a separate approval step before future calls.

- [`9988510`](https://github.com/rizom-ai/brains/commit/998851097b1606786e0b14a0ef3d2c606fbf08ea) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split durable content generation into explicit generation tool flows so create/update/save paths can distinguish persisted user content from generated document and image artifacts.

## 0.2.0-alpha.131

### Patch Changes

- [`863421c`](https://github.com/rizom-ai/brains/commit/863421ca34a0e9699133d655ffedd5c1f81ea107) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make Rover's A2A agent tools available to trusted users: trusted users can connect/verify agent directory contacts and call exact-domain agents, while public users still cannot access these external agent tools. Also tighten failed remote-agent call guidance so failures do not imply the agent was saved or connected.

- [`2f0854e`](https://github.com/rizom-ai/brains/commit/2f0854ee0e76e2dcef0f8f356d26d034821b8b76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix web-chat upload follow-ups so singular references such as “the uploaded image” and “the uploaded PDF” resolve to the newest matching live upload, and hydrate prior PDF uploads for read-only summaries even when a prior assistant response is also saveable.

## 0.2.0-alpha.130

### Minor Changes

- [`6102438`](https://github.com/rizom-ai/brains/commit/6102438752ec2419d14dfa0893230be9de44d41c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **Breaking (plugin API):** `EntityAdapter` now requires a `purpose: string` — one declarative sentence describing what the entity type is. Any plugin that defines an adapter (via `BaseEntityAdapter`'s config or an `EntityAdapter` object literal) must add `purpose` or it will not compile.

  System instructions now render the available entity types from each adapter's `purpose` instead of hardcoded "phrase → entityType" example mappings, so the model selects `entityType` from what each type is for. Migration: add `purpose: "<one sentence>"` next to `entityType` in your adapter config.

## 0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- [`4f3d7c6`](https://github.com/rizom-ai/brains/commit/4f3d7c6661630b5a346a8402cba2de81e4e1aff7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release the canonical `system_create.source` flow so Rover routes direct creates, uploads, and prior-response saves through the preferred source union while preserving legacy compatibility.

## 0.2.0-alpha.127

### Patch Changes

- [`1cf5d7c`](https://github.com/rizom-ai/brains/commit/1cf5d7c57579db6d9dd4a4a58f4efb78624c3e4c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fail closed for public delete requests through the system delete tool before entity lookup, and report git-backed directory sync requests as queued background work.

## 0.2.0-alpha.126

## 0.2.0-alpha.125

## 0.2.0-alpha.124

## 0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- [`b7a7514`](https://github.com/rizom-ai/brains/commit/b7a7514888373df93c9a2f12fb2bcadaad7aa924) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add core-preset Rover eval runner, tool coverage reporting, and permission matrix eval coverage.

## 0.2.0-alpha.121

### Patch Changes

- [`5180476`](https://github.com/rizom-ai/brains/commit/51804769182a88a9f7091c0504bf49dbc097a57a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix saved-agent routing for documentation brains and follow-up requests. Exact saved agent ids such as `docs.rizom.ai` now route through A2A instead of local-memory or save-first fallbacks, A2A failures are surfaced directly rather than answered from local docs, and bare affirmative follow-ups after a save-first refusal correctly save the referenced agent.

- [`ee61e5a`](https://github.com/rizom-ai/brains/commit/ee61e5a660e688f4df04abe075dc02140ce13c69) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Increase first-passkey setup link validity to 24 hours by default and add `auth-service.setupTokenTtlSeconds` for deployments that need a custom setup-token lifetime.

- [`5180476`](https://github.com/rizom-ai/brains/commit/51804769182a88a9f7091c0504bf49dbc097a57a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix uploaded-file action routing. Summarizing uploaded PDFs is now read-only and no longer creates notes or asks for confirmation, suggested Save document/Save image actions preserve the raw upload as document/image entities, and direct creates use deduplicated ids so duplicate titles do not fail with raw database errors.

## 0.2.0-alpha.120

## 0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- [`78171a4`](https://github.com/rizom-ai/brains/commit/78171a49698a9248fe12ceae6d8f45a5e5cc8b97) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix web-chat upload follow-ups so prior image uploads are rehydrated as native vision inputs, avoid generated-image copy for uploaded image saves, and clean completed confirmation text.

## 0.2.0-alpha.117

### Patch Changes

- [`fc3b669`](https://github.com/rizom-ai/brains/commit/fc3b669daa7d38097adf79b334451d69888ba1d5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release current mainline fixes and UI updates: explicit durable-write confirmation coverage, richer web-chat stream parts, improved Rover agent/publish routing, and associated eval/test/doc cleanup.

## 0.2.0-alpha.116

## 0.2.0-alpha.115

## 0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- [`7f9c3b1`](https://github.com/rizom-ai/brains/commit/7f9c3b191ee9d3979ec1bd922ef20664050bb783) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align PDF carousel inline emphasis with HTML deck styling by rendering italic markdown emphasis in the deck accent color.

## 0.2.0-alpha.112

### Patch Changes

- [`c6c7df5`](https://github.com/rizom-ai/brains/commit/c6c7df529c7fe7b23680934ce3dc1b1c1f4ae4f5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prevent generated document artifacts from creating oversized MCP tool names. Document IDs derived from dedup keys are now bounded with a short deterministic hash suffix instead of embedding full content hashes, and the entity-detail MCP resource template no longer enumerates every entity instance as a discoverable resource.

## 0.2.0-alpha.111

### Patch Changes

- [`61d6fb4`](https://github.com/rizom-ai/brains/commit/61d6fb44d3b3efaef89c8c4de9736e13f0486d2f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Consolidate content-pipeline publishing through provider-mode execution and add publish asset reconciliation for generated assets such as blog OG images. Published posts now enqueue missing publish assets after publish or published entity updates, and the content pipeline exposes an ensure-assets tool for backfills.

## 0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- [`b2c3550`](https://github.com/rizom-ai/brains/commit/b2c355029c06de6368e70d1832be39c084a276a7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release ATProto smoke credential wiring after the previous alpha version bump: Rover reads the app password from `ATPROTO_APP_PASSWORD`, rover-pilot user config owns the public ATProto identifier, and ops encrypts/deploys only the per-user ATProto app password.

## 0.2.0-alpha.108

### Patch Changes

- [`92ce0bd`](https://github.com/rizom-ai/brains/commit/92ce0bd672d2d2e6fabb206b78a884dbc23e3663) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add ATProto brain-card discovery event contracts, revise `ai.rizom.brain.card` to the nested brain identity plus minimal anchor snapshot shape, serve conventional/configured brain and anchor `did:web` documents, default omitted brain/anchor DIDs from the site host, include ATProto in Rover core, add a bounded `atproto_discover_brain_cards` candidate-read tool, and handle discovered cards by creating reviewable agents or enriching existing approved agents with signed card metadata.

## 0.2.0-alpha.107

### Patch Changes

- [`037da1a`](https://github.com/rizom-ai/brains/commit/037da1a1c75376a0eedc1f7c6cfebfc4fd73303b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden OG image rendering: omit the social-preview meta tag when an image would only resolve to an unusable data: URL, render OG images only via the explicit source-attachment path (a plain prompt is always a normal cover-image request), and replace the source-image render's delete-then-create with an in-place update so a failure can't leave an entity with no image. Also consolidate the per-entity OG image providers onto one shared render helper.

## 0.2.0-alpha.106

### Patch Changes

- [`0aede59`](https://github.com/rizom-ai/brains/commit/0aede594c9dcf6a9f67f3292085cecac86396a9c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Wire Rover CMS passkey login from `CMS_CONTENT_REPO_PAT`, include the variable in Rover env schemas, and avoid emitting a CMS auth base URL when no CMS login route is configured.

## 0.2.0-alpha.105

### Patch Changes

- [`dc9548c`](https://github.com/rizom-ai/brains/commit/dc9548cd2c015d3b751f791078ce5a1fb8213e39) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reuse recent web-chat upload refs for explicit follow-up requests, so asking to describe an already-uploaded image attaches the stored file to that model turn instead of requiring a reupload.

## 0.2.0-alpha.104

### Patch Changes

- [`67b8411`](https://github.com/rizom-ai/brains/commit/67b84110c7739898d14e11beb6a0b8e6de0a583f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add native file attachment support to the agent chat context so interfaces can pass binary attachments to model turns without embedding file bytes in stored conversation text.

- [`fb03560`](https://github.com/rizom-ai/brains/commit/fb03560cac461921cd823793e30cf1b1d0b47013) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Expand web-chat uploads to accept supported native file attachments and forward binary uploads to model turns as AI SDK file parts.

## 0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- [`94a25cc`](https://github.com/rizom-ai/brains/commit/94a25cc84c01805b6f9ac4d6cb50d403d8325fbc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Store internal entity-memory notes in assistant message metadata and inject them only into model history, keeping persisted assistant text clean for web-chat hydration.

## 0.2.0-alpha.101

### Patch Changes

- [`2b75d18`](https://github.com/rizom-ai/brains/commit/2b75d182d8b11e0b56b37451e1d605c8d071258a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Hide internal entity-memory notes from hydrated web-chat messages while preserving them in stored conversation history for agent follow-ups.

- [`c400d03`](https://github.com/rizom-ai/brains/commit/c400d0340edc5f04fa0d859013585d28607cbc09) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist generated artifact cards in conversation metadata and rehydrate them when web chat sessions are reopened, so generated image/document cards survive refreshes.

- [`2034f7e`](https://github.com/rizom-ai/brains/commit/2034f7ee15e7ba243be9e1eea283755f7b7cf9be) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Preserve generated image aspect ratios in web-chat attachment cards instead of cropping previews to a fixed card shape.

## 0.2.0-alpha.100

### Patch Changes

- [`83037ba`](https://github.com/rizom-ai/brains/commit/83037ba788c9b242a65d190f9ebcbdba480a22f0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Treat image-targeted image generation requests as standalone image generation so plain prompts do not fail when a model supplies image target fields, and rebuild the local brain runtime before dev starts so web-chat card changes are not hidden by stale bundles.

## 0.2.0-alpha.99

### Patch Changes

- [`9947471`](https://github.com/rizom-ai/brains/commit/99474713f696828748311b64bd6c71cfac3f17ac) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Show generated images in web chat as structured attachment cards with operator-only image view/download routes, clarify standalone image generation so plain image requests do not incorrectly require a target entity, and avoid prompt-distilling generated image data URLs when regenerating image entities.

## 0.2.0-alpha.98

### Patch Changes

- Add AT Protocol semantic publishing, canonical Rizom lexicon contracts, and the opt-in ATProto registry capability for Ranger.

## 0.2.0-alpha.97

### Patch Changes

- [`a669988`](https://github.com/rizom-ai/brains/commit/a669988d7351efb1371412e55366c329dc848489) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix web chat live tool activity status in the published brain runtime. Tool invocation events now broadcast to all interface subscribers and are delivered before tool execution continues, so `/chat` can reliably show transient `Using <tool>…` status while tools run.

## 0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- [`13cbae4`](https://github.com/rizom-ai/brains/commit/13cbae42d91f6dac9f32db1d61b90f9091645d7f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refresh Rover eval A2A directory fixtures so saved brain contacts are keyed by anchor/contact name while preserving the remote brain name separately.

## 0.2.0-alpha.94

## 0.2.0-alpha.93

## 0.2.0-alpha.92

## 0.2.0-alpha.91

## 0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- [`101637d`](https://github.com/rizom-ai/brains/commit/101637d1ea3c0f1256ce37f671e3d37feb1d1769) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render bundled web chat Markdown with Streamdown, matching AI Elements behavior while preserving the Rizom chat styling.

## 0.2.0-alpha.88

## 0.2.0-alpha.87

## 0.2.0-alpha.86

### Minor Changes

- [`c9c6591`](https://github.com/rizom-ai/brains/commit/c9c65910be5accf101314a170f7ede8cd269ab0e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bundle the Brain web chat interface with Rover, including the `/chat` UI, AI SDK-compatible chat routes, confirmations, session switching, derived session titles, and package-owned web chat assets for published brain instances.

## 0.2.0-alpha.85

### Patch Changes

- [`0dab8eb`](https://github.com/rizom-ai/brains/commit/0dab8ebca6c0dd9cf8cd3d23e77071060bff369c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Include notifications and Resend email delivery in Relay presets so configured first-passkey setup emails are actually delivered.

## 0.2.0-alpha.84

### Patch Changes

- [`0421fcf`](https://github.com/rizom-ai/brains/commit/0421fcfce5bc85335022ecadd0d8b7682533f92c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Have Relay report its package version from package.json, matching Rover, so model status tracks the released runtime bundle instead of a stale hardcoded version.

## 0.2.0-alpha.83

### Patch Changes

- [`fe66c5b`](https://github.com/rizom-ai/brains/commit/fe66c5b16442b3467d829b7e4d92bc595344bec8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Return small media preview artifacts inline as base64 so remote MCP callers can inspect generated previews without server filesystem access.

## 0.2.0-alpha.82

### Patch Changes

- [`c498c4d`](https://github.com/rizom-ai/brains/commit/c498c4dd294d10c87ce594dbb1f52c66b6ea1665) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix LinkedIn PDF carousel publishing to use LinkedIn's native Documents API and versioned Posts API instead of the obsolete digital media document upload path.

## 0.2.0-alpha.81

### Patch Changes

- [`72643ca`](https://github.com/rizom-ai/brains/commit/72643ca93f112be2534e9aa8583b6e904f13600f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix Rover standalone scaffolding for first-passkey setup email delivery.

  `brain init` now wires Rover's `auth-service.setupEmail` and `email-resend` config to `SETUP_EMAIL_TO`, `SETUP_EMAIL_API_KEY`, and `SETUP_EMAIL_FROM`, includes those variables in generated env examples and env schemas, and passes all three through the shared Kamal deploy template. Varlock validation now fails before deploy when setup email delivery is configured but the required Resend/setup email variables are missing.

## 0.2.0-alpha.80

### Patch Changes

- [`89d4c32`](https://github.com/rizom-ai/brains/commit/89d4c32fbd13cddebe9ff9d5559919e604270c10) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use the configured brain domain as the PDF carousel wordmark, falling back to the anchor profile name when no domain is configured.

## 0.2.0-alpha.79

### Patch Changes

- [`99b0c8c`](https://github.com/rizom-ai/brains/commit/99b0c8cee556c4975637c6e0d75ef1eef911f503) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Ship PDF carousel media rendering in the published brain runtime: deck-owned carousel PDF attachments, Playwright/Chromium media capture, durable document support, LinkedIn document publishing, media preview tooling, and Docker/runtime bundling fixes for Playwright.

## 0.2.0-alpha.78

### Patch Changes

- [`5aa339d`](https://github.com/rizom-ai/brains/commit/5aa339d7da43876e0e641567fbf1414387ad440c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make first-passkey setup emails configurable with product-specific onboarding copy, render Rover pilot onboarding copy in generated configs, and update the pilot user guide for the current passkey/OAuth core flow.

## 0.2.0-alpha.77

## 0.2.0-alpha.76

## 0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- [#5](https://github.com/rizom-ai/brains/pull/5) [`b104383`](https://github.com/rizom-ai/brains/commit/b104383d3a70e5f5f8852ef3116a6ab28ddff638) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Read `NODE_ENV` at container runtime instead of Bun bundle time so hosted deployments prefer public URLs when `NODE_ENV=production` is supplied by deploy configuration.

## 0.2.0-alpha.73

### Patch Changes

- [#4](https://github.com/rizom-ai/brains/pull/4) [`e900705`](https://github.com/rizom-ai/brains/commit/e90070555e140057860d5fc4a06d289f5e218640) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Send first-passkey setup email notifications after all plugins are ready so notification routing and email delivery subscribers can confirm delivery.

## 0.2.0-alpha.72

### Minor Changes

- [`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `MCP_AUTH_TOKEN` is now a local-only override. Removed from the shared Kamal deploy template, the bundled brain-cli env schemas for rover/ranger/relay, and the rover pilot template. Rover deployments authenticate via OAuth/passkey through `auth-service`; existing operators using `MCP_AUTH_TOKEN` can still set it locally if needed.

## 0.2.0-alpha.71

### Patch Changes

- [`003099e`](https://github.com/rizom-ai/brains/commit/003099e298a2e75933ca60161658db024497f943) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render ContentArchive year-break headings upright so older archive years match the latest featured year treatment.

## 0.2.0-alpha.70

### Patch Changes

- [`55e5ca4`](https://github.com/rizom-ai/brains/commit/55e5ca404c10e24e4f511911fdf29ec1143f6970) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix ContentArchive year breaks so the first archived year after the featured latest item is rendered as a large year heading when it differs from the featured item's year.

## 0.2.0-alpha.69

### Patch Changes

- [`a44a686`](https://github.com/rizom-ai/brains/commit/a44a686b3ba1ce490e44b815666790c97d150f4c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Ship the current ContentArchive implementation in the bundled brain runtime.

  This includes the year-based archive rail typography refinement and the split between the visual archive label and paginated page title so generated archive pages keep stable headings while still rendering pagination metadata correctly.

## 0.2.0-alpha.68

### Patch Changes

- [`1642455`](https://github.com/rizom-ai/brains/commit/16424552b04fe04dab37654fe581c3995e54c887) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix dashboard light mode so plugin-owned surfaces consume light theme surface tokens instead of inverse/dark background tokens.

## 0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- [`c656221`](https://github.com/rizom-ai/brains/commit/c656221c4aafeee056c09b47d7fe2b2b63a27478) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align generated preview domains with origin certificate coverage by deriving them as `preview.<brain-domain>` for both apex and nested brain domains.

## 0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- [`3b10699`](https://github.com/rizom-ai/brains/commit/3b1069954e2baeb01b831cc8691e212e8bde7c3e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Expose the dashboard as a registered runtime endpoint/interaction so operator surfaces are discoverable through system status, and add Relay eval coverage for approved peer-brain A2A calls plus dashboard/CMS operator access.

## 0.2.0-alpha.63

### Patch Changes

- [`c2fc867`](https://github.com/rizom-ai/brains/commit/c2fc86767c490f7f449a3e5931f6af69822e9959) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reconcile the public plugin entity-service contract with the runtime entity-service types. Public `IEntityService` now constrains entity generics to `BaseEntity`, `search` returns `SearchResult<T>[]`, and list/search request options use the canonical `ListOptions` and `SearchOptions` shapes.

  This is an alpha-phase breaking type tightening for external plugins that relied on unconstrained `<T = unknown>` entity-service generics.

## 0.2.0-alpha.62

### Patch Changes

- [`697394f`](https://github.com/rizom-ai/brains/commit/697394f96cf828eca5512cc06c2386b829276212) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated publish-image Docker actions to Node.js 24-compatible major versions.

## 0.2.0-alpha.61

### Patch Changes

- [`4a65833`](https://github.com/rizom-ai/brains/commit/4a65833f1d6380d4348bfdd547e7714c33a41621) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated deploy workflow checkout action to avoid Node.js 20 action runtime warnings.

## 0.2.0-alpha.60

### Patch Changes

- [`51b1535`](https://github.com/rizom-ai/brains/commit/51b153531c8f8e3afa8474be9489c39cf2addb48) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden generated deploy workflows by retrying Varlock resolution, masking resolved non-bootstrap values before exporting them to `$GITHUB_ENV`, preserving multiline values with heredoc syntax, and releasing stale Kamal deploy locks before deploy.

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- [`e975b88`](https://github.com/rizom-ai/brains/commit/e975b88b5a917594b1b2cae9a762e346deb89b5a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Enable the built-in OAuth/passkey auth service in Relay presets so Relay-based deployments can use MCP OAuth instead of the deprecated static `MCP_AUTH_TOKEN` fallback.

## 0.2.0-alpha.55

### Minor Changes

- [`5f4b816`](https://github.com/rizom-ai/brains/commit/5f4b8168d39b45eeb58840a9503c42cea97ad44c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the embedded Brain OAuth/passkey provider for MCP HTTP and operator sessions.

  Rover now includes `auth-service` by default, serves OAuth discovery/JWKS/protected-resource metadata, supports dynamic client registration and PKCE authorization-code flow, persists signing keys/clients/codes/sessions/passkeys/refresh tokens under runtime auth storage, and lets OAuth-capable MCP clients authenticate through browser/passkey login with the `mcp` scope.

  `MCP_AUTH_TOKEN` remains available as a deprecated static fallback. The CLI adds `brain auth reset-passkeys --yes` for local break-glass passkey recovery, onboarding docs now cover first-run `/setup`, and generated deploy templates persist `/app/data` so `./data/auth` survives redeploys outside `brain-data`.

## 0.2.0-alpha.54

### Patch Changes

- [`c99290b`](https://github.com/rizom-ai/brains/commit/c99290b0297672a79686568146ba918912805083) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix ecosystem section headline contrast in dark mode by explicitly using the active site heading token.

## 0.2.0-alpha.53

### Patch Changes

- [`123d311`](https://github.com/rizom-ai/brains/commit/123d311ca35caa8ec576a2ebf7db0ef8f0aec195) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix professional/default site rendering with shared Rizom ecosystem sections and deck views.
  - Align the header brand/wordmark with the same content edge used by professional homepage sections.
  - Expose default-theme compatibility tokens for shared Rizom UI fonts and accent colors so ecosystem text is color-correct in dark mode without local site shims.
  - Give presentation decks a reliable themed background fallback in dark mode.

## 0.2.0-alpha.52

## 0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- [`541d407`](https://github.com/rizom-ai/brains/commit/541d407f3141ec6b44d717def49db6c1129e9c0e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Update generated deploy workflows to run the current Varlock CLI, support Bitwarden-backed schemas with only `BWS_ACCESS_TOKEN` in GitHub Actions secrets, and keep `.env.schema` tracked by default.

## 0.2.0-alpha.49

### Patch Changes

- [`d543427`](https://github.com/rizom-ai/brains/commit/d543427d96795915a703008940350de1ef83c407) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add Bitwarden Secrets Manager support to `brain secrets:push` so operators can push local env-backed secrets to a conventionally named Bitwarden project and rewrite `.env.schema` with pinned Varlock Bitwarden references.

## 0.2.0-alpha.48

### Patch Changes

- [`14e74d9`](https://github.com/rizom-ai/brains/commit/14e74d997e92b7cdf32d55c4ab6782c328addee8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `brain start --startup-check` for external plugin smoke tests. Startup-check mode loads configured plugins, runs `onRegister` and `onReady`, then exits without starting daemons or job workers and without requiring a real AI API key.

## 0.2.0-alpha.47

## 0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- [`823e2cb`](https://github.com/rizom-ai/brains/commit/823e2cba7631f4e10dfb00d9e6cd5d351f146907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Redesign the personal site template with an editorial homepage/about layout, semantic theme colors, preserved post cover cards, sticky-footer CTA sections, and markdown italic tagline accents. Update the rover default test app to use the personal site template.

  Rework the default theme into a simplified Rizom-inspired editorial base and layer the full Rizom brand theme on top of it. Add shared theme-base support for font utilities, dark-surface text, sticky-footer body hygiene, and reusable hero/CTA decoration hooks.

## 0.2.0-alpha.44

## 0.2.0-alpha.43

## 0.2.0-alpha.42

## 0.2.0-alpha.41

## 0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- [`2dc037f`](https://github.com/rizom-ai/brains/commit/2dc037f9ef4925a1bb19d5d1dcc71d30f9223028) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix agent approval not sticking after directory-sync round-trip. `AgentAdapter.toMarkdown` now rebuilds the frontmatter from entity metadata on every write, so `system_update({ fields: { status: "approved" } })` produces disk markdown that matches the DB. Previously the stale `status: discovered` frontmatter stayed on disk, and the next import clobbered the DB back to discovered — causing agent calls to fail with "not approved yet" after a visibly successful approval.

## 0.2.0-alpha.38

### Patch Changes

- [`7ad4dca`](https://github.com/rizom-ai/brains/commit/7ad4dca2947e99f6fa03ad8f975db4b6e00261c0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix rover's agent-directory save and approval flow so explicit add/save requests create approved agent entries, approval follow-ups succeed more reliably, and regressions are covered by focused rover evals.

## 0.2.0-alpha.37

### Patch Changes

- [`d0970f6`](https://github.com/rizom-ai/brains/commit/d0970f692e232d12698ffef4e2aca1338205a013) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix published deploy scaffolding so both CLIs generate deploy files from the shared template source instead of stale package-local copies.

  This keeps standalone and rover-pilot scaffolds aligned with the shared deploy templates, including the persistent runtime mounts for `/data`, `/config`, and `/app/dist`.

## 0.2.0-alpha.36

### Patch Changes

- [`a2f0317`](https://github.com/rizom-ai/brains/commit/a2f03174796d3e0dfc968ef01ae23f9936ffd585) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix shared-host route registration so routes from interfaces registered after the webserver, such as A2A, are still available on production deploys.

  This restores endpoints like `/.well-known/agent-card.json` and `/a2a` in the no-Caddy shared-host deploy model.

## 0.2.0-alpha.35

### Patch Changes

- [`260df7b`](https://github.com/rizom-ai/brains/commit/260df7be333e6ff7fc7064ee48bdf2ed258c849c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Stabilize the agent-directory SWOT derivation flow by grounding it in clearer evidence cards and tighter two-pass refinement.

  This improves SWOT output quality by:
  - organizing owner skills and plausible network matches into explicit evidence cards
  - keeping strengths mostly anchored to the owner’s own skills
  - allowing external network capabilities to surface more naturally in weaknesses, opportunities, and threats
  - tightening refinement so final items stay tied to concrete draft themes
  - reducing vague capability labels in favor of clearer skill-based language

## 0.2.0-alpha.34

### Patch Changes

- [`1fd698f`](https://github.com/rizom-ai/brains/commit/1fd698f56637dd4d2e9a48bafbb89fce6d435db6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the publication pipeline dashboard widget so its status tabs work again, and move the pipeline card to the end of the dashboard widget stack.

  This follow-up update:
  - restores working pipeline tab switching in the dashboard renderer
  - keeps each tab compact with an internally scrollable list
  - preserves the calmer, denser pipeline presentation
  - renders the publication pipeline after the other secondary widgets

## 0.2.0-alpha.33

### Patch Changes

- [`584a247`](https://github.com/rizom-ai/brains/commit/584a2475b5ef1996447cd94ac8790c99ef2847ef) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refine the publication pipeline dashboard widget so it is calmer, denser, and easier to scan.

  This updates the publication pipeline presentation in the brain dashboard with:
  - a cleaner status summary
  - better default stage selection
  - tighter, more readable item rows
  - clearer queued/failed state emphasis without over-styling

  The goal is to make the publication pipeline feel polished and operationally useful without changing pipeline behavior.

## 0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- [`bf3cfd2`](https://github.com/rizom-ai/brains/commit/bf3cfd215ca507c157d81a2fb4fa4827d841a15a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render list-style dashboard widgets correctly and add built-in Topics and Skills dashboard cards so topic and skill summaries show up in the brain dashboard.

## 0.2.0-alpha.30

## 0.2.0-alpha.29

## 0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- [`2523c7d`](https://github.com/rizom-ai/brains/commit/2523c7d055f81675336d135fb190a807a6ff0d30) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix CMS config delivery for `/cms`, align base-note CMS config with Sveltia's `.md` format expectations, and update rover test apps so local CMS routes boot without noisy git-sync startup failures.

## 0.2.0-alpha.26

## 0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- [`22cb36f`](https://github.com/rizom-ai/brains/commit/22cb36f8b843b09f8ff82a3ba569cd16b0865aa0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add Bun setup to the generated standalone deploy workflow and reconcile older extracted deploy workflows that already use `bun`-based deploy scripts but were missing the required GitHub Actions Bun installation step.

## 0.2.0-alpha.23

### Patch Changes

- [`9a6c51c`](https://github.com/rizom-ai/brains/commit/9a6c51ce14682de27ee8acde944106ba2d33b73c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Broaden standalone publish workflow reconciliation so `brain init --deploy` upgrades older extracted `publish-image.yml` files to target the standalone Docker stage instead of leaving stale image builds behind.

## 0.2.0-alpha.22

### Patch Changes

- [`032b7c8`](https://github.com/rizom-ai/brains/commit/032b7c841a7d82586a7259a4ab52f09f95ad46ab) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Broaden standalone deploy workflow reconciliation so `brain init --deploy` upgrades older extracted deploy workflows to the current script-based shared-host scaffold instead of leaving stale inline workflow logic behind.

## 0.2.0-alpha.21

### Patch Changes

- [`a031b3f`](https://github.com/rizom-ai/brains/commit/a031b3fa4bd5a972352777f6a4bd75516a16a422) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Broaden standalone deploy Dockerfile reconciliation so `brain init --deploy` upgrades older Caddy-based Dockerfiles even when the generated header drifted slightly, instead of leaving a stale Dockerfile behind after removing `deploy/Caddyfile`.

## 0.2.0-alpha.20

### Patch Changes

- [`628c908`](https://github.com/rizom-ai/brains/commit/628c90859ec4b6f906d1c30cedd0da33829bd477) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Converge the in-repo runtime and deploy path on the shared-host model: local app `src/site.ts` / `src/theme.css` conventions now resolve consistently in the monorepo runner, in-repo apps use the workspace `@rizom/brain`, and the legacy dedicated preview server on port `4321` is removed so preview stays on the shared HTTP host.

## 0.2.0-alpha.19

### Patch Changes

- [`39774de`](https://github.com/rizom-ai/brains/commit/39774def181d2f5d3eaaa1ee26e087c0e8a873d1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix deploy Caddy templates to match preview hosts reliably using a Host header regex that supports both `preview.<domain>` and `*-preview.*` host shapes.

  Also remove the root-to-agent-card redirect from the generic site deploy templates so deployed site homepages continue serving the site root instead of redirecting to A2A discovery.

  Add regression coverage for the generated Caddy templates in both the brain CLI and ops scaffolds.

## 0.2.0-alpha.18

### Patch Changes

- [`7a57f3f`](https://github.com/rizom-ai/brains/commit/7a57f3fb95a0666075fee8ecad65ed1f506d1d41) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Route `system_create` through plugin-owned create interceptors so core stays generic while entity plugins own create-time validation, rewriting, and specialized workflows.

  Highlights:
  - move link create/capture behavior out of `system_create` and into the link plugin
  - move image target resolution/validation into the image plugin before generic create continues
  - add framework support for registering create interceptors on entity types
  - add regression coverage for core create interception, plugin registration, and framework plumbing
  - fix eval bootstrap plugin resolution so plugin eval packages that export adapters alongside plugins load the actual plugin export

## 0.2.0-alpha.17

### Patch Changes

- [`da0e978`](https://github.com/rizom-ai/brains/commit/da0e9782945f67e41b5a08a41cf0ccb6ba2f93c2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Register the stable `link-capture` handler alias in the link plugin so URL-based link capture jobs do not fail with `No handler registered for job type: link-capture`.

  This keeps `system_create` generic while preserving the public `link-capture` workflow name used for link capture.

## 0.2.0-alpha.16

### Patch Changes

- [`db41123`](https://github.com/rizom-ai/brains/commit/db411235976b9896cb0b77bd09f218714acefa3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align preview domain routing across deploy paths.
  - Derive preview URLs consistently from the configured brain domain
  - Support both `preview.<domain>` and `*-preview.*` preview host shapes in deploy Caddy templates
  - Add regression coverage for preview URL derivation and preview host routing

## 0.2.0-alpha.15

### Patch Changes

- [`b271ded`](https://github.com/rizom-ai/brains/commit/b271ded85f8dbcbcdef009045bfdc9fd60ff73f0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix `system_create` for `link` entities so URL-based link requests enqueue the correct `link-capture` job, raw URL content routes through capture, and direct creation only succeeds for valid full link markdown/frontmatter.

  Also add regression coverage for link creation routing and link-related eval fixtures so future releases catch mismatches between `system_create`, link job names, and link capture behavior.

## 0.2.0-alpha.14

## 0.2.0-alpha.13

## 0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- [`cf353fd`](https://github.com/rizom-ai/brains/commit/cf353fd41279a1ab59ab5ecd07dee9b1bcfd98dc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore an explicit Caddy redirect from `/` to `/.well-known/agent-card.json` so core-only deployments never return a bare 502 on the root path.

## 0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- [`676b2c1`](https://github.com/rizom-ai/brains/commit/676b2c15d4a696b400783ad5c46325c7990d9154) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix deployed smoke routing so the container healthcheck goes through Caddy, core-only root requests no longer fail when no site webserver is running, and GET `/a2a` returns a helpful non-404 response.

## 0.2.0-alpha.8

### Patch Changes

- [`ddf17de`](https://github.com/rizom-ai/brains/commit/ddf17def0015d19da2647ca42417c93b7c80fe4e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Sync the shared Kamal deploy template into both published packages so deployed scaffolds use the same package-local runtime copy after install, and align the rover-pilot scaffold with preview host routing.

## 0.2.0-alpha.7

### Patch Changes

- [`b7eb35c`](https://github.com/rizom-ai/brains/commit/b7eb35cee36e1bb1742dcf99af0510f490e5a5cb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix published deploy scaffolds to use package-local deploy templates and sync shared Docker/Caddy sources into both published packages at build time.

## 0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- [`c968a9d`](https://github.com/rizom-ai/brains/commit/c968a9d64b5f3f858135872f6c4c1052e394c7b0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep the Origin CA helper on a node-only `@brains/utils/origin-ca` subpath so `@rizom/brain` browser-targeted builds can publish successfully.

## 0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- [`9871933`](https://github.com/rizom-ai/brains/commit/9871933e813940ffa9628a55ee5892e538d17f1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the shared local env helper so browser-targeted `@rizom/brain` builds do not depend on `node:util.parseEnv`.

## 0.2.0-alpha.2

## 0.2.0-alpha.1

## 1.0.1-alpha.17

## 0.1.1-alpha.16

### Patch Changes

- [`2461872`](https://github.com/rizom-ai/brains/commit/24618720d35f9081a6aa3279b2007396961a08e5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix `brain init --deploy` to scaffold a checked-in `scripts/extract-brain-config.rb` helper and use it from the deploy workflow instead of shell-grepping `brain.yaml`. This also avoids broken newline escaping in the generated workflow's inline Node snippets.

## 0.1.1-alpha.15

### Patch Changes

- [`5cd6ca2`](https://github.com/rizom-ai/brains/commit/5cd6ca2cd2188f8cd71d83f2b8829fdfa197468b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: hide `/admin/` and `/dashboard` from public navigation.

  Both routes were registered with `navigation.show: true` in the
  secondary slot, which meant every layout that surfaces secondary nav in
  the footer — including `PersonalLayout` — leaked operator tooling into
  public navigation on every Brain site.

  Admin and Dashboard are operator interfaces, not public pages. They
  still render their routes and remain reachable by direct URL; they just
  no longer appear in auto-generated navigation menus.

## 0.1.1-alpha.14

### Patch Changes

- [`fc3ce02`](https://github.com/rizom-ai/brains/commit/fc3ce02e8d5df45b759335bbf4e0745c936fde4b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: mobile layout correctness for the Personal site templates and
  shared Header.

  The Personal homepage and about templates shipped rigid desktop-first
  sizing that overflowed on narrow viewports, and several decorative
  classes defined in `theme-default` (`hero-bg-pattern`, `cta-bg-pattern`,
  `card-cover-gradient`) were never actually applied by the layouts.
  The shared `Header`'s mobile hamburger had no visible default state on
  dark backgrounds.
  - `sites/personal/src/templates/homepage.tsx`
    - Hero h1: `text-4xl md:text-[56px]` → `text-2xl sm:text-4xl md:text-[56px]`,
      add `text-balance` so the tagline wraps on word boundaries instead of
      clipping at ~390px.
    - Hero inner container: add `w-full` so it fills the flex-col parent
      instead of shrink-wrapping to content width under `items-center`.
    - Hero CTA row: `flex justify-center gap-3` → `flex flex-wrap justify-center gap-3`
      so the two pill buttons stack on narrow viewports.
    - Hero `<header>`: apply `hero-bg-pattern relative overflow-hidden` so
      the theme-default dot pattern and vignette actually render.
    - Recent Posts grid: `grid-cols-1 md:grid-cols-3` →
      `grid-cols-[repeat(auto-fit,minmax(min(100%,280px),360px))] justify-center`
      so a lone post centers instead of stranding in two empty columns.
    - Post card `<img>`: add `card-cover-gradient text-transparent` so a
      failing image falls through to the brand gradient instead of showing
      raw alt text.
    - CTA section: apply `cta-bg-pattern relative overflow-hidden`.
  - `sites/personal/src/templates/about.tsx`
    - Same hero h1, inner container, and `hero-bg-pattern` treatment as
      the homepage.
  - `sites/personal/src/layouts/PersonalLayout.tsx`
    - Root wrapper: add `overflow-x-clip` as a global horizontal-overflow
      safety net.
    - Footer nav: `flex gap-6` → `flex flex-wrap justify-center gap-x-6 gap-y-2`
      so the nav wraps instead of clipping "Admin" off the right edge.
  - `shared/ui-library/src/Header.tsx`
    - Mobile hamburger button: ship a visible default state
      (`text-brand border border-brand/40 bg-brand/10`) so it reads against
      dark headers without relying on each consumer's theme override.

## 0.1.1-alpha.13

### Patch Changes

- [`dbdbee7`](https://github.com/rizom-ai/brains/commit/dbdbee7816a474c1317cc92ac331fc59d434dc7f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an explicit `brain init --deploy --regen` path for standalone deploy scaffolds.
  - regenerate derived deploy artifacts like `.github/workflows/deploy.yml`, `.github/workflows/publish-image.yml`, `.kamal/hooks/pre-deploy`, `deploy/Dockerfile`, and `deploy/Caddyfile`
  - keep canonical instance files such as `brain.yaml`, `.env`, `.env.schema`, and `config/deploy.yml` untouched during regen
  - re-derive the deploy workflow secret bridge from the current `.env.schema`, fixing drift after post-init schema changes

## 0.1.1-alpha.12

### Patch Changes

- [`37a2f97`](https://github.com/rizom-ai/brains/commit/37a2f976816e451dc2f81c28862cfa2b3dd71aaf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden standalone deploy workflows for fresh servers.
  - write an explicit SSH client config for Actions deploy runs so Kamal and plain `ssh` use the intended key noninteractively
  - wait for SSH access after provisioning before starting Kamal on a newly created Hetzner server

## 0.1.1-alpha.11

### Patch Changes

- [`dc252f2`](https://github.com/rizom-ai/brains/commit/dc252f204f980154b8cfc23cea17b8e50ea0ae82) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve deploy secret bootstrap ergonomics for standalone repos.
  - add `brain ssh-key:bootstrap` to create or reuse a local deploy key, register the matching public key in Hetzner, and optionally push `KAMAL_SSH_PRIVATE_KEY` to GitHub
  - make `brain secrets:push` read file-backed secrets from `.env.local` and `.env`, including `~/...` home-directory paths
  - document the preferred reproducible contract for `KAMAL_SSH_PRIVATE_KEY_FILE`

## 0.1.1-alpha.10

### Patch Changes

- [`177360d`](https://github.com/rizom-ai/brains/commit/177360dd90198c3b69143ab9a5c058d00c8379da) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve standalone deploy scaffolding for real repo usage.
  - scaffold a repo-local `publish-image.yml` workflow for standalone repos
  - make standalone deploy workflows trigger from `Publish Image` and deploy immutable SHA tags instead of relying on `latest`
  - switch standalone `config/deploy.yml` image identity from hardcoded `rizom-ai/<model>` values to repo-derived placeholders
  - scaffold repo-local deploy image assets (`deploy/Dockerfile`, `deploy/Caddyfile`)
  - bundle built-in model env schemas into the published package so `brain init --deploy` works outside the monorepo
  - reconcile known stale generated deploy files in existing standalone repos without overwriting custom edits

## 0.1.1-alpha.9

### Patch Changes

- [`f3d6b81`](https://github.com/rizom-ai/brains/commit/f3d6b81d0a693137ce4b32a4b76e5c1fca8c1907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Pre-register the built-in site and theme package refs used by bundled brain instances so published-path apps can resolve refs like `@brains/site-rizom`, `@brains/theme-rizom`, `@brains/site-default`, and `@brains/theme-default` from the runtime package registry instead of trying to dynamically import external workspace packages at boot.

## 0.1.1-alpha.8

### Patch Changes

- [`c1ffe49`](https://github.com/rizom-ai/brains/commit/c1ffe49f27bcb59935b06b64003eba266d520197) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bundle the `ranger` and `relay` brain models into the published `@rizom/brain` runtime so app instances that declare those models in `brain.yaml` can boot on the published path instead of requiring monorepo source resolution.

## 0.1.1-alpha.7

### Patch Changes

- [`99c536e`](https://github.com/rizom-ai/brains/commit/99c536e2f66f6fc025677b549adce0a2d433b8bf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve standalone site authoring for published `@rizom/brain` consumers.
  - auto-discover local `src/site.ts` and `src/theme.css` when `brain.yaml`
    omits `site.package` / `site.theme`
  - widen `@rizom/brain/site` to expose both personal and professional site
    authoring symbols under one public subpath
  - make `brain init` scaffold `src/site.ts` and `src/theme.css` while keeping
    `brain.yaml` pinned to the model's built-in site/theme until the operator
    opts into the local convention

## 0.1.1-alpha.6

### Patch Changes

- [`edafd2e`](https://github.com/rizom-ai/brains/commit/edafd2ea52d3631a6ffd08736ec7b86e68f2a2e3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `@rizom/brain/themes` subpath export with `composeTheme`.

  Standalone site repos need `composeTheme(myThemeCSS)` to prepend
  the shared base utilities (palette tokens, `@theme inline`
  declarations that expose `--color-brand` / `--color-bg` / etc. to
  tailwind, layer ordering, gradient / status utilities) to their
  own brand overrides. Without composing, tailwind can't resolve
  utilities like `bg-brand`, `text-brand`, or
  `focus-visible:ring-brand` that the layouts depend on, and the
  site build crashes with:

      Cannot apply unknown utility class `focus-visible:ring-brand`

  Consumers use it like:

      import { composeTheme } from "@rizom/brain/themes";
      import type { SitePackage } from "@rizom/brain/site";
      import themeCSS from "./theme.css" with { type: "text" };

      const site: SitePackage = {
        theme: composeTheme(themeCSS),
        // ...
      };

  Part of the public library-export surface now tracked in `docs/plans/external-plugin-api.md`, shipping early
  because `apps/mylittlephoney` hit the missing-utility crash during
  Phase 1 of the standalone extraction. The rest of Tier 2
  (`@rizom/brain/plugins`) is still deferred.

  The new entry follows the same pattern as `@rizom/brain/site`:
  runtime re-export in `src/entries/themes.ts`, hand-written type
  contract in `src/types/themes.d.ts`, bundled by `scripts/build.ts`
  into `dist/themes.js` (11KB — it's essentially a re-exported CSS
  string plus a pass-through function), and declared in the
  `exports` map of `packages/brain-cli/package.json`.

  Includes a source-level regression test at
  `packages/brain-cli/test/themes-export.test.ts` that asserts all
  four wiring points stay intact (entry file, type contract,
  package.json exports map, and `libraryEntries` in build.ts).

## 0.1.1-alpha.5

### Patch Changes

- [`310de17`](https://github.com/rizom-ai/brains/commit/310de174a1a1cb2e7947f8a93ae602256467506f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: declare `preact` and `preact-render-to-string` as runtime
  dependencies of `@rizom/brain`.

  Alpha.4 externalized `preact`, `preact/hooks`, `preact/jsx-runtime`,
  `preact/compat`, and `preact-render-to-string` in the bundle to
  avoid the dual-instance hook crash, but forgot to add them as
  regular `dependencies` in `package.json`. Consumers installing
  `@rizom/brain` from npm got the bundle without the runtime modules,
  and the CLI crashed at import time with:

      Cannot find package 'preact-render-to-string' from
      '/.../node_modules/@rizom/brain/dist/brain.js'

  Adds both packages as regular `dependencies`. `preact@^10.27.2` and
  `preact-render-to-string@^6.3.1`, matching the versions used by
  `@brains/site-builder-plugin` in the monorepo so runtime and
  workspace stay aligned.

  Consumers scaffolded via `brain init` also declare `preact` in
  their own `package.json`, which is fine — bun hoists the shared
  version to the top-level `node_modules/preact` and the externalized
  imports all resolve to the same instance.

## 0.1.1-alpha.4

### Patch Changes

- [`42dc036`](https://github.com/rizom-ai/brains/commit/42dc0367073fd747005f67979bbe9fea74be6c54) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: externalize `preact` (and `preact/hooks`, `preact/jsx-runtime`,
  `preact/compat`, `preact-render-to-string`) in the `@rizom/brain`
  bundle so the CLI, library exports, and consumer site code all share
  a single preact instance at runtime.

  Before this fix, `brain.js` and `dist/site.js` each bundled their
  own copy of preact. When a standalone site repo installed its own
  `preact` dep and rendered its custom layout through the bundled
  site-builder, three different preact instances were in play:
  1. Preact inside `brain.js` (used by the site-builder's renderer)
  2. Preact inside `dist/site.js` (used by `@rizom/brain/site` imports)
  3. Preact in the consumer's `node_modules/preact` (used by the
     consumer's own JSX)

  Preact hooks rely on a module-level `options` global to bridge
  component rendering and hook state. Different instances have
  different globals, so `useContext` and friends crashed with:

      TypeError: undefined is not an object (evaluating 'D.context')
        at useContext (preact/hooks/dist/hooks.mjs:...)

  Discovered booting `apps/mylittlephoney` as the first standalone
  extraction. After fixing the `@-prefixed` package ref resolution in
  alpha.3, the site plugin loaded correctly but the first site build
  crashed deep in the renderer the moment any hook (starting with
  `Head.tsx`'s `useContext`) ran.

  Every consumer (brain init scaffold, standalone site repos) already
  has `preact` as a real dependency, so externalizing it always
  resolves at runtime. The `dist/brain.js` and `dist/site.js` sizes
  dropped by ~30KB combined as a nice side effect.

  Adds a source-level regression test in
  `packages/brain-cli/test/build-externals.test.ts` that asserts
  `preact`, `preact/hooks`, `preact/jsx-runtime`, `preact/compat`, and
  `preact-render-to-string` remain in the `sharedExternals` array of
  `scripts/build.ts`. Runtime dual-preact detection is too expensive
  for a unit test; the source check catches the exact regression
  shape (someone removes preact from externals thinking "it's small,
  bundle it").

## 0.1.1-alpha.3

### Patch Changes

- [`238269b`](https://github.com/rizom-ai/brains/commit/238269bbcf5362e9116d4644fe8953e6034de874) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: `@rizom/brain` CLI now resolves `@-prefixed` package references
  from `brain.yaml` before resolving the brain config.

  The published CLI entrypoint (`packages/brain-cli/scripts/entrypoint.ts`)
  called `resolve(definition, env, overrides)` directly, skipping the
  dynamic-import step that populates the package registry with refs from
  `site.package` and plugin config values. Brains that override
  `site.package` in `brain.yaml` would silently fall back to the brain
  definition's default site because `resolveSitePackage()` couldn't find
  their site in an empty registry.

  The dev runner (`shell/app/src/runner.ts`) already had this wiring;
  only the published path was missing it.

  Discovered booting `apps/mylittlephoney` as the first standalone
  extraction. The
  brain booted cleanly and rendered the site successfully, but the site
  was rover's default professional layout with the blue/orange palette,
  not mylittlephoney's `personalSitePlugin` with the pink theme. The
  compiled `main.css` had `--palette-brand-blue: #3921D7` instead of
  the mylittlephoney pinks.

  Extracts the import-and-register logic into
  `packages/brain-cli/src/lib/register-override-packages.ts` with a
  dependency-injected `PackageImportFn` so it's unit-testable without
  hitting the real module resolver. Wires the helper into
  `setBootFn()` in the published entrypoint. The dev runner still uses
  its own inline copy; a follow-up could dedupe.

  Exports `getPackage`, `hasPackage`, and `collectOverridePackageRefs`
  from `@brains/app` (previously only `registerPackage` was exported).

  Added 5 regression tests in
  `packages/brain-cli/test/register-override-packages.test.ts` covering:
  - site.package registration
  - plugin config ref registration
  - combined site + plugin refs in one pass
  - no-op on overrides without refs
  - swallowing import errors and continuing with remaining refs

## 0.1.1-alpha.2

### Patch Changes

- [`c00b24f`](https://github.com/rizom-ai/brains/commit/c00b24f30d8d02e2a30321f21dce08e0feec0af4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: declare tailwind runtime dependencies so the site builder's CSS
  pipeline can resolve `@import "tailwindcss"` and `@plugin
"@tailwindcss/typography"` at build time.

  The bundled `@tailwindcss/postcss` runs PostCSS against
  `plugins/site-builder/src/styles/base.css` which begins with
  `@import "tailwindcss"`. PostCSS resolves that import against the
  consumer's `node_modules/`, not against the `@rizom/brain` bundle. If
  `tailwindcss` isn't in the consumer's `node_modules`, the CSS build
  throws `Can't resolve 'tailwindcss'` during the first site build.

  Adds as regular `dependencies`:
  - `tailwindcss` (^4.1.11)
  - `@tailwindcss/postcss` (^4.1.13)
  - `@tailwindcss/typography` (^0.5.19)
  - `postcss` (^8.5.6)

  `@tailwindcss/oxide` stays in `optionalDependencies` — it's the
  native part of tailwind v4 and may fail to install on unsupported
  platforms. The pure-JS packages above always install cleanly.

## 0.1.1-alpha.1

### Patch Changes

- [`8540e31`](https://github.com/rizom-ai/brains/commit/8540e313ee27875f494388f2cf6f9ffdc79b2fe6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: brain boot no longer eagerly loads the `sharp` native module.

  `plugins/site-builder/src/lib/image-optimizer.ts` had a top-level
  `import sharp from "sharp"` that triggered native module resolution
  when the bundle loaded. On NixOS, Alpine, distroless containers, and
  other minimal Linux environments, `sharp`'s prebuilt binaries cannot
  find `libstdc++` at standard paths and the `dlopen` fails — crashing
  the entire brain boot even on instances that removed the image
  plugin via `remove: - image` in `brain.yaml`.

  `sharp` is now loaded lazily via `import("sharp")` on first use.
  Brain instances that never process images never touch `sharp` at all.
  The image plugin still works the same way when enabled; the only
  change is the load timing.

  Adds a source-level regression test in `plugins/site-builder/test/`
  that asserts `image-optimizer.ts` never reintroduces a top-level
  runtime import of `sharp`.

## 0.1.1-alpha.0

### Patch Changes

- [`d43dbda`](https://github.com/rizom-ai/brains/commit/d43dbda701faeab85ed96320ad2691402bc0558c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - First public alpha of `@rizom/brain` — the umbrella package shipping
  the brain CLI, runtime, and all built-in brain models (rover, ranger,
  relay) as a single npm artifact.

  Highlights since project start:
  - **CLI**: `init`, `start`, `chat`, `eval`, `pin`, `tool`, plus
    `--remote` mode for talking to a running brain over MCP.
  - **`init` scaffolds the unified app shape**: `brain.yaml` +
    `package.json` (pinning `@rizom/brain` and `preact`) +
    `tsconfig.json` + `README.md` + `.gitignore` +
    optional `.env` (when `--ai-api-key` is provided). Interactive
    prompts via `@clack/prompts` with non-interactive escape hatch.
  - **Library export `@rizom/brain/site`** (Tier 1): re-exports
    `personalSitePlugin`, `PersonalLayout`, `routes`, plus the `Plugin`
    and `SitePackage` types — enough to compose a custom site package
    in a standalone brain repo. Hand-written `.d.ts` for now; see
    `docs/plans/external-plugin-api.md` for the replacement plan.
  - **Built-in brain models**: rover (general personal brain), ranger
    (collaborative — public source, no published artifact), relay
    (Rizom internal — public source, no published artifact).
  - **Runtime**: shell + entity service + job queue + ai service +
    embedding service + identity service + content pipeline +
    templates + plugin manager. SQLite-backed, separate embedding DB,
    FTS5 + vector hybrid search.
  - **Plugin types**: entity plugins, service plugins, interface
    plugins, core plugins, composite plugins (factories returning
    multiple plugins under one capability id).
  - **Interfaces**: CLI, chat REPL, MCP (stdio + HTTP), webserver,
    Discord, Matrix, A2A.
  - **Deploy**: Kamal-driven Hetzner deploys, multi-arch Docker images
    for rover via `publish-images.yml`, GitHub Actions release pipeline.

  This is an **alpha**. Expect breaking changes between alpha versions.
  Pin to a specific version, do not depend on `^0.1.0-alpha.0` resolving
  to a stable contract.

  See `docs/roadmap.md` for current release-readiness direction.
