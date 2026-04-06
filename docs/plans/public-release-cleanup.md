# Public Release Cleanup Plan

**Goal:** Take `rizom-ai/brains` from a private monorepo with 2,322 commits of solo development history to a clean, publishable open-source repo, with zero risk of leaking private content from history.

**Strategy:** Option B from the cleanup discussion — squash to a clean baseline via orphan commit, keep the existing repo as a private archive, push the clean snapshot to a fresh public repo location.

**Status:** Decisions locked. Ready to execute starting at Phase 1. Preflight scan results and completed pre-work are in §10.

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
- Open-sourcing private brain instances (`apps/collective-brain`, `apps/team-brain`, `apps/mylittlephoney`, `apps/professional-brain`)
- Open-sourcing internal strategy docs (`docs/plans/monetization.md`, etc. — see §2)

---

## 2. Locked decisions

All decisions below are final. No open questions remain before execution.

| #   | Decision                                       | Answer                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Public repo URL                                | **Stage at `rizom-ai/brains-temp`** (new public repo). When fully verified, do a double-rename: `rizom-ai/brains` → `rizom-ai/brains-private`, then `rizom-ai/brains-temp` → `rizom-ai/brains`. Zero downtime; the public URL never has a moment of being broken. |
| D2  | What ships in v0.1.0 (workspace surface)       | Per §3 inventory: `shell/*`, `shared/*` (minus branded themes), `plugins/*` (most), `entities/*`, `interfaces/*`, `packages/*`, `brains/rover`, `sites/default`, `layouts/{personal,professional}`, all of `docs/plans/*`, selected top-level docs.               |
| D3  | What stays private                             | `apps/*`, `sites/{mylittlephoney,ranger,yeehaa}`, `shared/theme-{mylittlephoney,yeehaa,rizom}`, `brains/{relay,ranger}`, agent configs (`.claude`, `.pi`, `.agents`), `.envrc`, `skills-lock.json`, any `docs/*` file that fails the Phase 1 PII scan.            |
| D4  | `brains/relay` and `brains/ranger`             | **Private.** Keep until they're real implementations. Only `brains/rover` ships as the reference brain model.                                                                                                                                                     |
| D5  | `docs/plans/*`                                 | **All public.** Phase 1 still scans each file for PII/secrets; any flagged file gets fixed or excluded individually, but the default is ship.                                                                                                                     |
| D6  | CHANGELOG narrative                            | Hand-write a single `v0.1.0` entry summarizing pre-launch development at high level. `.changeset/` flow takes over going forward.                                                                                                                                 |
| D7  | Dev archive lifetime                           | **Keep indefinitely.** Storage is free and bisect-on-old-bug is invaluable.                                                                                                                                                                                       |
| D8  | First public tag                               | **`v0.1.0`** — explicitly pre-stable, signals breaking changes expected before 1.0.                                                                                                                                                                               |
| D9  | License                                        | **Apache-2.0** (unchanged from current `LICENSE`).                                                                                                                                                                                                                |
| D10 | Author identity in fresh history               | **`yeehaa@offcourse.io`** (unchanged).                                                                                                                                                                                                                            |
| D11 | `yeehaa.io` as example domain in code and docs | **Leave as-is.** It's the author's own public domain, used as canonical example throughout ~40 files. Not a leak; no scrub.                                                                                                                                       |

---

## 3. Workspace inventory (v1.0 surface decision)

The current workspace globs in `package.json` are:

```
shell/*, shared/*, plugins/*, entities/*, layouts/*,
interfaces/*, brains/*, apps/*, sites/*, packages/*
```

### Default-public (ship in v1.0)

- `shell/*` — core framework (entity-service, ai-service, messaging-service, app, core, …)
- `shared/*` — utilities, types, test-utils, mcp-bridge, generic themes (theme-base, theme-default, theme-editorial, theme-geometric, theme-swiss, theme-neo-retro, theme-brutalist), config packages
- `entities/*` — entity definitions (post, link, deck, blog, note, project, social-media, topics, portfolio, …)
- `interfaces/*` — webserver, matrix, mcp, a2a, cli
- `packages/*` — brain-cli
- `brains/rover` — the reference open brain model
- `sites/default` — generic out-of-box site package (used by rover by default)
- `layouts/personal` — simple blog-focused layout (generic building block)
- `layouts/professional` — editorial layout composing blog+deck+profile (generic building block)
- `plugins/*` — except any that are private/incomplete (audit needed; default keep)
- `LICENSE`, `README.md`, `CONTRIBUTING.md`, `KNOWN-ISSUES.md`, `CLAUDE.md` (or rewrite as `AGENTS.md`)
- `tsconfig.json`, `package.json` (with workspaces narrowed), `bunfig.toml`, `turbo.json`, `.changeset/`, `.dependency-cruiser.js`, `.eslintrc.cjs`, `.prettierignore`, `.gitignore`, `.dockerignore`, `.husky/` (audit hooks), `.github/workflows/` (audit secrets)
- `scripts/` — audit for hardcoded paths
- `deploy/` — public deploy templates only (Hetzner provider, docker recipes); audit `.tfvars` and any baked-in secrets
- `docs/` — selected (architecture-overview, brain-model, plugin-system, plugin-development-patterns, tech-stack, theming-guide, mcp-inspector-guide, plus a curated `docs/roadmap.md`)

