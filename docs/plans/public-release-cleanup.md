# Public Release Cleanup Plan

**Goal:** Take `rizom-ai/brains` from a private monorepo with 2,322 commits of solo development history to a clean, publishable open-source repo, with zero risk of leaking private content from history.

**Strategy:** Option B from the cleanup discussion — squash to a clean baseline via orphan commit, keep the existing repo as a private archive, push the clean snapshot to a fresh public repo location.

**Status:** On hold pending completion of the public plugin feature. Several earlier phases are already complete, but no further execution should continue until that short-term product work is finished. Preflight scan results and completed pre-work are in §10.

---

## 1. Goals and non-goals

### Goals

- Publish a clean `v0.1.0` of the brains framework as open source (per D8)
- Zero leakage of private content from the 2,322-commit history
- Preserve full development history privately for `git blame` / `git bisect` / archival
- Zero downtime on the `rizom-ai/brains` URL during the transition (per D1: stage at `brains-temp`, then double-rename)
- Set up the new public repo with sensible day-one security defaults

### Non-goals

- Preserving public commit narrative pre-v1.0 (intentionally discarded)
- Migrating GitHub issues / PR cross-references (none external yet)
- Open-sourcing private brain instances that are not intended to ship publicly (`apps/collective-brain`, `apps/team-brain`, `apps/mylittlephoney`)
- Open-sourcing internal strategy docs (`docs/plans/monetization.md`, etc. — see §2)

---

## 2. Locked decisions

All decisions below are final. No open questions remain before execution.

| #   | Decision                                       | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Public repo URL                                | **Stage at `rizom-ai/brains-temp`** (new public repo). When fully verified, do a double-rename: `rizom-ai/brains` → `rizom-ai/brains-private`, then `rizom-ai/brains-temp` → `rizom-ai/brains`. Zero downtime; the public URL never has a moment of being broken.                                                                                                                                                                                                                 |
| D2  | What ships in v0.1.0 (workspace surface)       | Per §3 inventory: `shell/*`, `shared/*` (minus extracted branded themes), `plugins/*`, `entities/*`, `interfaces/*`, `packages/*`, all three brain models (`rover`, `ranger`, `relay`), `sites/{default,rizom}`, `layouts/{personal,professional}`, three monorepo apps (`rizom-ai`, `rizom-work`, `rizom-foundation`), all of `docs/plans/*`, selected top-level docs. `yeehaa.io` has been extracted to its own standalone repo.                                                |
| D3  | App disposition (revised 2026-04)              | **Stay public in monorepo**: `apps/rizom-ai`, `apps/rizom-work`, `apps/rizom-foundation`. **Already extracted to standalone public repo**: `apps/yeehaa.io`. **Delete**: `apps/team-brain`, `apps/collective-brain` (transitional, being replaced by the rizom public sites). **Extract to standalone private repo**: `apps/mylittlephoney`.                                                                                                                                      |
| D4  | `brains/relay` and `brains/ranger` (revised)   | **Public source, no published artifacts.** Both brain models are now actively used by the public-facing rizom-ai and rizom-foundation apps, so their source must be in the public monorepo for the workspace resolver. They are NOT published as docker images (publish-images matrix stays at `[rover]`) and they carry strong README disclaimers identifying them as internal-use brain models for the framework's own marketing sites. Use `rover` for any external reference. |
| D5  | `docs/plans/*`                                 | **All public.** Phase 1 still scans each file for PII/secrets; any flagged file gets fixed or excluded individually, but the default is ship.                                                                                                                                                                                                                                                                                                                                     |
| D6  | CHANGELOG narrative                            | Hand-write a single `v0.1.0` entry summarizing pre-launch development at high level. `.changeset/` flow takes over going forward.                                                                                                                                                                                                                                                                                                                                                 |
| D7  | Dev archive lifetime                           | **Keep indefinitely.** Storage is free and bisect-on-old-bug is invaluable.                                                                                                                                                                                                                                                                                                                                                                                                       |
| D8  | First public tag                               | **`v0.1.0`** — explicitly pre-stable, signals breaking changes expected before 1.0.                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | License                                        | **Apache-2.0** (unchanged from current `LICENSE`).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D10 | Author identity in fresh history               | **`yeehaa@offcourse.io`** (unchanged).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D11 | `yeehaa.io` as example domain in code and docs | **Leave as-is.** It's the author's own public domain, used as canonical example throughout ~40 files. Not a leak; no scrub.                                                                                                                                                                                                                                                                                                                                                       |

---

## 3. Workspace inventory (revised 2026-04)

The current workspace globs in `package.json` are:

```
shell/*, shared/*, plugins/*, entities/*, layouts/*,
interfaces/*, brains/*, sites/*, packages/*
```

