# Plan: Bilingual sites

Last updated: 2026-10-30

## Status

Phases 1–4 are built (PR #778): a site declares its languages, every page is built per language from its own copy, untranslated pages and languages without site-info chrome are skipped, pages link their translations, and sections can be drawn per language. Phase 5, The Fourth (`thefourth.rizom.ai`) in Traditional Chinese (zh-TW), is under way: the site is ready for Chinese copy, and its Chinese drawings wait on Sam's mockup.

## Decisions

- **Languages are declared once per site.** `defineSite({ languages: ["en", "zh-TW"] })`; the first entry is the default. A site without `languages` builds exactly as today.
- **One route, one URL per language.** The default language keeps today's paths. Every other language lives under its lowercased tag with the same slugs: `/` → `/zh-tw/`, `/about` → `/zh-tw/about`. Each page's `<html lang>` is its language (`zh-TW`).
- **Copy is stored per language, parallel to the default.** Default-language copy stays at `site-content/<route>/<section>.md` (id `<route>:<section>`). A translation lives at `site-content/<lang>/<route>/<section>.md` (id `<lang>:<route>:<section>`, e.g. `zh-tw:home:cover`). Directory sync already maps nested paths to colon ids both ways (`plugins/directory-sync/src/lib/entity-paths.ts`), and site-content ids are opaque to its schema and Studio, so neither changes.
- **Untranslated pages are not built.** A route is built in a non-default language only when every templated section on it has saved copy in that language; the site package's default copy is never used for another language. Routes with a datasource section, or a section without a template, are built in the default language only. Translating entity content (posts, books) is outside this plan.
- **Site-info is translated in place.** site-info is a singleton with a literal id, created on first boot, so translations go in a `translations` block in its frontmatter (`translations: { zh-TW: { title, description, copyright, cta } }`) instead of a second entity. A site is built in a language only when site-info has that language's block.
- **Routes carry translated titles.** `RouteDefinition` gains `translations?: { [lang]: { title?, description?, navigation label? } }` for the page head and navigation.
- **A section can bring its own drawing per language.** `defineSection(schema, component, { …meta, components: { "zh-TW": ZhComponent } })`. The schema is shared, so both languages' copy files have the same fields. Small differences (fonts, leading, tracking) stay in CSS under `:lang(zh-TW)`.
- **Pages link their translations.** Each page emits `<link rel="alternate" hreflang>` for every language it is built in, plus `x-default` for the default language, as absolute URLs from the build's public URL, the one its sitemap uses (none when the build has none). The sitemap lists every built language version.
- **Layouts know the language.** `SiteLayoutProps` gains `language` and `alternates: Array<{ language, path }>` (the versions this page is built in), so a layout can render a language switch that only offers what exists. Navigation lists the routes built in the page's language, with same-language paths.
- **Drafting stays manual.** `site-content_generate` skips sections that ship default copy and schema-first templates, so translations are written as copy files (drafted by an agent, reviewed by a native speaker in Studio). Generation in other languages is not part of this plan.

## Phases

1. **Walking skeleton.** `languages` on `defineSite`; the builder renders each route once per language at the prefixed path, reads copy from `<lang>:<route>:<section>`, applies the untranslated-page rule and writes `<html lang>`. Test site: one route, one section, translated. Tests for path mapping, copy lookup, skipping and `lang`.
2. **Linked pages.** hreflang alternates and `x-default`, sitemap entries per language, `language` and `alternates` on layout props, per-language navigation.
3. **Translated site chrome.** The site-info `translations` block and route `translations`; head titles and descriptions, CTA and copyright per language; the site-info gate.
4. **Per-language drawings.** `components` on section meta; the builder picks the page language's component and falls back to the default component.
5. **The Fourth in zh-TW.** Built: the site declares `["en", "zh-TW"]`; the layout's EN / 中文 switch shows on pages that exist in both; Chinese pages set CJK in Noto Sans TC and Noto Serif TC, loaded only on them; the signposts' words are crossroads copy; the footer's two fixed lines are kept per language in the layout, since site-info has no field for them; a Chinese spell in Act II lists its words (`words`), since its sentence has no spaces. Remaining: Chinese drawings from Sam's mockup; the Chinese copy and site-info `translations.zh-TW`, drafted and corrected by Sam and Becca in Studio; a live check of both languages.

Phases 1–4 release through `@rizom/site` and the brain; phase 5 through `@rizom/site-thefourth`.

## Validation

Each phase lands with its tests and the site test suites. Before phase 5 ships: a production build of thefourth with and without Chinese copy (no `/zh-tw/` pages until every section and site-info are translated), hreflang and sitemap entries checked in the output, Studio showing the Chinese copy under `zh-tw`, and the live site checked on desktop and phone in both languages.
