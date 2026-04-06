# Public Release Cleanup Plan

**Goal:** Take `rizom-ai/brains` from a private monorepo with 2,322 commits of solo development history to a clean, publishable open-source repo, with zero risk of leaking private content from history.

**Strategy:** Option B from the cleanup discussion — squash to a clean baseline via orphan commit, keep the existing repo as a private archive, push the clean snapshot to a fresh public repo location.

**Status:** Draft. Decisions in §2 need answers before execution. Preflight scan results and in-place pre-work are in §10.

---

## 1. Goals and non-goals

### Goals

- Publish a clean v1.0 of the brains framework as open source
- Zero leakage of private content from the 2,322-commit history
- Preserve full development history privately for `git blame` / `git bisect` / archival
- Repo is publishable to GitHub with reasonable confidence in 1–2 working days
- Set up the new public repo with sensible day-one security defaults

### Non-goals

- Preserving public commit narrative pre-v1.0 (intentionally discarded)
- Migrating GitHub issues / PR cross-references (none external yet)
- Open-sourcing private brain instances (`apps/collective-brain`, `apps/team-brain`, `apps/mylittlephoney`, `apps/professional-brain`)
- Open-sourcing internal strategy docs (`docs/plans/monetization.md`, etc. — see §2)

---

## 2. Open decisions

These need answers before phase 3 (clean tree preparation). I've put my recommendation in **bold** but the call is yours.

| #   | Decision                                                                | Options                                                                                                                                           | Recommendation                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Public repo URL                                                         | (a) replace `rizom-ai/brains` in place, (b) new `rizom-ai/brains-public`, (c) new name entirely (e.g. `rizom-ai/framework`)                       | **(a)** rename current to `rizom-ai/brains-private`, then create fresh `rizom-ai/brains` with the same name                                                                                          |
| D2  | What ships in v1.0 (workspace surface)                                  | See §3 below for full inventory                                                                                                                   | **`shell/*`, `shared/*` (minus branded themes), `plugins/*` (most), `entities/*`, `interfaces/*`, `packages/*`, `brains/rover`, `sites/default`, `layouts/{personal,professional}`** + selected docs |
| D3  | What stays private                                                      | `apps/*`, `sites/{mylittlephoney,ranger,yeehaa}`, `shared/theme-{mylittlephoney,yeehaa,rizom}`, `brains/{relay,ranger}`, sensitive `docs/plans/*` | **Keep all private apps/branded themes private**                                                                                                                                                     |
| D4  | `brains/relay` and `brains/ranger` — public or private?                 | They're "Coming Soon" per the website, code is presumably stub-level                                                                              | **Keep private until they're real**; keep `brains/rover` public as the reference model                                                                                                               |
| D5  | `docs/plans/*` — which are public roadmap, which are internal strategy? | Need to grep through them                                                                                                                         | **Default to private; promote individual files to `docs/roadmap/` if explicitly safe**                                                                                                               |
| D6  | Carry over CHANGELOG narrative?                                         | (a) start fresh, (b) hand-write a "v1.0 — first public release" entry, (c) keep `.changeset/` as-is                                               | **(b)** one paragraph summarizing pre-launch development, then `.changeset/` flow forward                                                                                                            |
| D7  | Keep dev archive forever, or time-bomb?                                 | Keep indefinitely vs. archive then delete after N months                                                                                          | **Keep indefinitely** — storage is free and bisect-on-old-bug is invaluable                                                                                                                          |
| D8  | Tag scheme                                                              | Start at `v1.0.0` or `v0.1.0`?                                                                                                                    | **`v1.0.0`** if you stand behind it; `v0.1.0` if you want explicit pre-1.0 stability caveat                                                                                                          |
| D9  | License confirmation                                                    | Currently `LICENSE` (Apache-2.0 per README) — keep?                                                                                               | **Keep Apache-2.0** unless there's a reason to switch                                                                                                                                                |
| D10 | Author identity in fresh history                                        | `yeehaa@offcourse.io` (current) or different commit identity                                                                                      | **Keep current**                                                                                                                                                                                     |

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

Read this doc, fill in §2 decisions, optionally edit §3 inventory. Estimated time: **30 minutes**.

### Phase 1 — Backup and freeze

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
3. Verify the backup is intact (`git log --oneline | wc -l` should show ~2,322).

**Exit criteria:** Two independent backups exist (local mirror + remote branch). Estimated time: **15 minutes**.