### Default-private (excluded from public repo)

- `apps/*` — all five are personal/team brain instances:
  - `apps/collective-brain`
  - `apps/mylittlephoney`
  - `apps/professional-brain`
  - `apps/rizom-foundation` (verify — may be public-facing site, could promote)
  - `apps/team-brain`
- `sites/mylittlephoney`, `sites/ranger`, `sites/yeehaa` — branded site content
- `shared/theme-mylittlephoney`, `shared/theme-yeehaa` — branded themes
- `shared/theme-rizom` — decision needed (it's the rizom.ai marketing theme; keep private by default since it's for one specific site, not a general-purpose theme)
- `brains/relay`, `brains/ranger` — until ready
- `docs/plans/*` — internal roadmap/strategy (needs per-file audit)
- `docs/cost-estimates.md`, `docs/dashboard-prototype.html`, `docs/codebase-map.html`, `docs/health-checks-plan.md`, `docs/app-package-improvements.md`, `docs/universal-progress-routing-architecture.md`, `docs/messaging-system.md` — review individually
- `docs/design/` — keep `bioluminescent-infrastructure.md` and `rizom-ai.html` (the public brand prototype); review the rest
- `entities/agent-directory/` — orphan from earlier cleanup (already deleted)
- `.agents/`, `.claude/`, `.pi/` — agent-specific config
- `KNOWN-ISSUES.md` — review whether issues are public-OK
- `skills-lock.json` — agent skill state
- `.changeset/` — review for any in-flight changesets that mention private packages
- `.envrc` — direnv config, may have local paths

### Needs audit before deciding

- Per-plugin: `plugins/{analytics,buttondown,content-pipeline,dashboard,directory-sync,examples,hackmd,notion,obsidian-vault,site-builder,site-content,stock-photo}` — most likely public, but verify hardcoded credentials/personal data in tests
- `deploy/providers/hetzner/` — verify no `terraform.tfstate` or backup leaks (already gitignored, but check tracked files)
- `.github/workflows/*.yml` — secrets references (must be GitHub Actions secrets, not literals)

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
5. **CLAUDE.md / agent files** — review for anything personal/private; rename to `AGENTS.md` if keeping (more vendor-neutral).
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

### Phase 3 — Build the clean tree (in a sibling working dir)

Don't mutate the live repo. Work in a fresh clone.

1. Clone for surgery:
   ```bash
   cd ~/Documents
   git clone brains brains-public-staging
   cd brains-public-staging
   ```
2. **Remove private paths** based on §3 decisions:

   ```bash
   # Apps — all private per D3
   rm -rf apps/collective-brain apps/mylittlephoney apps/professional-brain apps/team-brain apps/rizom-foundation

   # Branded sites — keep sites/default
   rm -rf sites/mylittlephoney sites/ranger sites/yeehaa

   # Branded themes — keep generic ones
   rm -rf shared/theme-mylittlephoney shared/theme-yeehaa shared/theme-rizom

   # Incomplete brain models — per D4
   rm -rf brains/relay brains/ranger

   # Agent/IDE configs
   rm -rf .agents .claude .pi
   rm -f .envrc skills-lock.json

   # Note: docs/plans/* is public per D5; no removal. Phase 1 already handled per-file PII scan.
   ```

3. **Narrow workspace globs** in `package.json` to explicit paths (since we're excluding specific items under `sites/`, `layouts/`, `brains/`, and we're dropping `apps/` entirely):
   ```jsonc
   "workspaces": [
     "shell/*",
     "shared/eslint-config", "shared/typescript-config", "shared/test-utils",
     "shared/utils", "shared/image", "shared/mcp-bridge", "shared/ui-library",
     "shared/product-site-content",
     "shared/theme-base", "shared/theme-default", "shared/theme-editorial",
     "shared/theme-geometric", "shared/theme-swiss", "shared/theme-neo-retro",
     "shared/theme-brutalist",
     "plugins/*", "entities/*", "interfaces/*", "packages/*",
     "brains/rover",
     "sites/default",
     "layouts/personal", "layouts/professional"
   ]
   ```
4. **Verify the tree still builds and tests still pass:**
   ```bash
   bun install
   bun run typecheck    # or whatever the project's check command is
   bun test
   bun run build
   ```
   This is the critical gate. If anything breaks because we removed a private dependency, fix it now (likely culprits: cross-package imports from private apps into shared code, which would be a real bug).
