# Plan: Re-apply the Authoring Boundary on Main

## Status

Proposed. Stable `0.2.0` ships with the public authoring surface every current package needs. The public API is fixed first, tested by the public-authoring fixtures; then every package in the repo moves onto it.

`work/plugin-api-boundaries` (#301, last commit 2026-10-25) built that boundary: a `@brains/sdk` package, a much larger declarative contract in `shell/plugins`, and every entity, plugin and interface converted from a class to a declarative definition. It forked from `main` at `8d4cedf81f` (2026-10-09); `main` has since gained about 1,000 non-merge commits.

- On `main`, 61 source files across 52 packages still extend `ServicePlugin`, `EntityPlugin`, `InterfacePlugin` or `MessageInterfacePlugin`. On the branch, none do. Five of those packages are new since the fork: `entities/guide`, `plugins/action-board`, `plugins/linkedin-import`, `plugins/oauth-broker` and the analytics entity.
- Merging `main` into the branch conflicts in 521 files (298 source, 144 tests). The branch deletes 117 files that `main` kept changing, and `main` deletes 71 files the branch changes. Several features were built on both sides in different ways.
- The branch's public ledger grows the stable tier from 212 to 486 exports and the advanced tier from 106 to 431. The class bases are `internal/removable` on both refs.
- The branch's own DX audit leaves two isolation defects open: two packages declaring the same interface ID share one state namespace, and upload directories are scoped by declaration ID rather than by owning package.

The branch is not merged. It is the reference: each area's `8d4cedf81f..work/plugin-api-boundaries` diff is re-applied to `main`'s current code. Close #301 and delete the branch when the last conversion has landed.

## Goal

One `main` SHA where the public authoring API is complete and frozen for `0.2.0`, every package under `entities/`, `plugins/`, `interfaces/` and `sites/` is a declarative definition importing only `@brains/sdk` and shared libraries, the public entries re-export that SDK, the public-authoring fixtures pass, and the boundary rule enforces it.

## Decisions

- **API first.** The public surface lands on `main` before any package converts, so no package is converted twice. The branch's conversions of all packages already show the contract's shape works; on `main`, the public-authoring fixtures (the eight contract families plus `reminders`) and their type canaries are the tests the public surface lands with.
- **Public means stable.** A stable export needs a fixture that uses it. Names that exist only for first-party packages (the branch's advanced tier: entity mirrors, infrastructure opt-ins and similar) stay internal under `@brains/sdk/internal/*` and land with the conversion that needs them.
- **Capabilities current packages need, designed into the public API:**
  - _Writing a type another package stewards._ Stewardship stays exclusive; the steward exposes a typed bus contract (#826) for the change, and other packages call it. First consumer: `linkedin-import` filling `anchor-profile` through `profile`.
  - _Writing account settings from the owning package's code_ for one account, through that package's own `defineAccountSettings` definition. First consumer: `linkedin-import` storing the token from its OAuth callback.
  - _A workspace action that sends the caller to a URL the package computes._ First consumer: `linkedin-import` starting OAuth consent. Its callback is a `protocol` route guarded by single-use state. Operator route authentication stays out of the `0.2` ledger, as [http-route-registry-hardening.md](./http-route-registry-hardening.md) decides.
  - _A data source that reads the brain's runtime state._ First consumer: `sites/rizom-ai`'s opening source, which reads it through `shell.getRuntimeState()` today.
  - _A data source that reads another package's data source by id._ First consumers: `sites/rizom-ai`'s opening and asked sources, which reach the knowledge map's source through `shell.getDataSourceRegistry()` today.
- **Both isolation defects are fixed in the public API:** interface state is namespaced by owning package, and upload directories by owning package.
- **Re-apply diffs, not commits.** The branch has about 75 integration merges, and several conversions exist only inside merge resolutions (faq, book, contact, ask-content, prompt, style-guide).
- **Main's behavior wins.** Everything `main` changed since the fork is preserved. Where both sides built the same thing differently, `main`'s implementation stays and the declarative form wraps it:
  - auth: `main`'s `AuthBackend` and `context.auth` (#815) supply caller and Anchor identity;
  - ATProto projections: `main`'s `context.atprotoProjections`;
  - package jobs: `main`'s requester authority (`CallerAuthorizer` in `@brains/content-service`). A job reads with the authority of whoever started it: the tool caller, the route caller or the viewer. A job a daemon starts reads public entries unless the package is granted more;
  - analytics: `main`'s typed analytics reports replace the branch's `insights` slot;
  - console routes: `main`'s `WebRouteDefinition.role`;
  - link capture: `main`'s `link:capture` job and `context.apiRoutes.executeTool`;
  - `generation-usage-meter.ts` and faq's `count-asked-before.ts`: `main`'s;
  - book: `main`'s contained entity types;
  - conversation-memory: `main` removed the summary pipeline, so the branch's reworked pipeline is not ported;
  - agent-discovery: `main` removed network pieces, so the branch's network-piece entity is not ported.
- **Migrations are renumbered** after `main`'s latest at the time of the change (entity-service after `0012`, job-queue after `0008`).
- **Imports during the migration.** A converted package's production code imports `@brains/sdk` and its `@brains/sdk/internal/*` entries only; the #821 ESLint rule refuses `@brains/plugins` there, and each conversion adds its package to the rule's list. Class-based packages keep importing `@brains/plugins` until the last conversion replaces the rule with the branch's dependency-cruiser rule `declared-packages-import-only-the-sdk`.
- **Not ported:** the branch commits `main` already has its own way (dependency bumps, Simple Git 4, pragma budgets, the seven fixes whose changesets exist on both sides), and the branch's stale plan docs (`brain-model-unification.md`, `contract-drift-fixes.md`, its verbose `public-authoring-api-0.2.md`).
- **Every PR lands on `main` green:** tests first, the public-authoring fixtures passing, the export ledger current, a changeset for every published package it changes.

## Phase 1 — The public API

One PR per contract area, in this order:

1. **SDK and entries.** `packages/brain-sdk`; the `@rizom/brain` entries re-exporting it; `brain-definition` and `configured-plugin` moved from `shell/app` into the SDK. Fixture: `brain-definition`.
2. **Entity contract.** The stable entity slots (`config`, codecs, seeds, data sources, create routing, attachments) and projections. Fixture: `entity` and its canaries.
3. **Service contract.** The two-stage `defineServicePlugin`, setup and state, jobs, tools, subscriptions, templates, declared routes, `SdkError`, stewardship with the typed steward contract, and account-settings writes. Fixtures: `service` and its canaries, `reminders`.
4. **Interface contract.** `defineInterface`, `defineMessageInterface` and its package form, daemons, declared routes and uploads; interface state and upload directories namespaced by owning package. No package needs a package-private upload store, so `0.2` has none; when a consumer needs one, it is a directory under the owning package's name that never resolves into the runtime's shared store or another package's scope. A message interface's inbound attachments, links or bytes the interface reads, are kept in the shared store by the runtime, under the upload policy chat uses. The existing stored uploads are decided in Phase 2's interfaces slice. Fixtures: `interface`, `message-interface`.
5. **Operator surfaces.** Studio workspaces, actions including the external launch, Dashboard widgets and account settings. Fixtures: `operator-surface`, `account-settings-interface`.
6. **Public UI and site contract.** `shared/ui-library` becomes `packages/ui` (`@rizom/brain-ui`, published), consumers' imports updated; the `@rizom/site` changes. Fixture: `site`.
7. **Testing entry and docs.** `@rizom/brain/testing` and its harness; the authoring guides (`AUTHORING_API_0.2.md`, the migration guide, the external authoring guides) and a quickstart that teaches the two-stage definition; the final ledger tier audit.

Exit: the public-authoring fixtures pass against packed artifacts, every stable export has a fixture consumer, and no stable name exists only for first-party use.

## Phase 2 — Package conversions

Mechanical migration onto the fixed API, one PR per slice. A gap a conversion finds is an API change with its own fixture test, made before the freeze.

1. **Schema-only entities:** prompt, style-guide, ask-content, wishlist, doc, series, document with `shared/document`, image with `shared/image`.
2. **Small services:** notifications, onboarding, obsidian-vault, atproto-registry, profile (with its steward contract); site-info moved to `plugins/site-info`; the knowledge map extracted from topics into `plugins/knowledge-map`.
3. **Generating and publishing entities:** blog, decks, portfolio, social-media, link, note; feeds in `shared/site-composition` and the site-builder feed handler.
4. **Auth-dependent services:** admin, unified-inbox, playbooks.
5. **Interfaces:** chat-repl, email, mcp, a2a, chat, web-chat; the scheduled-maintenance move into `@brains/scheduler`. Existing stored uploads:
   - `data/upload/uploads` stays where it is, unmigrated. It is the runtime's shared upload store, not an interface's: web-chat, chat, Studio's editor and eval seeding write it, and `system_create`, entity create routes, image, document and note promotion, and attachment restore read the `upload` references it holds. web-chat and chat keep writing it after they convert, through a runtime-owned internal capability rather than the public package-scoped `uploads`. The branch's owner-hashed scope for their uploads is not ported, since its readers stayed on the shared store.
   - `data/discord-chat/uploads` and `data/slack-chat/uploads` retire at chat's conversion: no migration and no legacy read path, and the old platform upload URLs answer 404. Nothing has written them since chat moved its uploads to the shared store (2026-07-13). Chat's conversion deletes both directories once at startup; they hold only expired temporary uploads.
6. **Runtime HTTP host:** `interfaces/webserver` becomes `shell/http-host`, started by the shell; top-level `port` and an `http` section replace `plugins.webserver`; site-builder's serving paths move with it.
7. **Large services:** content-pipeline, dashboard, site-builder, site-content, newsletter, email-workflows, atproto, stock-photo, contact (with forms and quiz), analytics, studio, directory-sync with the entity mirror.
   - email-workflows: the "Inbound email classification failed" warning names its cause as a content-free category (the model call failed, the decision failed its schema, or the classification was not derived from the mail), since the failure handling drops the error to keep mail content out of logs.
   - analytics converts with its traffic-snapshot entity. A snapshot read hands back the stored document, and its metadata indexes only the week's title and totals, so the per-day numbers stay out of metadata, as the class kept them.
8. **Heavily changed hybrids:** topics, conversation-memory, agent-discovery (with the `atprotoDiscovery` entity slot, an internal `@brains/sdk/internal/*` slot rather than a public one, since agent-discovery is its only consumer), assessment, faq (its job-type renames as job-queue migrations), book; the shell's conversation projection backfill and poller; entity-service's `apply-entity-*`.
9. **Packages new since the fork:** guide, action-board, linkedin-import, oauth-broker, the form entity. linkedin-import already fills `anchor-profile` through profile's import contracts (`@brains/profile:import-preview`, `@brains/profile:import-apply`), and profile admits it by the sender the bus stamps, its class plugin id `linkedin-import`, the default of profile's `importers`. Declared, its sender is its plugin id: `@brains/linkedin-import:linkedin-import`, or `linkedin-import` if the composer keeps that legacy id; unless it keeps that id, the `importers` default changes with it.
10. **Close-out:** the class bases removed from the runtime and the remaining `internal/removable` names with them; the SDK-only boundary rule; the site packages' declarative data sources. First, three external packages in their own repositories move to the declarative API. They import the class API, which the public entries stopped exporting on 2026-08-07, so they are already broken against current builds:
    - `~/Documents/site-smoke-canary` (`src/plugin.ts`, `src/index.ts`, `src/routes.ts`);
    - `~/Documents/brain-plugin-hello` (`src/index.ts`);
    - `~/Documents/brain-plugin-recipes` (`src/index.ts`).

Slices 2–10 follow slice 1; slice 4 needs slice 2's profile contract; slice 6 follows slice 5; site-builder in slice 7 follows slice 6; slice 10 comes last.

## Risks

- **Main keeps moving.** Each PR re-reads its area on `main` when it starts, not from this plan.
- **Contract without first-party consumers.** Phase 1 lands contract code before any first-party package uses it. The fixtures and canaries are its consumers; anything only a first-party package needs waits for that package's conversion.
- **Release timing.** Stable `0.2.0` waits for Phase 2's close-out. Durable binary assets (#476) proceed independently.
