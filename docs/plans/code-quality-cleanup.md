# Code-quality cleanup

## Status

In progress. Phases 1–3 are complete on `work/code-quality-cleanup`; phases 4–5 remain. Sourced from a five-agent codebase review (2026-07-25) covering `shell/`, `plugins/`, `entities/`, `shared/`, and `interfaces/`+`packages/`+`brains/`. All load-bearing claims below were re-verified against the current tree before this plan was written. Work happens in worktree `~/Documents/brains-worktrees/code-quality-cleanup` (branch `work/code-quality-cleanup`); each phase lands independently green.

Phase 3 deviations: the topics/conversation-memory eval-handler `./eval` move was dropped — the handlers are statically registered by their plugins at runtime, so a subpath export changes neither bundling nor registration (needs a config-gated registration design, and note `createSwotEvalPlugin`, the "assessment pattern", itself has zero consumers). The interface-barrel sweep was folded into phase 5's public-surface collapse.

## Decisions

- **Delete `plugins/sveltia-cms`.** Self-described as "Archived … superseded by the first-party editor in `@brains/cms`"; zero importers outside its own package (only `.changeset/pre.json` mentions it). Git history preserves it.
- **Delete `shared/theme-signal`.** Zero consumers — no package depends on it, no `brain.yaml` references it; only a prose sentence in `sites/smoke-canary/README.md`. Deleting beats wiring it into smoke-canary because smoke-canary already exercises the theme pipeline via its real theme; resurrect from git if a second canary theme is ever wanted.
- **Delete `scripts/sync-versions.ts`** plus the `version:set`/`version:sync` root scripts. It scans only `packages/` and a nonexistent `apps/` (7 of 8 workspace globs missed) and would desync the repo; changesets/CI own versioning.
- **Keep `rizom-ecosystem` registered in rover.** Verified live: `rover-pilot/users/rizom-ai/brain.yaml` adds it via instance overrides. Fix is a justification comment beside the registration (same style as `products`).
- **No `doc`/`document` rename.** The one-character collision is real, but `entityType` strings are persisted in entity DBs and serialized markdown; renaming is a data migration with zero correctness payoff. Mitigate by documenting the distinction in `entities/README.md`.
- **Ranger retirement is out of this plan** — already scheduled by `docs/plans/brain-model-unification.md`.
- **`playbooks` lifecycle-starters stays** — reserved for a future welcome-on-new-install flow.
- **Discord interface consolidation is in scope (phase 5)** but must preserve `brain.yaml` compatibility: existing configs reference interface key `discord`, so the resolver maps that key onto `chat` with the Discord adapter enabled. Coordinates with `docs/plans/discord-opt-in-plan.md` (ops scaffolding defaults — unaffected by which package implements the interface).

## Phase 1 — Dead code deletion

Shippable alone; no behavior change.

