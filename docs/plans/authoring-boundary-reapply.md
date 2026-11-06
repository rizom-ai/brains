# Plan: Re-apply the Authoring Boundary on Main

## Status

Proposed. Stable `0.2.0` ships with the public authoring surface every current package needs, proven by every package in the repo using only that surface.

`work/plugin-api-boundaries` (#301, last commit 2026-10-25) built that boundary: a `@brains/sdk` package, a much larger declarative contract in `shell/plugins`, and every entity, plugin and interface converted from a class to a declarative definition. It forked from `main` at `8d4cedf81f` (2026-10-09); `main` has since gained about 1,000 non-merge commits.

- On `main`, 61 source files across 52 packages still extend `ServicePlugin`, `EntityPlugin`, `InterfacePlugin` or `MessageInterfacePlugin`. On the branch, none do. Five of those packages are new since the fork: `entities/guide`, `plugins/action-board`, `plugins/linkedin-import`, `plugins/oauth-broker` and the analytics entity.
- Merging `main` into the branch conflicts in 521 files (298 source, 144 tests). The branch deletes 117 files that `main` kept changing, and `main` deletes 71 files the branch changes. Several features were built on both sides in different ways.
- The class bases are `internal/removable` in the public export ledger on both refs, so they can leave the public surface before stable.

The branch is not merged. It is the reference: each package's `8d4cedf81f..work/plugin-api-boundaries` diff is re-applied to that package's current code on `main`. Close #301 and delete the branch when the last slice has landed.

## Goal

One `main` SHA where every package under `entities/`, `plugins/`, `interfaces/` and `sites/` is a declarative definition importing only `@brains/sdk` and shared libraries, the public entries re-export that SDK, the eight public-authoring fixtures pass, and the boundary rule enforces it.

## Rules

- **Re-apply diffs, not commits.** The branch has about 75 integration merges, and several conversions exist only inside merge resolutions (faq, book, contact, ask-content, prompt, style-guide). Each slice ports the per-package `8d4cedf81f..branch` diff onto `main`'s current code.
- **Main's behavior wins.** Everything `main` changed in a package since the fork is preserved in the declarative form. Where both sides built the same thing differently, `main`'s implementation stays and the declarative form wraps it:
  - auth: `main`'s `AuthBackend` and `context.auth` (#815); the branch's auth capabilities are rebuilt on top of them;
  - ATProto projections: `main`'s `context.atprotoProjections`;
  - analytics: `main`'s typed analytics reports replace the branch's `insights` slot;
  - console routes: `main`'s `WebRouteDefinition.role`;
  - link capture: `main`'s `link:capture` job and `context.apiRoutes.executeTool`;
  - `generation-usage-meter.ts` and faq's `count-asked-before.ts`: `main`'s;
  - book: `main`'s contained entity types;
  - conversation-memory: `main` removed the summary pipeline, so the branch's reworked pipeline is not ported;
  - agent-discovery: `main` removed network pieces, so the branch's network-piece entity is not ported.
- **Migrations are renumbered** after `main`'s latest at the time of the slice (entity-service after `0012`, job-queue after `0008`). The branch's one-way faq job-type renames ship as job-queue migrations in the faq slice.
- **Imports during the migration.** Converted packages import `@brains/sdk`; the #821 ESLint rule admits `@brains/sdk` beside `@brains/plugins`. The last slice replaces it with the branch's dependency-cruiser rule `declared-packages-import-only-the-sdk`, once no package imports `@brains/plugins`.
- **Not ported:** the branch commits `main` already has its own way (dependency bumps, Simple Git 4, pragma budgets, the seven fixes whose changesets exist on both sides), and the branch's stale plan docs (`brain-model-unification.md`, `contract-drift-fixes.md`, its verbose `public-authoring-api-0.2.md`).
- **Each slice is one PR** that lands on `main` green: tests first, every converted package's tests passing, the public-authoring fixtures passing, a changeset for every published package it changes.

## Slices

1. **SDK scaffold and prompt (walking skeleton).** `packages/brain-sdk` re-exporting the current public surface; `@rizom/brain` entries re-exporting the SDK; `brain-definition` and `configured-plugin` moved from `shell/app` into the SDK; the `defineEntity` `config` slot; `entities/prompt` converted; `canonical-brain.ts` wired.
2. **Public UI package.** `shared/ui-library` becomes `packages/ui` (`@rizom/brain-ui`, published), with every consumer's imports updated.
3. **Entity contract and schema-only entities.** The entity contract (codec, seed, data sources, create routing, attachments); style-guide, ask-content, wishlist, doc, series, document with `shared/document`, image with `shared/image`.
4. **Small service slots.** `defineSubscription`, ready, seeds and ordering, declared routes, data sources and widgets; notifications, onboarding, obsidian-vault, atproto-registry, profile; site-info moved to `plugins/site-info`; the knowledge map extracted from topics into `plugins/knowledge-map`.
5. **Generating and publishing entities.** Generation, publish and projection families; blog, decks, portfolio, social-media, link, note; feeds in `shared/site-composition` and the site-builder feed handler.
6. **Auth capabilities.** The branch's auth capabilities rebuilt on `AuthBackend`; admin, unified-inbox, playbooks.
7. **Interfaces.** The interface contract (route contract and runtime, declared subscriptions, operator contributions) and the scheduled-maintenance move into `@brains/scheduler`; chat-repl, email, mcp, a2a, chat, web-chat.
8. **Runtime HTTP host.** `interfaces/webserver` becomes `shell/http-host`, started by the shell; top-level `port` and an `http` section replace `plugins.webserver`. Site-builder's serving paths move with it.
9. **Large services.** content-pipeline, dashboard, site-builder, site-content, newsletter, email-workflows, atproto, stock-photo, contact, analytics, studio, directory-sync with the entity mirror.
10. **Heavily changed hybrids.** topics, conversation-memory, agent-discovery, assessment, faq, book; the shell's conversation projection backfill and poller; entity-service's `apply-entity-*`.
11. **New packages and close-out.** guide, action-board, linkedin-import, oauth-broker and the analytics entity converted; the class bases removed from the public entries; the SDK-only boundary rule; the `@rizom/brain/testing` entry and harness; the public-authoring fixtures including `reminders`; the export ledger; the authoring guides (`AUTHORING_API_0.2.md`, the migration guide, the external authoring guides); the site packages' declarative data sources.

Slices 2–5 depend on slice 1; slice 6 on slice 4; slice 7 on slices 4 and 6; slice 8 follows slice 7; slices 9 and 10 follow slices 3–6 (site-builder after slice 8); slice 11 comes last.

## Risks

- **Main keeps moving.** Each slice re-reads its packages on `main` when it starts, not from this inventory.
- **Contract size.** The branch grew the service contract from 459 to 1,821 lines and the declarative entity runtime from 295 to 2,059. Each slice lands only the slots its packages use, so no unused contract ships.
- **Release timing.** Stable `0.2.0` waits for slice 11. Durable binary assets (#476) proceed independently.
