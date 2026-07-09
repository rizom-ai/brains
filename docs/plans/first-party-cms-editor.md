# Plan: First-Party CMS Editor

## Status

Proposed. Replaces the Sveltia-based browser CMS in `plugins/cms` with a first-party
React editor that writes content through the entity service instead of committing to
GitHub from the browser.

## Context

The current CMS (`plugins/cms`) is a thin wrapper around Sveltia CMS, loaded from a CDN.
Sveltia commits content **directly to GitHub from the browser** using a write token
(GitHub OAuth, or a passkey-gated PAT). This has four
structural problems, all of which stem from the editor living outside the brain:

- **Data path** — edits go browser → GitHub → git-sync, _bypassing_ the entity service.
  The entity DB, which everything else reads from (search, embeddings, `entity:*` events,
  other plugins), is downstream of the edit rather than its target.
- **Security** — a GitHub write token lives in the browser; XSS or devtools can exfiltrate
  it. The entire OAuth/PAT/GitHub-App apparatus exists only to manage this token.
- **Dependency** — Sveltia is an external app loaded from a CDN, version-pinned by hand,
  that must be kept in sync with `@brains/cms-config`.
- **UX** — the authoring experience is fixed by Sveltia's model; no room for first-party
  features (e.g. AI-assisted authoring against `@ai-sdk/react`, already in `web-chat`).

The brain is already a headless CMS _backend_. The only missing piece is a first-party
editor. Investigation confirmed every building block exists:

- **Entity write API** — `entity-service` exposes `createEntity` / `updateEntity` /
  `deleteEntity` / `upsertEntity`, persisting to SQLite and emitting `entity:*` events.
- **Schema introspection** — `@brains/cms-config` exposes `getEffectiveFrontmatterSchema(type)`,
  `getAdapter(type)` (`isSingleton` / `hasBody`), and `zodFieldToCmsWidget()`.
- **Web + interactive UI** — `interfaces/webserver` (Hono) registers plugin routes via
  `getWebRoutes()`; `interfaces/web-chat` is the precedent for a Vite-bundled **React 19**
  SPA served by the brain (`@ai-sdk/react`, `radix-ui`, `cmdk`, `streamdown`, `shiki`).
- **Auth** — `auth-service` provides cookie-based passkey operator sessions
  (`getOperatorSession` / `hasOperatorSession`). No GitHub token needed to authenticate.
- **Git, for free** — `directory-sync` subscribes to `entity:*` events and exports entities
  to files; git-sync commits and pushes. Writing through the entity service gives git
  persistence as a downstream side effect — no browser token, no inversion.

### Why React, not Preact

The repo has a clean split: **Preact** is used only for server-rendered static sites and
dashboard widgets (`sites/*`, `site-builder`, `dashboard`, `rizom-ui`); **React 19** is used
for the one rich interactive client SPA, `web-chat`. A CMS editor is a stateful interactive
app, so it belongs with React. This also keeps the door open to AI-assisted authoring via
the `@ai-sdk/react` stack already vendored in `web-chat`, and reuses its component libraries
(`radix-ui`, `cmdk`, `streamdown`, `shiki`).

### Why first-party, not Keystatic / a library CMS

No off-the-shelf CMS writes to a custom entity service — every one brings its own data layer.
Keystatic-local was evaluated as a middle path: its data round-trip through `directory-sync`
works (canonical-hash matching prevents echo loops; `id`/`contentHash` are recomputed on
import), but (a) its admin UI is supported only on Next/Astro/Remix, so hosting it in our
Hono runtime needs a second framework or an unsupported mount, and (b) it keeps **files** as
the editing source of truth, leaving the data-path inversion unsolved. The site-builder→Astro
plan (`template-renderer-contracts.md`) does not change this: that work is Astro-as-a-static-
_build_-renderer behind the build contract, not Astro-as-a-live-_server_ in the request path,
which is what Keystatic would need.

### Correction on the schema → form mechanism

An earlier framing suggested feeding Zod schemas directly to a client form library
(AutoForm / react-hook-form). That does not work here: entity schemas are **runtime-dynamic**
(registered by adapters at runtime) and live **server-side**, so they are not available in the
client bundle at build time. The schema must be converted to a serialisable **field
descriptor** on the server and shipped to the client per request. `@brains/cms-config`
already does this conversion (`zodFieldToCmsWidget`) — today its output feeds Sveltia's YAML.
This plan **repoints that descriptor output at our own React form renderer** instead. The
descriptor layer is reused, not removed; only its consumer changes.