### Phase 2 — Per-file audit pass on what's _staying_ in HEAD

We're discarding history, so we only need to audit the _current tree_ — but we need to audit it carefully because whatever is there becomes the public v1.0.

> **Preflight has already handled the mechanical pre-work.** See §10 for what's done. Phase 2 now focuses on the remaining audit.

1. **Secrets scan on HEAD only** (not history — we're throwing history away):
   ```bash
   gitleaks detect --source . --no-git
   ```
   Triage every finding. False positives → allowlist; real ones → fix.
2. **`yeehaa.io` sweep** — the codebase uses `yeehaa.io` as the canonical example domain in ~40 files (JSDoc comments, test fixtures, production code examples). Decide:
   - **(a)** Leave as-is — it's the author's own public domain, not a leak, comparable to how many OSS projects reference the maintainer's domain in docs
   - **(b)** Global replace with `example.com` in docs/comments only, leave test fixtures alone (they exercise real URL parsing and changing them adds noise)
   - **(c)** Full scrub everywhere including test fixtures

   **Recommendation:** (b) — scrub in docs/comments for cleanliness, leave test fixtures since they're hermetic

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
6. **`.github/workflows/*.yml`** — review every secret reference. Must be `${{ secrets.X }}`, never inline.
7. **`docs/plans/*`** — open each, decide public/private, move private ones to a `private/` overlay (see Phase 3).
8. **`brains/rover/eval-content/`** — this gets shipped as the seed content in the default brain. Read every markdown file; confirm nothing personal.
9. **Per-plugin README and tests** — quick read for hardcoded paths, test data with personal content, leftover TODOs that name people.
10. **`packages/brain-cli/package.json` author field** — `"Yeehaa <yeehaa@rizom.ai>"` is legitimate npm author metadata; keep.

**Exit criteria:** Clean gitleaks run on HEAD, explicit decision on every `yeehaa.io` sweep result, no surprise PII matches, decisions made on every borderline file. Estimated time: **2–3 hours**.

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
   rm -rf apps/collective-brain apps/mylittlephoney apps/professional-brain apps/team-brain
   # rizom-foundation: decide per D3
   rm -rf sites/mylittlephoney sites/ranger sites/yeehaa sites/default
   rm -rf layouts/personal layouts/professional layouts/mylittlephoney layouts/yeehaa layouts/ranger
   rm -rf brains/relay brains/ranger   # if D4 = private
   rm -rf docs/plans                   # then selectively re-add public roadmap items
   rm -rf .agents .claude .pi
   rm -f .envrc skills-lock.json
   # ... etc per inventory
   ```
3. **Narrow workspace globs** in `package.json`:
   ```jsonc
   "workspaces": [
     "shell/*", "shared/*", "plugins/*", "entities/*",
     "interfaces/*", "packages/*", "brains/rover", "layouts/default"
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
5. **Curate `docs/`**:
   - Hand-write a v1.0 README focused on the open framework, not the private brand
   - Hand-write a `CHANGELOG.md` with one v1.0.0 entry summarizing what's in this release
   - Move retained roadmap items into `docs/roadmap.md`
6. **Sanity-check the final file list:**
   ```bash
   find . -type f -not -path './node_modules/*' -not -path './.git/*' | sort > /tmp/public-files.txt
   wc -l /tmp/public-files.txt
   ```
   Skim the list. If anything looks surprising, stop and investigate.

**Exit criteria:** Clean tree in `brains-public-staging/`, builds green, tests green, file list reviewed. Estimated time: **2–3 hours** (preflight confirmed no structural cross-package leakage, so removal is mechanical — see §10).

### Phase 4 — Orphan commit and dry-run push

1. From inside `brains-public-staging/`:
   ```bash
   rm -rf .git
   git init -b main
   git add .
   git status   # eyeball one more time
   git commit -m "Initial public release of brains framework"
   ```
2. **Dry-run push to a throwaway repo first.** Create `rizom-ai/brains-test` as a private temporary repo, push there, browse on GitHub, verify nothing surprising appears in the file tree, the README renders, the LICENSE is present, the workflows look right.
   ```bash
   git remote add test git@github.com:rizom-ai/brains-test.git
   git push test main
   ```
3. Review on GitHub web UI. Specifically check:
   - File tree (no surprises)
   - README rendering
   - LICENSE recognized by GitHub's license detector
   - No hidden files exposed (`.env*`, `.tfvars`, `.pi`, etc.)
   - `.gitignore` is present and correct
4. Run `gitleaks` on the bare clone of the test repo as a final check.

**Exit criteria:** Clean test repo on GitHub, looks right in the web UI, no scanner findings. Estimated time: **1 hour**.

### Phase 5 — Repo rename and real publish

1. On GitHub, rename `rizom-ai/brains` → `rizom-ai/brains-private`. Set it to private if not already. (GitHub auto-redirects the old URL for a while, so update the local remote.)
2. On GitHub, create a fresh empty `rizom-ai/brains` (public, no README, no license, no .gitignore — we have all of those).
3. Push the staging tree:
   ```bash
   cd brains-public-staging
   git remote remove test
   git remote add origin git@github.com:rizom-ai/brains.git
   git push -u origin main
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. **Configure repo settings on GitHub** (do this before announcing):
   - Branch protection on `main`: require PR reviews, require status checks, no force-push, no deletion
   - Settings → Code security: enable secret scanning, push protection, Dependabot alerts, Dependabot security updates
   - Settings → Actions → General: restrict to selected actions if relevant
   - Add `CODEOWNERS` if you want PR routing
   - Add issue templates and PR template
   - Enable Discussions if you want a community channel
   - Add repo description, topics, link to website
5. Delete `rizom-ai/brains-test`.

**Exit criteria:** Public repo live, security settings on, v1.0.0 tagged. Estimated time: **1–2 hours**.

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

- [ ] Public repo `rizom-ai/brains` exists and is publicly accessible
- [ ] First commit message is `Initial public release of brains framework`
- [ ] `gitleaks detect --source .` on the public repo returns zero findings
- [ ] `bun install && bun test && bun run build` all green on a fresh clone of the public repo
- [ ] No file matching `apps/{collective-brain,mylittlephoney,professional-brain,team-brain}` exists in the public repo
- [ ] No `.env*`, `.envrc`, `.tfvars`, or `.pi/` files in the public repo
- [ ] LICENSE file is recognized by GitHub as Apache-2.0
- [ ] Branch protection on `main` is enabled
- [ ] Secret scanning + push protection enabled
- [ ] Tag `v1.0.0` exists and points at the initial commit
- [ ] Private archive `rizom-ai/brains-private` still has all 2,322 commits accessible

---

## 6. Ongoing: how to develop privately, publish publicly

Three options for how to keep working after launch:

**Option α — Develop directly in public**
After launch, switch to developing in the public repo. New private apps live in separate private repos that consume `@brains/*` packages from npm. Simplest but means every WIP commit is public.

**Option β — Develop in private, sync to public**
Keep `brains-private` as the dev repo. Periodically (per release) sync the public-eligible subset to `brains` via a script that copies files, commits, and pushes. Requires writing the sync script and being disciplined about not letting the two diverge.

**Option γ — Two-repo with subtree**
Use `git subtree split` to extract the public subset as a separate history that gets pushed to the public repo. More complex setup, but preserves clean per-file history going forward.

**Recommendation:** start with **α** (develop in public) once v1.0 is out. The private archive stays for historical bisect/blame, but new work happens in public. Drop into β only if you find yourself wanting to do messy WIP that you don't want exposed.

---

## 7. Rollback plan

If something goes wrong at any phase:

| Phase | Failure mode                             | Rollback                                                                                        |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1     | Backup didn't take                       | Try again, do not proceed                                                                       |
| 2     | Audit finds something scary              | Pause, fix in current repo, re-audit                                                            |
| 3     | Tree won't build after removal           | Either fix the cross-package leakage (real bug, fix it) or add the file back to the public set  |
| 4     | Test repo looks wrong                    | Delete `brains-public-staging`, start phase 3 over                                              |
| 5     | Pushed to wrong place / leaked something | Delete the public repo immediately, rotate ALL tokens (assume compromise), restart from phase 4 |
| 6     | Token rotation breaks something          | Documented per-service rollback in deploy/scripts                                               |

The orphan-commit step is fully reversible _until_ phase 5 push. After phase 5 push, GitHub caches and forks make recovery hard — this is why phase 4 dry-run is mandatory.

---

## 8. Open questions / risks

- ~~**Does anything in `shell/*` import from `apps/*` or `sites/*`?**~~ **Answered by preflight:** No. One resolvable dependency (`brains/rover` → `@brains/site-default`) handled by including `sites/default` and `layouts/{personal,professional}` in the public set. See §10.
- **Are there any secrets in old tracked files that are still in HEAD?** Phase 2 catches this, but be especially careful with `deploy/**` and `.github/workflows/*`.
- ~~**Does `bun.lock` reference any private packages?**~~ **Answered by preflight:** Only as their own entries, not as deps of public packages. Regenerates cleanly after narrowing workspace globs.
- **Are any of the entity test fixtures (`entities/*/test-data/`) personal content?** Should be generic fakes; verify in phase 2.
- **`brains/rover/eval-content/` contains a real `brain.db`** with seed entities — confirm those entities are safe-for-public (they're meant to be the demo content, so should be fine, but worth one final read).
- **Extensive `yeehaa.io` personalization** — the codebase uses this as the canonical example domain in ~40 files. See Phase 2 step 2 for the decision.

---

## 9. Estimated total time

| Phase                | Original estimate    | Revised (post-preflight) |
| -------------------- | -------------------- | ------------------------ |
| 0 — Decide           | 30 min               | 30 min                   |
| 1 — Backup           | 15 min               | 15 min                   |
| 2 — Audit            | 2–4 hours            | 2–3 hours                |
| 3 — Build clean tree | half day – 1 day     | **2–3 hours**            |
| 4 — Dry-run          | 1 hour               | 1 hour                   |
| 5 — Real publish     | 1–2 hours            | 1–2 hours                |
| 6 — Post-launch      | 2 hours              | 2 hours                  |
| **Total**            | **1–2 working days** | **~1 working day**       |

The revised Phase 3 estimate reflects the preflight finding that there is no structural cross-package coupling — removal is mechanical, not architectural surgery.

---

## 10. Preflight scan results and completed pre-work

A preflight scan of the current tree (HEAD, not history) validated the plan's biggest risk flag and completed the mechanical pre-work that would otherwise happen in Phase 3.

### 10.1 Structural cross-package coupling: clean ✅

- **No relative-path imports** from public subtrees into private (`../../apps/`, `../../sites/`, etc.)
- **No tsconfig project references** crossing the public→private boundary
- **No package.json dependencies** on actually-private packages from the public set
- **`bun.lock`** only references private packages as their own top-level entries, never as deps of public packages
- **One real dependency** (`brains/rover` → `@brains/site-default` → `@brains/layout-professional`) resolved by recognizing those three packages are generic building blocks that belong in the public set, not private content. Inventory updated in §3.

### 10.2 Inventory corrections to §3

The original plan listed three layout directories that don't exist (`layouts/{mylittlephoney,yeehaa,ranger}`). The actual layout directories are `layouts/personal` and `layouts/professional`, both generic and promoted to public. Also discovered: `shared/theme-{mylittlephoney,yeehaa,rizom}` are branded themes that should be private.

### 10.3 Mechanical rewrites completed in-place

These edits were made in the current working tree so they merge into the private dev history cleanly and don't need to be redone in Phase 3. All were verified by running the affected test suites (462 tests pass, typecheck clean on all touched packages).

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

### 10.4 Remaining work for Phase 2

The preflight surfaced one larger cleanup category that is left for Phase 2 to decide:

- **`yeehaa.io` as canonical example domain** — appears in ~40 files across JSDoc comments, test fixtures, production code examples (e.g. `shared/utils/src/string-utils.ts`, `shell/plugins/src/base/context.ts`, `interfaces/a2a/src/client.ts`). This is the author's own public domain, so it's not a leak, but it's a branding choice. See Phase 2 step 2 for the decision.
- **`plugins/directory-sync/test/git-*.test.ts`** — uses `rizom-ai/test-content` as a plausible example repo name. Not a leak (org name is public), can be left or scrubbed to `your-org/test-content`.
- **`shell/identity-service/test/anchor-profile-adapter.test.ts`** — uses `contact@rizom.ai` in test fixtures. Fake contact email, not a leak, can be left.

### 10.5 Commit suggestion

The mechanical rewrites in §10.3 are safe to commit to the private dev repo as their own changeset before the orphan-commit dance. They improve the codebase regardless of public release and have no downside. Suggested split:

1. `chore(cleanup): use generic example names in shell/app tests and docs` — the test/doc rewrites (10 files)
2. `fix(directory-sync): use neutral default authorEmail` — the one framework fix (1 file)

After these land, Phase 3 effectively only has to narrow workspace globs, remove private directories, regenerate `bun.lock`, and run the full build — truly mechanical.