5. **Content and UX prep** — see Phase 3.5 below for the full detail. At minimum: README rewrite, CONTRIBUTING.md, SECURITY.md, STABILITY.md, issue/PR templates, CHANGELOG with one v0.1.0 entry, curated public roadmap.
6. **Sanity-check the final file list:**
   ```bash
   find . -type f -not -path './node_modules/*' -not -path './.git/*' | sort > /tmp/public-files.txt
   wc -l /tmp/public-files.txt
   ```
   Skim the list. If anything looks surprising, stop and investigate.

**Exit criteria:** Clean tree in `brains-public-staging/`, builds green, tests green, file list reviewed. Estimated time: **2–3 hours** (preflight confirmed no structural cross-package leakage, so removal is mechanical — see §10).

### Phase 3.5 — Content and UX prep

Phase 3 produces a buildable clean tree. Phase 3.5 turns it into a framework someone can actually adopt. All of this happens in the staging tree (`brains-public-staging/`) before the orphan commit. None of it lives in the dev archive — the dev README, dev CHANGELOG, etc. stay private and are written for a different audience.

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
- [ ] No file matching `apps/{collective-brain,mylittlephoney,professional-brain,team-brain,rizom-foundation}` exists in the public repo
- [ ] No `sites/{mylittlephoney,ranger,yeehaa}` or `shared/theme-{mylittlephoney,yeehaa,rizom}` in the public repo
- [ ] No `brains/{relay,ranger}` in the public repo
- [ ] No `.env*`, `.envrc`, `.tfvars`, `.pi/`, `.claude/`, or `.agents/` files in the public repo
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

| Phase                                | Estimate                  |
| ------------------------------------ | ------------------------- |
| 0 — Decide                           | done                      |
| 1 — Audit HEAD and fix findings      | 2–3 hours                 |
| 2 — Backup                           | 15 min                    |
| 3 — Build clean tree                 | 2–3 hours                 |
| 3.5 — Content and UX prep            | 1 day                     |
| 4 — Push to `brains-temp` and verify | 1–2 hours                 |
| 4.5 — End-to-end smoke test          | half day (more if breaks) |
| 5 — Double-rename and go live        | 1 hour                    |
| 6 — Post-launch                      | 2 hours                   |
| **Total**                            | **~2–3 working days**     |

Phases 3.5 and 4.5 are the additions that turn a clean code drop into an adoptable framework. Without them, v0.1.0 is technically published but the README is internal-facing, there's no contributing guide, and nobody has verified the install path works on a clean machine.

Phase 3 estimate reflects the preflight finding that there is no structural cross-package coupling — removal is mechanical, not architectural surgery. Phase 1 is now the longest and most uncertain phase; it's intentionally first so we discover any blocking issues before sinking time into backup and clean-tree work.

---

## 10. Preflight scan results and completed pre-work

A preflight scan of the current tree (HEAD, not history) validated the plan's biggest risk flag and completed the mechanical pre-work that would otherwise happen in Phase 1.

### 10.1 Structural cross-package coupling: clean ✅

- **No relative-path imports** from public subtrees into private (`../../apps/`, `../../sites/`, etc.)
- **No tsconfig project references** crossing the public→private boundary
- **No package.json dependencies** on actually-private packages from the public set
- **`bun.lock`** only references private packages as their own top-level entries, never as deps of public packages
- **One real dependency** (`brains/rover` → `@brains/site-default` → `@brains/layout-professional`) resolved by recognizing those three packages are generic building blocks that belong in the public set, not private content. Inventory updated in §3.

### 10.2 Inventory corrections to §3

The original plan listed three layout directories that don't exist (`layouts/{mylittlephoney,yeehaa,ranger}`). The actual layout directories are `layouts/personal` and `layouts/professional`, both generic and promoted to public. Also discovered: `shared/theme-{mylittlephoney,yeehaa,rizom}` are branded themes that should be private.

### 10.3 Mechanical rewrites completed in-place

These edits were made in the current working tree so they merge into the private dev history cleanly and don't need to be redone in Phase 1. All were verified by running the affected test suites (462 tests pass, typecheck clean on all touched packages).

**Private package name references in public code** — replaced with real public names or generic fixtures:

| File                                                         | Change                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shell/app/test/instance-overrides.test.ts`                  | `@brains/relay` → `@brains/rover` (29×), `@brains/site-mylittlephoney` → `@brains/site-default` (2×), `rizom-ai/team-brain-content` → `your-org/your-content`, test name "team-brain" → neutral  |
| `shell/app/test/generate-entrypoint.test.ts`                 | `@brains/theme-mylittlephoney` → `@brains/theme-editorial` (3×), `@brains/site-mylittlephoney` → `@brains/site-default` (5×)                                                                     |
| `shell/app/test/generate-model-entrypoint.test.ts`           | `@brains/site-yeehaa` → `@example/site-alpha` (4×), `@brains/site-mylittlephoney` → `@example/site-beta` (4×)                                                                                    |
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