## Goal

A first-party React editor, served by the brain at `/cms`, that:

1. authenticates via the existing passkey operator session (no GitHub token in the browser);
2. lists entities and renders edit forms from server-provided field descriptors;
3. writes through `entityService` (create/update/delete), making the entity DB the single
   authoritative writer, with git persistence following automatically via `directory-sync`.

## Non-goals

- Removing git persistence. Git remains the durable archive, downstream of entity writes.
- A public-site renderer. This is the **editing** surface only; `site-builder` still renders
  the public site.
- Multi-user editorial workflow (drafts/review/publish states), i18n, or fine-grained
  per-collection access control in the first pass.
- A new media storage model. The editor reuses the existing `image`-entity pipeline (see D2).
- Coupling to the Astro site-builder migration.

## Decisions

Neither open item blocks starting. D1 (body editor) is not a pre-decision — Phase 2 ships the
floor (AI Elements textarea + `streamdown` preview, no new dependency) and any editor upgrade is
deferred to Phase 4. D2 (media) is **already settled by the existing system** — images are `image`
entities handled by `directory-sync`'s image pipeline and stored as files in git; the editor
reuses that path, it is not a new choice. The walking skeleton (Phase 0) touches neither.

### D1 — Markdown body editor (deferred upgrade, not a pre-decision)

`@ai-sdk/react` / AI Elements (already vendored in `web-chat`) ships a _render_ opinion but no
_editor_: Markdown rendering is `streamdown` (render-only), and the only text input is a plain
`PromptInputTextarea`. So the cheapest body editor is the textarea we already have plus a
`streamdown` preview — zero new deps, perfect round-trip (you edit the literal bytes).

Three tiers, in increasing cost:

| Tier  | Editor                                       | New deps            | Round-trip | Feel                      |
| ----- | -------------------------------------------- | ------------------- | ---------- | ------------------------- |
| Floor | `PromptInputTextarea` + `streamdown` preview | none                | perfect    | bare, no highlighting     |
| Mid   | CodeMirror 6 + `streamdown` preview          | +CM6                | perfect    | source, with highlighting |
| Rich  | Lexical / TipTap / Milkdown                  | +editor +serializer | drifts     | WYSIWYG                   |

Plan: **Phase 2 ships the Floor.** The upgrade to Mid (CodeMirror 6, still perfect round-trip) or
Rich (WYSIWYG) is decided _after_ authoring against the floor, not before. Recommendation if/when
upgrading: prefer **Mid (CodeMirror 6)** unless authors specifically ask for WYSIWYG — the content
is Markdown-in-git and `directory-sync` hashes the canonical form, so WYSIWYG serialization drift
(re-normalized list markers, emphasis style, wrapping) triggers spurious sync writes and needs a
trusted serializer plus import-normalization to contain (see Phase 4). Note CodeMirror 6 is a 2022
ground-up rewrite, not the legacy CM5 the name evokes.

### D2 — Media / image storage (already settled)

There is no decision here: media already has an established model. Images are a first-class
`image` entity type (`entities/image`), handled by `directory-sync`'s image pipeline
(`image-entity-helper`, `image-file-utils`, `markdown-image-converter`,
`frontmatter-image-converter`, `image-job-queue`) and stored as files in git. Today's Sveltia
config already points its `media_folder` at this same `image` location. The first-party editor
uploads an image by creating/updating an `image` entity through `entityService` — the existing
pipeline writes the file to git, exactly like every other entity. This stays consistent with the
single-writer model and introduces no new storage path.

## Design mockups

Interactive mockups live at [`docs/cms-editor-mockups.html`](../cms-editor-mockups.html)
(open in a browser; approved 2026-07-07). Three screens — Library, Manuscript, States —
extending the existing operator-console identity (Fraunces + IBM Plex, pulse mark, warm
paper/vermilion/verdigris). Design decisions they settle for the phases below:

- **The save pipeline is visible UX, not a hidden side effect**: a dark instrument strip
  under the editor shows `entity db → exported to file → committed` stations animating on
  save, with the latest commit ref. List rows carry a compact sync state (`committed` /
  `exporting`). This is the interface expressing the plan's single-writer thesis.
- **Frontmatter as a "colophon" form** in a left rail, rendered from the server field
  descriptors (string / reference / string[] / date / image-entity widgets), body editor to
  the right — matching the API's frontmatter/body split.