1. `git rm -r plugins/sveltia-cms shared/theme-signal scripts/sync-versions.ts`; drop `version:set`/`version:sync` from root `package.json`; remove the `theme-signal` entry from `.syncpackrc.json` and the stale sentence in `sites/smoke-canary/README.md`; drop both packages from `.changeset/pre.json`.
2. Remove the 13 phantom package directories (untracked build detritus only — verified `git ls-files` empty for each): `entities/{newsletter,playbook,style-guide}`, `shared/{cms-config,deploy-templates,effect-runtime,mcp-bridge,product-site-content}`, `plugins/{buttondown,examples,hackmd,notion,profile}`.
3. Add the justification comment for `rizom-ecosystem` in `brains/rover/src/index.ts` (pointing at rover-pilot's rizom-ai overrides).
4. Fix `entities/README.md`: remove the phantom `newsletter` row, add the missing packages, document the `doc` (documentation pages) vs `document` (binary artifacts) distinction.
5. Verify: `bun install` (lockfile), full `turbo typecheck test`, lint via root wrapper, `bun run docs:check && bun run docs:links`.

## Phase 2 — Correctness cluster

Each item is small, independent, and lands tests-first.

1. **`interfaces/chat` env schema.** Chat is the only secret-consuming interface without `src/env-schema.ts`, so `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`/`SLACK_SIGNING_SECRET` and the Discord vars never reach generated `env.schema.template`s or `secrets push` candidates (the same silent-missing-secret class that bit rizom at alpha.207 and yeehaa.io this week). Mirror `interfaces/discord/src/env-schema.ts`, export from package.json, compose into `brains/rover/src/env-schema.ts`, regenerate templates via `scripts/sync-env-templates.ts`. Test: template snapshot includes the Slack vars.
2. **Unify confirmation integrity in shell/core system tools.** create/generate/delete validate a `ConfirmationArgsStore` token; update relies on a contentHash compare only; extract (`entity-extract-tool.ts:41-53`) returns `confirmed: true` with no integrity check. Extract a `confirmable(...)` helper into `shell/core/src/system/tool-helpers.ts` that always mints/validates a token; update keeps contentHash as an additional precondition. Also dedup the token-identical `runCreateInterceptor`/`runGenerateInterceptor` pair. Tests: replay/tamper cases for update and extract that fail pre-fix.
3. **Single queue-mutation surface in content-pipeline.** Three entry points (MCP tool, message bus, CMS workspace) enforce different preconditions; message-bus `remove` checks no permission; the tool path's `publicationQueueService ?? queueManager` fallback (`tools/queue.ts:127-128`) can bypass status persistence entirely. Make `PublicationQueueService` the only mutation surface with status preconditions and permission asserts built in; delete the `add` alias and the fallback; entry points become thin adapters. Tests: message-bus remove without permission fails; tool mutations persist status.
4. **One `brain.yaml` schema.** `packages/brain-cli/src/lib/brain-yaml.ts` validates with its own 6-field loose object while the runtime uses the full `instanceOverridesSchema` — a file the CLI accepts can fail at boot. Export a parse helper from `@brains/app` and delete the CLI's schema (keep its `resolveModelName` normalization).
5. **Declare phantom workspace deps.** `shell/plugins` → entity-service/mcp-service/content-service; `shell/identity-service` → conversation-service; `shared/test-utils` → six undeclared packages (and promote its src-used devDeps). These edges are invisible to turbo's graph today.
6. **One data-URL/format module, one HTML escaper.** Two exported `detectImageFormat`s disagree on unknown input (`"png"` vs `null`); four `escapeHtml`s with three escape sets. Canonical `parseDataUrl`/`sniffImageFormat` in `@brains/image`, canonical `escapeHtml`/`escapeHtmlAttr` in `@brains/utils`; migrate site-engine, auth-service, cms callers.
7. **Restart-safe pending approvals in chat-repl.** Construct the shared `PendingApprovalTracker` with `loadMessages` instead of the in-memory `pendingConfirmationIds` array (the discord copy dies with phase 5).

## Phase 3 — Mechanical dedup and adoption

No new abstractions; pure convergence on existing exports. Lint-enforceable where possible.

1. **Collapse the `isolatedDeclarations` workarounds.** Entities: replace every `const xParserSchema: XSchema = z.object({…})` byte-copy with `const xParserSchema: XSchema = xSchema;` (101 occurrences; decks has already drifted) and delete the third hand-written view-schema copies in `plugin.ts`/`register-templates.ts` in favor of imports. Shell: collapse the 20 `xInternal` + `export const x: typeof xInternal = xInternal` pairs to single annotated exports.
2. **Import instead of copy:** `contentVisibilitySchema` (8 copies — it _is_ exported from `@brains/plugins`, the copies just predate that) and `paginationInfoSchema` (6 copies).
3. **Helper adoption codemod:** `getErrorMessage` (~70 inline ternaries repo-wide; add an optional fallback param), `formatDate` (7 forks with `en-US`/`en-GB` disagreement on the same site), `truncateText`, `pluralize`; delete playbooks' private `errorMessage`. Add an ESLint `no-restricted-syntax` rule for the `instanceof Error ? .message : String(…)` ternary.
4. **`jsonResponse`/`jsonError` in `@brains/plugins`**; delete the atproto-registry and cms locals. Convert raw tool literals (playbooks, atproto-registry, stock-photo, content-pipeline/publish) to `createTool`; playbooks' singular `playbook_*` names become an explicit name override. Delete the shadowed no-op `createTool` in `shell/plugins/src/public/types.ts`.
5. **Dead-export pruning:** the shell list (`enableWALModeForConversations`, `getStatusAfterUpdate`, `prepareSearchQuery`, `deserializeMetadata`, `isFileNotFoundError`, `getRuntimeNodeEnv`, `loadCliEnvironment`, …), `agentContextPermissionLevelSchema` in contracts, interface-barrel exports with zero external consumers, atproto's redundant empty `getTools` override. Move `TestSchedulerBackend` (307 of 483 lines of scheduler's entry) to a `./test` export; move topics/conversation-memory eval handlers (1,101 lines) to `./eval` subpath exports following assessment's pattern.
6. **Test scaffolding convergence:** shared `resetAllSingletons`/`createTestConfig` in `shell/core/test/helpers/`; `createTempDataDir` in `@brains/plugins/test` (or default harness `dataDir`); adopt `mockFetch` from test-utils in the six hand-rolling plugin test files.