(Note: `apps/*` was removed from workspace globs when apps became lightweight instance packages. Apps are no longer workspace members at all; they're consumed by the brain CLI at runtime.)

### Default-public (ship in v1.0)

**Framework code:**

- `shell/*` — core framework (entity-service, ai-service, messaging-service, app, core, …)
- `shared/*` — utilities, types, test-utils, mcp-bridge, image, config packages, plus active themes (`theme-base`, `theme-default`, `theme-rizom`)
- `entities/*` — entity definitions (post, link, deck, blog, note, project, social-media, topics, portfolio, summary, wishlist, image, agent-discovery, prompt, site-info, newsletter, products, series, …)
- `interfaces/*` — cli, mcp, webserver, discord, a2a, chat-repl
- `plugins/*` — all plugins (analytics, buttondown, content-pipeline, dashboard, directory-sync, examples, hackmd, notion, obsidian-vault, site-builder, site-content, stock-photo, newsletter composite)
- `packages/*` — brain-cli (`@rizom/brain`)
- `layouts/{personal,professional}` — generic building blocks

**Brain models (all three):**

- `brains/rover` — stable reference brain model. Published as docker image.
- `brains/ranger` — internal brain model for `apps/rizom-ai`. Public source, **not published**, strong README disclaimer.
- `brains/relay` — internal brain model for `apps/rizom-foundation`. Public source, **not published**, strong README disclaimer.

**Sites (2 current shared packages):**

- `sites/default` — generic out-of-box site package (used by rover by default)
- `sites/rizom` — rizom brand site (used by `apps/rizom-ai` and `apps/rizom-foundation`)

**Branded themes that ship publicly (paired with public sites):**

- `shared/theme-rizom` — rizom brand theme (paired with `sites/rizom`)

**Apps (4 current) — lightweight instance packages, not workspace members:**

- `apps/rizom-ai` — marketing site for the framework
- `apps/rizom-work` — public rizom.work instance
- `apps/rizom-foundation` — manifesto/foundation site
- `yeehaa-io` standalone repo (extracted from `apps/yeehaa.io`) — maintainer's personal brain instance, real production reference

**Top-level files / directories:**

- `LICENSE`, `README.md` (rewritten for public), `CONTRIBUTING.md`, `SECURITY.md`, `STABILITY.md`, `CHANGELOG.md` (new for v0.1.0), `KNOWN-ISSUES.md` (review)
- `tsconfig.json`, `package.json`, `bunfig.toml`, `turbo.json`, `.changeset/`, `.dependency-cruiser.js`, `.eslintrc.cjs`, `.prettierignore`, `.gitignore`, `.dockerignore`, `.husky/`, `.github/workflows/` (now fork-safe per Phase 1)
- `scripts/` — audited for hardcoded paths in Phase 1
- `deploy/` — public deploy templates (docker, Hetzner Kamal templates)
- `docs/` — selected (architecture-overview, brain-model, plugin-system, plugin-development-patterns, tech-stack, theming-guide, mcp-inspector-guide, all of `docs/plans/*` per D5, plus a curated `docs/roadmap.md`)

### Default-private (excluded — will be deleted from monorepo before going public)

**Apps to delete entirely:**

- `apps/team-brain` — transitional, being replaced by rizom-ai/foundation
- `apps/collective-brain` — transitional, being replaced by rizom-ai/foundation

**Apps to extract to a standalone private repo:**

- `apps/mylittlephoney` — maintainer's personal site, lives on its own. Extracted with its paired `sites/mylittlephoney` and `shared/theme-mylittlephoney`.

**Sites to delete (paired with deleted apps):**

- `sites/ranger` — only consumer was `apps/collective-brain`

**Sites to extract (paired with extracted apps):**

- `sites/mylittlephoney` — with `apps/mylittlephoney`

**Themes to delete (paired with deleted sites):**

- `shared/theme-ranger` — only consumer was `sites/ranger`

**Themes to extract (paired with extracted sites):**

- `shared/theme-mylittlephoney` — with `sites/mylittlephoney`

**Agent / IDE config:**

- `.agents/`, `.claude/`, `.pi/` — agent-specific config (working state for various AI assistants)
- `.envrc` — direnv config, may have local paths
- `skills-lock.json` — agent skill lock file

**Docs to review individually (some may already be public-eligible):**

- `docs/cost-estimates.md`, `docs/dashboard-prototype.html`, `docs/codebase-map.html`, `docs/health-checks-plan.md`, `docs/app-package-improvements.md`, `docs/universal-progress-routing-architecture.md`, `docs/messaging-system.md`
- `docs/design/` — keep `bioluminescent-infrastructure.md` and `rizom-ai.html`; review the rest

**Already deleted from the tree (no action needed):**

- `entities/agent-directory/` — orphan from earlier cleanup

> **Note on `"private": true`:** nearly every workspace package has this flag. It's a workspace-hygiene convention to prevent accidental `npm publish`, not a content-privacy marker. Do not use it as a signal for what to include/exclude.

---

## 4. Phases

### Phase 0 — Decide (you, async)

Read this doc, fill in §2 decisions, optionally edit §3 inventory. **Already complete** — see §2.

### Phase 1 — Audit HEAD and fix findings in place

**This is the first execution phase, intentionally before backup.** It's purely non-destructive (reads + targeted in-place fixes against the live repo with full git safety net), and it's where the most uncertainty lives. Front-loading it means:

- We discover any real problems while it's still cheap to iterate
- The post-audit state is what gets backed up in Phase 2 (cleaner archive)
- Findings can update the §3 inventory before Phase 3 starts removing files

We're discarding history, so we only need to audit the _current tree_ — but we need to audit it carefully because whatever is there becomes the public `v0.1.0`.

> **Preflight has already handled the mechanical pre-work.** See §10 for what's done. Phase 1 now focuses on the remaining audit.

1. **Secrets scan on HEAD only** (not history — we're throwing history away):
   ```bash
   gitleaks detect --source . --no-git
   ```
   Triage every finding. False positives → allowlist; real ones → fix.
2. **`yeehaa.io` sweep** — per D11, leave as-is. No action needed. (The codebase uses `yeehaa.io` as the canonical example domain in ~40 files; it's the author's own public domain and not a leak.)

3. **Personal info scan** — grep for remaining PII patterns:
   ```bash
   rg -i 'yeehaa@offcourse\.io|hetzner-token|bunny-key|discord:[0-9]{15,}|rizom-ai/(professional-brain|team-brain|collective-brain)' \
     --glob '!**/node_modules/**' --glob '!**/.git/**'
   ```
4. **`.env*` files** — confirm none are tracked:
   ```bash
   git ls-files | grep -E '\.env($|\.)'
   ```
5. **AGENTS.md / agent files** — review for anything personal/private; keep them vendor-neutral.
6. **`.github/workflows/*.yml`** — two passes:
   - **Secret references**: must be `${{ secrets.X }}`, never inline.
   - **Fork-safety**: any workflow that publishes to a registry, deploys, or otherwise touches infrastructure (`publish-images.yml`, anything pushing to GHCR, anything calling Hetzner) must be conditional on `if: github.repository == 'rizom-ai/brains'`. Forks running CI shouldn't try to push to your registry or deploy to your infra. Audit each `on: push` / `on: release` workflow individually.
7. **`docs/plans/*`** — per D5, all public by default. Scan each file for PII/secrets; fix in place or exclude any individual file that fails.
8. **`brains/rover/eval-content/`** — this gets shipped as the seed content in the default brain. Read every markdown file; confirm nothing personal.
9. **Per-plugin README and tests** — quick read for hardcoded paths, test data with personal content, leftover TODOs that name people.
10. **`packages/brain-cli/package.json` author field** — `"Yeehaa <yeehaa@rizom.ai>"` is legitimate npm author metadata; keep.
11. **`brain init` default preset** — confirm the generated `brain.yaml` template uses `preset: core`, not `preset: full`. Core is the on-ramp; full is the "and here's everything rover can do" demo. Fix in place if wrong.
12. **Commit all in-place fixes** to the live repo as small focused commits (per the pattern already established by `f5dfb6f5` and `9b7f5c4a`). After this, HEAD is the state we want preserved as the private archive.

**Exit criteria:** Clean gitleaks run on HEAD, no surprise PII matches, decisions made on every borderline file, every workflow audited for fork-safety, all fixes committed to the live repo. Estimated time: **2–3 hours**.

### Phase 2 — Backup and freeze

Now that HEAD has been audited and fixed, snapshot it. The backup captures the state we actually want preserved as the private archive — not an intermediate pre-cleanup snapshot.

1. Create a sibling backup clone of the current repo:
   ```bash
   cd ~/Documents
   git clone --mirror brains brains-backup-$(date +%Y%m%d)
   ```
2. Push current state to a backup branch on the remote:
   ```bash
   cd brains
   git checkout main
   git pull
   git checkout -b archive/pre-public-release
   git push origin archive/pre-public-release
   ```
3. Verify the backup is intact (`git log --oneline | wc -l` should show ~2,322 plus however many audit-fix commits Phase 1 added).

**Exit criteria:** Two independent backups exist (local mirror + remote branch), both reflecting the post-audit state. Estimated time: **15 minutes**.

### Phase 3 — Build the clean tree

The original plan worked in a sibling staging clone. The revised plan splits Phase 3 into two sub-phases that operate on the **live repo** instead, because most of the deletions are now also dev-tree cleanup we want regardless of the public release (transitional apps going away, theme-ranger no longer needed, etc.). This means the dev archive ALSO becomes clean, not just the public copy.

#### Phase 3a — In-tree cleanup (live repo)

This is mechanical deletion plus a rename. All of it lands as commits on `main` and stays in the dev history.

1. **Finish the lingering `apps/professional-brain` → `yeehaa-io` cleanup**. The monorepo directory has now been extracted, and the branded yeehaa app/theme/site packages are gone from the monorepo; clean any remaining historical references in docs and examples as they surface.
2. **Delete transitional apps and their paired sites/themes:**
   ```bash
   git rm -r apps/team-brain
   git rm -r apps/collective-brain
   git rm -r sites/ranger
   git rm -r shared/theme-ranger
   ```
3. **Add strong README disclaimers** to `brains/ranger/README.md` and `brains/relay/README.md` clearly marking them as internal-use brain models, with a pointer to `brains/rover` as the public reference.
4. **Delete agent/IDE configs and dotfiles** that don't belong in a public repo:
   ```bash
   git rm -r .agents .claude .pi 2>/dev/null || true
   git rm .envrc skills-lock.json 2>/dev/null || true
   ```
   (Some of these may be gitignored; the `git rm` will be a no-op for those.)
5. **Verify everything still builds:**
   ```bash
   bun install
   bunx turbo typecheck
   bunx turbo test
   bunx turbo lint
   ```
6. Commit as a small set of focused commits:
   - `chore(apps): finish professional-brain → yeehaa.io cleanup`
   - `chore(cleanup): delete transitional team-brain + collective-brain + ranger`
   - `docs(brains): add internal-use disclaimers to ranger and relay`
   - `chore(cleanup): remove agent/IDE configs from tracked tree`

**Exit criteria:** Live repo no longer contains transitional apps, deleted sites/themes, or tracked agent configs. Typecheck/test/lint pass. Estimated time: **1–2 hours**.

#### Phase 3b — Extract `apps/mylittlephoney` to a standalone private repo

This is its own multi-step migration with real coordination cost. It's separated from Phase 3a so the live repo cleanup ships first.

1. **Create a new private repo** `rizom-ai/mylittlephoney` (or chosen name) on GitHub.
2. **Copy the relevant directories** to the new repo's working dir:
   - `apps/mylittlephoney/*` (config, deploy, brain-data if you want history)
   - `sites/mylittlephoney/*` (the site package code)
   - `shared/theme-mylittlephoney/*` (the theme code)
3. **Decide how the standalone repo consumes the framework:**
   - **(a)** Pin to `@rizom/brain` from npm (cleanest, no source coupling)
   - **(b)** Pin to a specific tag of `rizom-ai/brains`
   - **(c)** Bundle the site + theme INTO the app dir as a single self-contained instance (most decoupled)
4. **Set up CI for the new repo** (deploy hooks, test hooks if needed, content sync).
5. **Migrate brain-data** to the new repo or keep it in its existing git-sync content repo.
6. **Verify the standalone repo boots and deploys** end-to-end against `@rizom/brain`.
7. **Once verified, delete from the monorepo:**
   ```bash
   git rm -r apps/mylittlephoney
   git rm -r sites/mylittlephoney
   git rm -r shared/theme-mylittlephoney
   ```
8. Verify monorepo still builds. Commit.

**Exit criteria:** mylittlephoney runs from its own repo, monorepo no longer contains it, no broken references. Estimated time: **half day to a day**, depending on how much of (3) and (4) needs custom work.

#### Phase 3c — Workspace globs (no change needed)

The original plan suggested narrowing workspace globs to explicit paths. The revised plan keeps globs (`shell/*`, `shared/*`, `sites/*`, `brains/*`, etc.) because the deletions in 3a/3b naturally prune them — there's nothing private left under `sites/*` or `brains/*` to exclude. Globs are less brittle than maintaining an explicit list and need no update on every package add.

### Phase 3.5 — Content and UX prep

Phase 3 produces a clean live repo. Phase 3.5 adds the public-facing content needed to turn it into a framework someone can actually adopt. Unlike the original plan, this lands directly in the live monorepo as commits on `main` (not in a separate staging tree) because the dev repo and the public repo are the same repo per Option α in §6.

1. **README rewrite** (half day). The current README is internally focused. The public version needs:
   - Value prop in the first paragraph — what is this, who is it for, what does it replace
   - Animated GIF or screenshot of `brain init` → `brain start` → CLI chat
   - 3-line quickstart (`bun add -g @rizom/brain && brain init mybrain && brain start`)
   - "What this is for / what this is not for" section — set expectations honestly
   - Architecture diagram (one image, plugins + shell + interfaces)
   - Links to docs, brain.yaml reference, deployment guide
   - Compatibility matrix (Bun version, OS support)
   - License + contributing pointer

2. **CONTRIBUTING.md** (2 hours). Real content, not a stub:
   - Dev environment setup (`bun install`, `bunx turbo typecheck`, `bun test`)
   - Project layout overview (link to `docs/architecture/package-structure.md`)
   - Changeset workflow (`bunx changeset` for any user-visible change)
   - PR conventions (link to template, test plan expected)
   - Where to file what (bug → issues, feature → discussion first, security → SECURITY.md)
   - Code style (lint runs in CI; no eslint-disable; no `as` casts; Zod for validation)

3. **SECURITY.md** (30 min). Vulnerability disclosure:
   - How to report privately (email address, not a GitHub issue)
   - What's in scope (the framework code, not user-deployed brains)
   - Expected response time (be honest — "best effort, solo maintainer")
   - PGP key if you want one (optional)

4. **Issue and PR templates** (30 min). In `.github/ISSUE_TEMPLATE/`:
   - `bug_report.md` — version, brain.yaml snippet, steps to reproduce, expected vs. actual
   - `feature_request.md` — use case, proposed API, alternatives considered
   - `plugin_request.md` — what integration, what tools, what entities
   - `config.yml` — disable blank issues, link to discussions for questions

   In `.github/pull_request_template.md`:
   - Linked issue
   - Test plan
   - Changeset reminder
   - Checklist (typecheck, test, lint)

5. **STABILITY.md** (1 hour). What users can rely on between v0.1 → v1.0:
   - **Stable surface**: `brain.yaml` top-level schema, system tool names (`system_create`, `system_update`, `system_delete`, `system_search`, `system_extract`, `system_status`, `system_insights`), entity frontmatter shape, MCP resource URI scheme (`entity://`, `brain://`), CLI command names
   - **Unstable surface**: plugin context shapes (`EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`), internal services, log schema, FTS scoring weights, embedding model choice, anything in `shell/*/src/internal/`
   - **Versioning policy**: pre-1.0, breaking changes can land in any minor (0.1 → 0.2). After 1.0, semver applies.

6. **CHANGELOG.md** (1 hour). Hand-write one `v0.1.0` entry summarizing what's in this release at high level (per D6). After v0.1.0, the `.changeset/` flow takes over.

7. **Curate `docs/roadmap.md`** — the staging tree's roadmap should reflect the public-facing roadmap, not internal plan tracking. Keep done items, planned items at high level, drop internal-only context.

**Exit criteria:** README is something a stranger can land on and understand in 60 seconds. CONTRIBUTING + SECURITY + templates have real content. STABILITY.md exists. CHANGELOG has a v0.1.0 entry. Estimated time: **1 day**.

### Phase 4 — Orphan commit and push to `brains-temp`

Per D1, we stage the public release at a fresh `rizom-ai/brains-temp` repo and only do the final rename once everything is verified. This gives zero downtime on the current `rizom-ai/brains` URL during the transition.

> **Revised flow**: Phase 3a/3b already happened in the live monorepo, so `main` already contains the clean tree. The "staging clone" used here is just a fresh clone of the post-cleanup state, used as a working dir for the orphan commit — it doesn't do any deletions itself.
>
> ```bash
> cd ~/Documents
> git clone brains brains-public-staging
> cd brains-public-staging
> # Tree is already clean from Phase 3 — just orphan-commit it.
> ```

1. From inside `brains-public-staging/`, create the orphan commit:
   ```bash
   rm -rf .git
   git init -b main
   git add .
   git status   # eyeball one more time
   git commit -m "Initial public release of brains framework"
   ```
2. **Create `rizom-ai/brains-temp` on GitHub as a public repo** (no README, no license, no .gitignore — we have all of those already).
3. Push the staging tree to `brains-temp`:
   ```bash
   git remote add origin git@github.com:rizom-ai/brains-temp.git
   git push -u origin main
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. Review on GitHub web UI. Specifically check:
   - File tree (no surprises — no `apps/`, no branded themes, no `.pi/`, no `.env*`)
   - README rendering
   - LICENSE recognized by GitHub's license detector
   - No hidden files exposed
   - `.gitignore` is present and correct
   - CI workflows look right
5. Run `gitleaks` against a fresh clone of `brains-temp` as a final check:
   ```bash
   cd /tmp && git clone git@github.com:rizom-ai/brains-temp.git && cd brains-temp
   gitleaks detect --source . --no-git
   ```
6. **Test that the public repo builds from scratch** — the real proof it's self-contained:
   ```bash
   bun install
   bun run lint
   bun run typecheck
   bun test
   bun run build
   ```

**Exit criteria:** `brains-temp` is live on GitHub, looks right in the web UI, gitleaks clean, fresh clone builds and tests pass. Estimated time: **1–2 hours**.

### Phase 4.5 — End-to-end smoke test on a clean machine

Phase 4 verifies the staged repo builds in a fresh clone of the source. Phase 4.5 verifies the **published artifact** works end-to-end on a machine that has never seen this codebase. This is the single most important pre-launch test and currently nobody has done it. Without this step, the launch is the first time anyone has actually followed the README.

> **Order of operations**: Phase 4.5 assumes `npm publish` has happened, but the rename hasn't. The sequence is: stage `brains-temp` (Phase 4) → publish `@rizom/brain@0.1.0` to npm from the staging tree → smoke test from npm (Phase 4.5) → if smoke test passes, do the rename (Phase 5). If you want to test before publishing publicly, use `npm pack` and install the tarball locally — same shape, no public artifact.

1. **Pick a clean environment**: a fresh Docker container, a borrowed laptop, a VM — anywhere that isn't your dev machine. Must not have:
   - The repo cloned anywhere
   - Any `@rizom/*` or `@brains/*` packages globally installed
   - Bun pre-installed (test the install instructions too)
   - Cached environment variables

2. **Follow the README quickstart literally.** Don't paraphrase, don't shortcut, don't fix things from memory. If a step doesn't work, write it down and keep going if possible.

3. **Specifically test:**
   - `bun add -g @rizom/brain` (or install the tarball from `npm pack` if pre-publish)
   - `brain init mynewbrain`
   - `cd mynewbrain && cat brain.yaml` — does it look reasonable?
   - Set `AI_API_KEY` to a real OpenAI key
   - `brain start`
   - Does it boot? Does the embedding DB get created? Does the entity DB get created? Does the MCP server come up?
   - Talk to it via CLI / MCP — create a note, search for it, derive a topic
   - `brain diagnostics search` — does it return a useful result?
   - `brain diagnostics usage` — does it parse the log file?
   - Stop the brain. Restart it. Does state persist?

4. **Write up every paper cut**: missing env var with no helpful error, confusing CLI output, broken link in the README, anything that makes you say "hmm." Each paper cut becomes either a fix-before-launch or a known-issue entry.

5. **Decide**: do the paper cuts block launch or get filed as 0.1.1 issues? Be honest — a launch where the README quickstart fails on step 3 is worse than a delayed launch.

**Exit criteria:** A stranger could follow the README and get a working brain. Paper cuts triaged into fix-now or fix-later. Estimated time: **half day**, possibly more depending on what breaks.

### Phase 5 — Double-rename and go live

Once `brains-temp` is verified in Phase 4, we swap the names. Per D1, the old repo keeps its full history as a private archive and the new clean tree takes the canonical `rizom-ai/brains` URL.

1. **Rename the current repo to the archive name.** On GitHub: Settings → General → Repository name → `rizom-ai/brains` → `rizom-ai/brains-private`. Confirm it's set to Private visibility. GitHub auto-redirects the old URL for a grace period, so external links won't break immediately.
2. **Rename the staging repo to the canonical name.** Settings → General → Repository name → `rizom-ai/brains-temp` → `rizom-ai/brains`. Confirm Public visibility.
3. **Update local working copy** to point at the new private archive:
   ```bash
   cd ~/Documents/brains
   git remote set-url origin git@github.com:rizom-ai/brains-private.git
   git fetch origin
   ```
4. **Update the public staging clone** (if you want to keep it) to point at the new public URL:
   ```bash
   cd ~/Documents/brains-public-staging
   git remote set-url origin git@github.com:rizom-ai/brains.git
   git fetch origin
   ```
5. **Configure repo settings on the new public `rizom-ai/brains`** (do this before announcing):
   - Branch protection on `main`: require PR reviews, require status checks, no force-push, no deletion
   - Settings → Code security: enable secret scanning, push protection, Dependabot alerts, Dependabot security updates
   - Settings → Actions → General: restrict to selected actions if relevant
   - Add `CODEOWNERS` if you want PR routing
   - Add issue templates and PR template
   - Enable Discussions if you want a community channel
   - Add repo description, topics, link to website
6. **Verify the rename took effect** by visiting `https://github.com/rizom-ai/brains` in an incognito window.

**Exit criteria:** Public `rizom-ai/brains` live with `v0.1.0` tag, security settings on, private archive accessible at `rizom-ai/brains-private`, local dev pointed at archive. Estimated time: **1 hour**.

### Phase 6 — Post-launch hardening

1. **Rotate credentials** that _might_ have been exposed in the private history, even if scanners found nothing. Cheap insurance:
   - Hetzner API token
   - Bunny CDN API key
   - Any GitHub PAT used in CI
   - Anthropic / OpenAI API keys used in evaluations
   - Matrix bot tokens
2. **Update local working copy** to point at the new remote:
   ```bash
   cd ~/Documents/brains
   git remote set-url origin git@github.com:rizom-ai/brains-private.git
   ```
3. **Set up the public-private sync workflow** if you want to keep developing privately and publishing periodically (see §6).
4. **Announce** — blog post, social, etc. Reference the public repo URL.

**Exit criteria:** Tokens rotated, local dev pointed at private archive, sync workflow documented. Estimated time: **2 hours**.

---

## 5. Success criteria

- [ ] Public repo `rizom-ai/brains` exists and is publicly accessible (post-rename)
- [ ] Private archive `rizom-ai/brains-private` exists and contains all 2,322 commits
- [ ] First commit message in the public repo is `Initial public release of brains framework`
- [ ] `gitleaks detect --source .` on a fresh clone of the public repo returns zero findings
- [ ] `bun install && bun run lint && bun run typecheck && bun test && bun run build` all green on a fresh clone of the public repo
- [ ] No file matching `apps/{collective-brain,mylittlephoney,professional-brain,team-brain}` exists in the public repo
- [ ] Public monorepo apps `apps/{rizom-ai,rizom-work,rizom-foundation}` remain in the public repo
- [x] `yeehaa.io` extracted to its own public standalone repo
- [ ] No `sites/{mylittlephoney,ranger}` or `shared/theme-{mylittlephoney,ranger}` remain in the public repo
- [ ] `brains/{relay,ranger}` remain in the public repo with clear internal-use disclaimers
- [ ] No tracked `.env`, `.envrc`, `.tfvars`, `.pi/`, `.claude/`, or `.agents/` files in the public repo
- [ ] LICENSE file is recognized by GitHub as Apache-2.0
- [ ] Branch protection on `main` is enabled
- [ ] Secret scanning + push protection enabled
- [ ] Tag `v0.1.0` exists and points at the initial commit

---

## 6. Ongoing: how to develop privately, publish publicly

Three options for how to keep working after launch:

**Option α — Develop directly in public**
After launch, switch to developing in the public repo. New private apps live in separate private repos that consume `@brains/*` packages from npm. Simplest but means every WIP commit is public.

**Option β — Develop in private, sync to public**
Keep `brains-private` as the dev repo. Periodically (per release) sync the public-eligible subset to `brains` via a script that copies files, commits, and pushes. Requires writing the sync script and being disciplined about not letting the two diverge.

**Option γ — Two-repo with subtree**
Use `git subtree split` to extract the public subset as a separate history that gets pushed to the public repo. More complex setup, but preserves clean per-file history going forward.

**Recommendation:** start with **α** (develop in public) once `v0.1.0` is out. The private archive stays for historical bisect/blame, but new work happens in public. Drop into β only if you find yourself wanting to do messy WIP that you don't want exposed.

---

## 7. Rollback plan

If something goes wrong at any phase:

| Phase | Failure mode                             | Rollback                                                                                                                                                                   |
| ----- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Audit finds something scary              | Fix in place via additional commits to the live repo. Iterate until clean. No external impact — nothing has been published yet.                                            |
| 1     | Audit fix breaks something               | `git reset` or revert the offending commit. Live repo is fully git-tracked; no destructive operations have happened yet.                                                   |
| 2     | Backup didn't take                       | Try again, do not proceed                                                                                                                                                  |
| 3     | Tree won't build after removal           | Either fix the cross-package leakage (real bug, fix it) or add the file back to the public set                                                                             |
| 3.5   | Content writing reveals architecture gap | If writing the README forces you to admit something doesn't work, fix it before continuing. Better to delay launch by a day than ship a misleading README.                 |
| 4     | `brains-temp` looks wrong on GitHub      | Delete `brains-temp` repo on GitHub, delete `brains-public-staging/` locally, start Phase 3 over. **No impact on the live `rizom-ai/brains` URL**, that's the whole point. |
| 4.5   | Smoke test fails on clean machine        | Triage paper cuts. If quickstart-blocking, fix in the staging tree and re-publish a `0.1.0-rc.N` to npm before going live. If non-blocking, file as known issues.          |
| 5     | Rename caused issues                     | Rename back: `brains-private` → `brains`, `brains` → `brains-temp`. GitHub allows this freely.                                                                             |
| 5     | Public repo leaked something post-rename | Rename `brains` → `brains-leaked`, rename `brains-private` → `brains` to restore the old URL, rotate ALL tokens (assume compromise), restart from Phase 3                  |
| 6     | Token rotation breaks something          | Documented per-service rollback in deploy/scripts                                                                                                                          |

The orphan-commit step is fully reversible _until_ Phase 5's double-rename. After the rename, GitHub caches and forks make recovery hard — this is why Phase 4's verification on `brains-temp` is mandatory.

---

## 8. Open questions / risks

- ~~**Does anything in `shell/*` import from `apps/*` or `sites/*`?**~~ **Answered by preflight:** No. One resolvable dependency (`brains/rover` → `@brains/site-default`) handled by including `sites/default` and `layouts/{personal,professional}` in the public set. See §10.
- **Are there any secrets in HEAD that scanners might miss?** Phase 1 catches this, but be especially careful with `deploy/**` and `.github/workflows/*`.
- ~~**Does `bun.lock` reference any private packages?**~~ **Answered by preflight:** Only as their own entries, not as deps of public packages. Regenerates cleanly after narrowing workspace globs.
- **Are any of the entity test fixtures (`entities/*/test-data/`) personal content?** Should be generic fakes; verify in Phase 1.
- **`brains/rover/eval-content/` contains a real `brain.db`** with seed entities — confirm those entities are safe-for-public (they're meant to be the demo content, so should be fine, but worth one final read in Phase 1).
- ~~**Extensive `yeehaa.io` personalization**~~ **Resolved by D11:** leave as-is. Author's own public domain.

> **Note on phase ordering:** Phase 1 (Audit) intentionally precedes Phase 2 (Backup). The audit is non-destructive, so backup is not needed beforehand; running audit first means the backup snapshots the post-audit state, which is the version we actually want preserved as the private archive.

---

## 9. Estimated total time

| Phase                                  | Estimate                  | Status                                            |
| -------------------------------------- | ------------------------- | ------------------------------------------------- |
| 0 — Decide                             | done                      | ✅ done                                           |
| 1 — Audit HEAD and fix findings        | 2–3 hours                 | ✅ done (`0bd51a87`)                              |
| 2 — Backup                             | 15 min                    | ⏸️ pending                                        |
| 3a — In-tree cleanup (rename + delete) | 1–2 hours                 | ✅ done                                           |
| 3b — Extract `apps/mylittlephoney`     | half day to a day         | ✅ done                                           |
| 3.5 — Content and UX prep              | 1 day                     | ✅ done                                           |
| 4 — Push to `brains-temp` and verify   | 1–2 hours                 | ⏸️ pending                                        |
| 4.5 — End-to-end smoke test            | half day (more if breaks) | 🟡 partial (init flow tested in `/tmp/testbrain`) |
| 5 — Double-rename and go live          | 1 hour                    | ⏸️ pending                                        |
| 6 — Post-launch                        | 2 hours                   | ⏸️ pending                                        |
| **Total**                              | **~3 working days**       |                                                   |

Phases 3.5 and 4.5 are the additions that turn a clean code drop into an adoptable framework. Without them, v0.1.0 is technically published but the README is internal-facing, there's no contributing guide, and nobody has verified the install path works on a clean machine.

**Status update (2026-04-12):** The deploy-validation gate has been cleared: `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths. Even so, this plan is paused again because public plugin feature work takes priority. Resume only after that feature is complete, then continue from the remaining release-staging work (Phase 4 onward).

Phase 3 was split into 3a (mechanical in-tree cleanup, fast) and 3b (mylittlephoney extraction, slower) so the easy part can land first without being blocked by the harder migration.

---

## 10. Preflight scan results and completed pre-work

A preflight scan of the current tree (HEAD, not history) validated the plan's biggest risk flag and completed the mechanical pre-work that would otherwise happen in Phase 1.

### 10.1 Structural cross-package coupling: clean ✅

- **No relative-path imports** from public subtrees into private (`../../apps/`, `../../sites/`, etc.)
- **No tsconfig project references** crossing the public→private boundary
- **No package.json dependencies** on actually-private packages from the public set
- **`bun.lock`** only references private packages as their own top-level entries, never as deps of public packages
- **One real dependency** (`brains/rover` → `@brains/site-default` → `@brains/site-professional`) resolved by recognizing those packages are public site compositions, not private content. Inventory updated in §3.

### 10.2 Inventory corrections to §3

The original plan assumed a `layouts/` layer. The public site-composition packages are now `sites/personal` and `sites/professional`, both generic and promoted to public. Theme inventory also changed during cleanup: private branded themes were extracted or deleted, while `shared/theme-rizom` remains public as the shared Rizom brand theme.

### 10.3 Mechanical rewrites completed in-place

These edits were made in the current working tree so they merge into the private dev history cleanly and don't need to be redone in Phase 1. All were verified by running the affected test suites (462 tests pass, typecheck clean on all touched packages).

**Private package name references in public code** — replaced with real public names or generic fixtures:

| File                                                         | Change                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shell/app/test/instance-overrides.test.ts`                  | `@brains/relay` → `@brains/rover` (29×), `@brains/site-mylittlephoney` → `@brains/site-default` (2×), `rizom-ai/team-brain-content` → `your-org/your-content`, test name "team-brain" → neutral  |
| `shell/app/test/generate-entrypoint.test.ts`                 | `@brains/theme-mylittlephoney` → `@brains/theme-default` (3×), `@brains/site-mylittlephoney` → `@brains/site-default` (5×)                                                                       |
| `shell/app/test/generate-model-entrypoint.test.ts`           | example site package refs only (`@example/site-alpha`, `@example/site-beta`)                                                                                                                     |
| `shell/app/test/override-package-refs.test.ts`               | `@brains/site-mylittlephoney` → `@brains/site-default` (4×)                                                                                                                                      |
| `shell/app/test/build-model-npm.test.ts`                     | `ranger` → `sentry` model name (forward-looking fictional placeholder)                                                                                                                           |
| `shell/app/src/runner.ts`                                    | Error message example: `@brains/relay` → `@brains/rover`                                                                                                                                         |
| `shell/app/src/brain-resolver.ts`                            | Comment example: `@brains/theme-rizom` → `@brains/theme-default`                                                                                                                                 |
| `shell/identity-service/test/anchor-profile-service.test.ts` | Test fixture: `Yeehaa` / `yeehaa@rizom.ai` → `Test User` / `contact@example.com`                                                                                                                 |
| `shell/ai-evaluation/test/per-model-git-remote.test.ts`      | Comment: `brain@rizom.ai` → `brain@localhost`                                                                                                                                                    |
| `packages/brain-cli/docs/brain-yaml-reference.md`            | Rewrote "Full Rover instance" and "Team brain" examples to use generic placeholders (domain, email, repo path, discord IDs); removed relay/ranger rows from brain model table; neutered comments |

**Framework bug fix** — was leaking a specific org's email as a default:

| File                                  | Change                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/directory-sync/src/types.ts` | `authorEmail` default: `brain@rizom.ai` → `brain@localhost`. **This was a real public-release bug**: without override, any user of the framework would commit to their git-synced content repos as `brain@rizom.ai`. |

### 10.4 Remaining work for Phase 1

The preflight surfaced one larger cleanup category that is left for Phase 1 to handle:

- **`yeehaa.io` as canonical example domain** — appears in ~40 files across JSDoc comments, test fixtures, production code examples (e.g. `shared/utils/src/string-utils.ts`, `shell/plugins/src/base/context.ts`, `interfaces/a2a/src/client.ts`). **Resolved by D11: leave as-is.** It's the author's own public domain, not a leak.
- **`plugins/directory-sync/test/git-*.test.ts`** — uses `rizom-ai/test-content` as a plausible example repo name. Not a leak (org name is public), can be left or scrubbed to `your-org/test-content`.
- **`shell/identity-service/test/anchor-profile-adapter.test.ts`** — uses `contact@rizom.ai` in test fixtures. Fake contact email, not a leak, can be left.

### 10.5 Commit suggestion

The mechanical rewrites in §10.3 are safe to commit to the private dev repo as their own changeset before the orphan-commit dance. They improve the codebase regardless of public release and have no downside. Suggested split:

1. `chore(cleanup): use generic example names in shell/app tests and docs` — the test/doc rewrites (10 files)
2. `fix(directory-sync): use neutral default authorEmail` — the one framework fix (1 file)

After these land, Phase 3 effectively only has to narrow workspace globs, remove private directories, regenerate `bun.lock`, and run the full build — truly mechanical.