- **Body editor ships the Floor tier** with a `Source | Split | Preview` segment control, so
  the Phase 4 CodeMirror upgrade slots in without layout change.
- **States**: field-level validation blocks the write before anything is sent; the stale-write
  conflict names the other writer ("updated by directory-sync — a git import touched this
  file") with review/overwrite actions; delete confirms by narrating its downstream effects
  (event → file removal → commit, recoverable from git); singletons open straight into the
  editor with no list.

## Architecture

Evolve `plugins/cms` in place (it already owns the `/cms` route, operator-session auth wiring,
and the schema/config endpoints). Swap the served artifact from a Sveltia CDN shell to a
Vite-bundled React SPA, and add entity read/write API routes. Structure mirrors `web-chat`:

- `plugins/cms/src/plugin.ts` — route registration, operator-session guard, serves the bundle
  and the descriptor/entity API. Reuses existing `getWebRoutes()` machinery.
- `plugins/cms/ui/` — the React 19 client app, Vite-bundled, served at `/cms/assets/app.js`
  (same pattern as `web-chat`'s `/chat/assets/app.js`).
- Server API (all guarded by `getOperatorSession`):
  - `GET  /cms/api/types` → entity types + adapter flags (`isSingleton`, `hasBody`).
  - `GET  /cms/api/types/:type/schema` → **field descriptors** from `@brains/cms-config`.
  - `GET  /cms/api/entities/:type` → list.
  - `GET  /cms/api/entities/:type/:id` → one entity.
  - `PUT  /cms/api/entities/:type/:id` → `entityService.updateEntity`.
  - `POST /cms/api/entities/:type` → `entityService.createEntity`.
  - `DELETE /cms/api/entities/:type/:id` → `entityService.deleteEntity`.
- Entity read/write payloads expose **frontmatter and body as separate fields** (via the adapter's
  Markdown parse/serialize), never a combined blob. The form owns frontmatter; the body editor owns
  the body string; the adapter recombines into `---\nyaml\n---\nmarkdown` on write. This keeps
  frontmatter out of the body editor entirely — the one place WYSIWYG Markdown editors reliably break
  (a bare `---` parses as a thematic break without a frontmatter plugin).
- Client renders forms from descriptors (no Zod in the bundle), using `radix-ui` primitives.

The write path: form submit → API route → `entityService` (validates against schema, computes
hash, persists, emits `entity:updated`) → `directory-sync` exports to file → git-sync commits.

## Phases

Thin vertical slices: each phase ships an end-to-end working capability, with tests written
first (TDD). The walking skeleton proves the whole pipe on the narrowest possible path.

### Phase 0 — Walking skeleton (one type, frontmatter only, edit→save)

Prove the entire pipe end-to-end on the thinnest path: pick **one** existing non-singleton,
frontmatter-only entity type. No create, no delete, no body, no media.

- Tests first: route requires operator session (401 without); `GET /cms/api/entities/:type/:id`
  returns the entity; `PUT` calls `updateEntity` and the change is observable in the DB;
  descriptor endpoint returns fields for the type.
- Serve a minimal React bundle at `/cms` behind the session guard.
- Client: list entities of the chosen type → open one → render a form from descriptors →
  save → `PUT` → confirm `directory-sync` exports the file (manual smoke + assertion that the
  `entity:updated` event fired).
- Sveltia stays in place, unreferenced, until Phase 5 — no big-bang removal.

### Phase 1 — Full CRUD across all types

- Tests first: create persists a new entity with a server-derived id; delete removes it;
  list spans all registered types; singleton (`isSingleton`) types render a single-record
  editor rather than a list.
- Client: entity-type switcher (`cmdk`), list view, create, delete, singleton handling.
- All writes go through `entityService`; verify each emits the correct `entity:*` event.

### Phase 2 — Markdown body (floor editor)

- Tests first: editing a `hasBody` entity round-trips body content through `updateEntity`;
  body + frontmatter persist together (the API returns them as separate fields — see
  Architecture); preview renders the saved Markdown.
- Body editor at the **Floor** tier: the AI Elements `PromptInputTextarea` (already available)
  plus a `streamdown` preview pane. No new editor dependency. The editor-library upgrade (D1) is
  a later decision (Phase 4), not part of this phase.

### Phase 3 — Media / image upload

- Tests first: an uploaded image creates/updates an `image` entity via `entityService` and is
  referenced from the owning entity; re-opening resolves the reference; `directory-sync` round-trips
  it through the existing image pipeline.
- Client: upload control + image-reference field widget, wired to the existing `image` entity path.

### Phase 4 — Authoring polish

- Tests first: invalid input is rejected with field-level errors _before_ `updateEntity`
  (validation surfaced from the descriptor/schema); concurrent-edit / stale-write handling
  (e.g. `contentHash` precondition) behaves predictably.
- Client: validation UX, optimistic updates, error states, empty/loading states.
- D1 upgrade (optional, driven by authoring feedback against the Phase 2 floor): if the textarea
  is too bare, upgrade the body editor to **Mid** (CodeMirror 6, still perfect round-trip) or
  **Rich** (WYSIWYG). If Rich, add a Markdown serializer and normalize body on import so
  `directory-sync` canonical-hash churn is contained; cover round-trip fidelity with tests.

### Phase 5 — Decommission Sveltia and legacy auth

- Remove the Sveltia shell, CDN pin, and `config.yml` generation.
- Remove the GitHub OAuth and passkey-PAT flows from `plugins/cms` (the token-in-browser path
  is gone). Keep only the operator-session guard.
- Narrow `@brains/cms-config` to the descriptor output the React renderer consumes; drop the
  Sveltia YAML generation if no longer used.
- Update docs and delete this plan once shipped. (The predecessor `cms-github-app-hosted.md`
  token-hardening plan is already retired — its problem, short-lived browser tokens, disappears
  with this editor.)

### Phase 6 (optional, later) — AI-assisted authoring

- Reuse `@ai-sdk/react` to offer inline draft / rewrite / summarise / tag-suggest against the
  entity being edited. Out of scope for the core replacement; tracked separately if pursued.

## Verification

1. `/cms` is unreachable without a valid operator session (401/redirect); reachable with one.
2. No GitHub token is ever sent to or stored in the browser at any point.
3. Editing an entity in the UI updates the row in the entity DB and emits `entity:updated`.
4. The edit is exported to a file by `directory-sync` and committed by git-sync, with no echo
   re-import loop (canonical-hash settles).
5. Create and delete round-trip through `entityService` and through `directory-sync`.
6. `hasBody` entities edit body + frontmatter together (Phase 2+).
7. Media uploads resolve on re-open and round-trip through sync (Phase 3+).
8. Invalid input is rejected with field-level errors before any write (Phase 4+).
9. Sveltia, its CDN pin, and the GitHub/PAT auth flows are gone (Phase 5).
10. Per-package gates pass: `bun run --filter @brains/cms typecheck | lint | test`.

## Open questions

- D1 upgrade target _if_ the Phase 2 floor textarea proves too bare: CodeMirror 6 (Mid) vs
  WYSIWYG (Rich). Not blocking — Phase 2 ships the floor, and the upgrade lives in Phase 4.
- Should the editor live inside `plugins/cms` (recommended) or move to a dedicated
  `interfaces/cms-editor` package alongside `web-chat`? Defaulting to in-place evolution of
  `plugins/cms` to reuse its route/auth wiring.
- Does any consumer still need `@brains/cms-config`'s Sveltia YAML output, or can it be fully
  narrowed to descriptors in Phase 5?

## Related

- [`console-unification.md`](./console-unification.md) — follow-on: shared token sheet
  (`@brains/console-theme`), console strip retrofit onto the shipped editor's appbar, ⌘K
  jump. Mockups: [`docs/console-unification-mockups.html`](../console-unification-mockups.html).
- `plugins/cms/src/plugin.ts` — current Sveltia wrapper and auth flows being replaced.
- `shared/cms-config` — schema → descriptor conversion (`getEffectiveFrontmatterSchema`,
  `getAdapter`, `zodFieldToCmsWidget`); descriptor consumer changes from Sveltia to React.
- `shell/entity-service` — `createEntity` / `updateEntity` / `deleteEntity` / `upsertEntity`.
- `plugins/directory-sync` — entity → file → git export; image-entity support; canonical-hash
  echo-loop prevention.
- `interfaces/web-chat` — React 19 + Vite SPA precedent and component stack to reuse.
- `shell/auth-service` — operator-session guard (`getOperatorSession`).
- `template-renderer-contracts.md` — Astro static-renderer spike; deliberately _not_ coupled.