## Phase 4 — Extract-at-two abstractions

Each extraction has ≥2 (mostly 3-4) near-identical implementations today.

1. **SQLite support:** `createSqliteDatabase` + `runPackageMigrations` shared by entity-service/job-queue/conversation-service/runtime-state (conversation-service's copy already dropped `busy_timeout` — drift bug fixed by convergence); one parameterized migrate CLI replacing four identical 33-line wrappers; drizzle-config factory.
2. **Media providers:** add `renderPrintablePdf` to `@brains/media-page-composer`, then `createOgImageProvider`/`createPrintableProvider` factories; migrate blog off its hand-rolled mkdtemp/render/screenshot path (it missed the earlier `renderOgImagePng` migration). ~700 LOC across blog/decks/portfolio/products.
3. **`SerializedStatusStore<T>`** (write-queue + memoized load + persist) in `@brains/plugins`, replacing verbatim engines in directory-sync, site-builder, and playbooks' run-store.
4. **`@brains/utils/zod-introspect`** for the Zod-`def`-poking shared by `plugins/cms` and `plugins/obsidian-vault` (third copy dies with sveltia-cms).
5. **Theme consolidation:** move the token-only utility layers, shared `@theme inline` aliases, and dark-status palette into `theme-base` (182 identical lines between rizom and rizom-ai today); pick one composition path (`composeTheme` everywhere — themes stop hand-concatenating `defaultThemeCSS`); `buildThemePackage` script helper replacing three identical build scripts.
6. **`rizom-ui` depends on `@brains/ui-library`** and re-exports `cn`/`renderHighlightedText` instead of carrying byte-copies; `WidgetCard` shell component absorbing the 13 duplicated card/empty-state blocks in ui-library widgets.
7. **CLI kit shared by brain-cli/brains-ops:** `defineCommand` registry deriving parseArgs options and help text (both currently hand-maintain flag tables in 3-4 places); move `logMissingSecrets`/`logKeyGroup` into `@brains/deploy-support`.
8. **Shell wiring dedup:** `createAINamespace` (24-line clone in entity+service contexts), `createScopedServiceLayer` (4 near-identical `effect.ts` files), CMS workspace registration helper with a declarative permission field (3 divergent copies — content-pipeline's currently skips the anchor gate), `context.dashboard.registerWidget` namespace (13 raw-channel call sites).

## Phase 5 — Structural consolidation

Separate slices; each needs its own careful landing.

1. ~~**Delete `interfaces/discord`.**~~ Code done; **the yeehaa.io deployment migration is outstanding — see step 1a.** The plan's premise was wrong twice over. Chat's adapter was not a strict superset: it had no linked-account identity resolution (`getActiveAuthService().resolveIdentityAccess`) and no passive space capture. Both were ported into `@brains/chat` first. And no resolver alias was built — the Chat SDK adapter hard-requires `publicKey` and `applicationId`, which a `botToken`-only `brain.yaml` cannot satisfy, so aliasing the `discord` key would have produced a silently skipped interface instead of a working one. `discord` is simply gone as an interface id; `chat` takes its place in every preset and wires the adapter from `DISCORD_BOT_TOKEN`/`DISCORD_PUBLIC_KEY`/`DISCORD_APPLICATION_ID`.

   Two findings outside the stated scope, both fixed in the same commit: the release train was already broken — phase 1 deleted `plugins/sveltia-cms` and `shared/theme-signal` but left five retained pre-mode changesets naming them, and `changeset version` throws on any package not in the workspace; and `brains/relay` registered the Discord interface without ever declaring `DISCORD_BOT_TOKEN`, so the var reached neither its `env.schema.template` nor its `secrets push` candidates.

2. **Migrate `yeehaa-io/brain.yaml` before its next deploy.** Outstanding. It is the only live instance still on the old shape (`mylittlephoney` is deprecated; the `doc-brain` checkout is gone). Without this the interface is skipped at boot with a `Skipping interface "chat"` warning and Discord goes silent — the failure is quiet, so do it ahead of the deploy rather than after.

   ```yaml
   plugins:
     chat:
       adapters:
         discord:
           botToken: ${DISCORD_BOT_TOKEN}
           publicKey: ${DISCORD_PUBLIC_KEY}
           applicationId: ${DISCORD_APPLICATION_ID}
   ```

   Then push `DISCORD_PUBLIC_KEY` and `DISCORD_APPLICATION_ID` (both from the Discord developer portal, neither secret) via `brain secrets push`. No `add: - chat` is needed — `preset: full` already carries it. `anchors: ["discord:…"]` and any `discord:*` permission rules are unaffected: they select on the message origin namespace, which is still `discord`.

3. ~~**Remove the shell singleton machinery.**~~ Done. "Zero production callers" was wrong: `EntityService` fell back to `EntityRegistry.getInstance()` when no registry was passed, and `brain-cli`'s `operate` fell back to `Shell.getInstance()` for "older boot functions" that no longer exist. Both are now explicit — the registry option is required, and a boot that returns no brain is an error rather than a silent reach for process-global state. 35 classes lost `getInstance`/`resetInstance`/`static instance`; `service-singletons.ts`, `reset.ts`, and 65 test reset calls went with them. Four ambient registries keep theirs and are allow-listed in the guard: `Logger`, `AtprotoProjectionRegistry`, `EntityUrlGenerator`, `EvalHandlerRegistry`. The old three-file source grep in `service-ownership.test.ts` is replaced by a repo-wide one, so a new singleton fails the suite wherever it is added.
4. **God-file splits:** `plugins/atproto/src/plugin.ts` (1,296 → identity/discovery-admission/publishing/routes modules, following the already-extracted `jetstream-consumer.ts` precedent), `shell/app/src/brain-resolver.ts` (976 → resolver/ modules), `plugins/cms/src/editor-routes.ts` (1,059 → routes/ modules), `plugins/playbooks/src/plugin.ts` (1,125 → schemas/tools/lib), `interfaces/web-chat/ui-react/src/App.tsx` (1,027 → hooks + components), `interfaces/chat/test/chat-interface.test.ts` (6,606 → split along src module boundaries; shared mocks to test-utils).
5. **Collapse the `shell/plugins/src/public/*` delegate hierarchy** (1,322 lines, one consumer) via a generic hook-delegate factory; make `shell/app/src/contracts/brain-definition.ts` re-export the real types instead of hand-mirroring them (currently degrades `site`/`permissions`/`deployment` to `unknown`).
6. **`MessageInterfacePlugin` split:** extract `ProgressMessageCoordinator` (the three tracking Maps + cleanup/edit/buffer logic) and upload policy; class keeps only transport hooks.
7. **Contracts hygiene:** merge `email-contracts` into `notification-contracts` (same shape, email is a recipient variant); push single-owner channel groups (`BUTTONDOWN_`, `SERIES_`, `PROJECT_`, `SOCIAL_`, `PUBLISH_ASSET_`, `CONVERSATION_`) from `shared/contracts` down to their owning packages; delete the `shell/plugins/src/message-channels.ts` re-export barrel; relocate `dbConfigSchema` and the playbook starter schema to their single consumers.

## Verification per phase

`bun install` when manifests change; `turbo typecheck test` scoped to affected packages plus one full run before each phase commit; lint via `bun scripts/lint.mjs --force --filter=<pkg>` from root; `bun run docs:check && bun run docs:links` when docs change. Phases 2-5 are tests-first: every behavioral fix lands with a test that fails on the pre-fix tree.
