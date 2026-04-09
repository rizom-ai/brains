# Plan: First End-to-End Deploy of rizom.ai

## Context

rizom.ai is the MVP target instance from `rizom-sites.md` — the marketing site for the brains framework. Phases 0-3 of `rizom-sites.md` have landed: object-form site overrides, the rizom brand theme, the `sites/rizom` site package, and the `apps/rizom-ai` instance scaffold. Per-variant content for the `ai` variant exists in `apps/rizom-ai/brain-data/site-content/home/` (8 home sections including the rizom-specific hero copy).

The plan as originally written (`rizom-sites.md` follow-up #4 + the roadmap "Rizom Sites" entry) said rizom.ai would deploy on **existing Hetzner infra independent of Kamal**. The point of going legacy was to decouple rizom.ai from Kamal Phase 2 timing so the marketing site could ship while the new pipeline matured.

That decoupling rationale has dissolved over the last week:

- `brain cert:bootstrap` shipped (`c7032b23`, simplified in `d5290fb6`).
- App-local `.env.schema` generation shipped (`206d6cac`).
- `brain init` artifact reconciliation shipped.
- The on-disk state of `apps/rizom-ai/` is already Kamal-flavored: `.kamal/hooks/pre-deploy`, `config/deploy.yml`, `.github/workflows/deploy.yml` — nothing legacy.
- The legacy Hetzner infra is on the deletion list per `deploy-kamal.md` §"What gets deleted from monorepo". Adding a new instance to it means writing throwaway plumbing.
- Foundation and work both go via Kamal regardless. Going legacy for rizom.ai means **maintaining two parallel deploy paths** during the most fragile bring-up window.

**Decision (this plan formalizes it)**: rizom.ai becomes the first Kamal deploy. The roadmap's "(independent of Kamal)" qualifier and the "Why rizom.ai first" rationale in `rizom-sites.md` get retired in this plan's successor commit.

## Goal

Push to brains main → rizom.ai is live at `https://rizom.ai` with a valid Cloudflare-issued edge cert, kamal-proxy terminating TLS via the Origin CA cert, content from `rizom-ai/rizom-ai-content` git repo, ranger brain model image from GHCR.

## Non-goals

- **Phase 1 manual server provisioning.** We skip directly to Phase 2+ auto-provisioning per `deploy-kamal.md`. Phase 1 is throwaway plumbing if Phase 2 lands the same week.
- **Full varlock workflow consumption** (`varlock-instance-env-schema.md` Phase 3). This is now in the repo state for the first deploy workflow; the remaining work is operator-side setup and verification.
- **Extracting `apps/rizom-ai` to its own repo** (`harmonize-monorepo-apps.md` Phase 2). Path-filter the workflow trigger to only fire on relevant subtrees; extraction is post-v0.1.0.
- **Foundation and work deploys.** Same shape, different brains; tackled after rizom.ai is green.
- **Auto-rotating the Cloudflare Origin CA cert.** The cert is 15 years; rotation tooling is a far-future concern.

## What's already in place

- **Brain model**: `brains/ranger` exists, included in the `publish-images.yml` matrix `[rover, ranger, relay]`. Multi-arch + fork-safe + release tags. Image lands at `ghcr.io/rizom-ai/ranger:latest` on every successful CI run on main.
- **Site package**: `sites/rizom` complete. All 8 home sections (hero, problem, answer, products, ownership, quickstart, mission, ecosystem), 3 canvases (tree/constellation/roots), variant plugin reads `variant: ai` from brain.yaml.
- **Instance config**: `apps/rizom-ai/brain.yaml` has `brain: ranger`, `domain: rizom.ai`, `site: { package: @brains/site-rizom, variant: ai }`, directory-sync to `rizom-ai/rizom-ai-content`, MCP authToken.
- **Content**: `apps/rizom-ai/brain-data/` has the 8 rizom.ai homepage sections, anchor profile, brain character, products, prompts, site-info.
- **CLI**: `brain cert:bootstrap` issues + Cloudflare zone-mode patch. `brain init --deploy` reconciles missing artifacts.
- **Pre-deploy hook**: `apps/rizom-ai/.kamal/hooks/pre-deploy` SCPs `brain.yaml` to the server before each deploy.

## Code blockers

These were the pure code edits in the brains repo. They are now landed in the current repo state and are kept here as the implementation trail.

### 1. `apps/rizom-ai/config/deploy.yml` is now in the Kamal / Origin CA shape

The current file uses the `ghcr.io/` registry prefix, `proxy.ssl.certificate_pem` / `proxy.ssl.private_key_pem`, and the instance-level `BRAIN_MODEL` / `BRAIN_DOMAIN` variables.

### 2. `apps/rizom-ai/.env.example` now includes the deploy / bootstrap vars

It contains the deploy and provisioning placeholders needed by the current Kamal flow, including `KAMAL_REGISTRY_PASSWORD`, `CF_API_TOKEN`, `CF_ZONE_ID`, `CERTIFICATE_PEM`, `PRIVATE_KEY_PEM`, `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`, and `KAMAL_SSH_PRIVATE_KEY`.

### 3. `apps/rizom-ai/.env.schema` now exists as a committed artifact

The schema is generated from the ranger model template plus the deploy / provisioning / TLS / backend bootstrap sections.

### 4. `.github/workflows/rizom-ai-deploy.yml` now consumes env via varlock

The workflow lives at the repo root so GitHub Actions can discover it, then runs app-locally via `working-directory: apps/rizom-ai`. It loads the instance schema, exports env to `$GITHUB_ENV`, writes `.kamal/secrets`, provisions Hetzner, updates Cloudflare DNS, and then runs `kamal deploy --skip-push`.

### 5. Auto-provision step (already wired into the workflow)

The first deploy workflow now creates or reuses the Hetzner server, waits for it to become `running`, and emits `SERVER_IP` for the DNS and Kamal steps.

## One-time operator setup (account-level, can't be code)

These run once per rizom-ai instance and never again.

1. **Cloudflare zone activation for rizom.ai.** Per `deploy-kamal.md` §"DNS setup → Zone prerequisites" and §"Rizom instance notes": `rizom.ai` is registered at MijnDomein. Add the zone on Cloudflare, update nameservers at MijnDomein to Cloudflare's assigned NS, wait for activation.
2. **Generate the kamal SSH keypair, register the public key in Hetzner.** `ssh-keygen -t ed25519 -N "" -f rizom-ai-kamal`. In Hetzner console: SSH keys → Add key → name it `rizom-ai-kamal` (this becomes the `HCLOUD_SSH_KEY_NAME` value). Store the private key in the chosen varlock backend as `KAMAL_SSH_PRIVATE_KEY`. Delete the local copy.
3. **Mint API tokens** in their respective consoles:
   - `HCLOUD_TOKEN` — Hetzner Cloud → Security → API tokens. Read+Write scope.
   - `CF_API_TOKEN` — Cloudflare → My Profile → API Tokens → Create. Permissions: `Zone > DNS > Edit` and `Zone > SSL and Certificates > Edit` on the rizom.ai zone.
   - `KAMAL_REGISTRY_PASSWORD` — GitHub → Settings → Developer settings → Personal access tokens. Scope `read:packages`.
4. **Capture `CF_ZONE_ID`** from the Cloudflare dashboard (Overview tab, right column).
5. **Create `rizom-ai/rizom-ai-content` GitHub repo.** `gh repo create rizom-ai/rizom-ai-content --private`. Push current `apps/rizom-ai/brain-data/` into it. directory-sync clones it on first boot.
6. **Run `brain cert:bootstrap --push-to 1password` in `apps/rizom-ai/`** with `CF_API_TOKEN` and `CF_ZONE_ID` set in env. Issues 15-year Origin CA cert + sets zone SSL mode to Full (strict). Pushes `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM` straight into the default 1Password vault.
7. **Run `brain secrets:push --push-to 1password`** to sync the remaining env-backed deploy secrets into the brains repo vault (default `brain-rizom-ai-prod`). Use `--dry-run` first if you want to preview the upload:
   - `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`
   - `KAMAL_SSH_PRIVATE_KEY` (from step 2)
   - `KAMAL_REGISTRY_PASSWORD`
   - `CF_API_TOKEN`, `CF_ZONE_ID`
   - `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`

   Keep only the backend bootstrap credential (`OP_TOKEN`) in GitHub Actions secrets. Then delete `origin.pem` and `origin.key` locally.

## Verifications

Quick sanity checks before pulling the trigger:

- **`ghcr.io/rizom-ai/ranger:latest` exists and is fetchable** — `crane manifest ghcr.io/rizom-ai/ranger:latest` or browse the GHCR package page.
- **`bun shell/app/scripts/build-model.ts ranger` builds locally without errors** — confirms the model bundle hasn't bitrotted (rover gets exercised regularly, ranger less so).
- **Variant content pass on `apps/rizom-ai/brain-data/site-content/home/*.md`** — read the 8 section files, confirm copy matches the brand guide for the `ai` variant register and that the CTA hrefs land on real anchors. The mission section's secondary CTA must point at the real framework repo (`https://github.com/rizom-ai/brains`), not the generic `https://github.com` homepage.

## Execution order

The shortest credible path to a green deploy.

### Step 1 — Code (already landed)

The deploy workflow, Kamal config, `.env.example`, and generated `.env.schema` are already in the repo state that accompanies this plan.

If the instance is regenerated later, keep those artifacts synchronized with `brain init --deploy` output.

### Step 2 — Operator setup (parallel with step 1)

Work through items 1-7 from "One-time operator setup" above. Items 1 (CF zone) and 5 (content repo creation) have the longest wall-clock time and should start first.

### Step 3 — Verify

7. Confirm `ghcr.io/rizom-ai/ranger:latest` exists on GHCR.
8. Build `ranger` locally to confirm no rot.
9. Read the variant content.

### Step 4 — Pull the trigger

10. Merge the PR from step 1.
11. Watch the workflow.

The first deploy will probably fail somewhere — likely the DNS step (timing), kamal-proxy healthcheck (cert mismatch), or directory-sync (token scope). Each is a fast iteration. Plan for 2-3 retries.

## Roadmap and plan updates after this lands

Once rizom.ai is live:

- **`docs/roadmap.md`** — Rizom Sites entry: drop "(independent of Kamal)". Merge with the Kamal Deploy entry as "rizom.ai is the first Kamal instance." Move both to a new "Completed (2026-04)" entry.
- **`docs/plans/rizom-sites.md`** — "Why rizom.ai first" rationale gets retired (the "no Kamal dependency on the critical path" line is no longer accurate). Phase 4 of the follow-up section becomes "done — see `rizom-ai-first-deploy.md`."
- **`docs/plans/deploy-kamal.md`** §"Phase 2: First standalone instance" can name rizom.ai explicitly and reference this plan as the execution record.
- **`docs/plans/standalone-apps.md`** — Phase 1 status updated to reflect rizom.ai as the first standalone (even though it lives in the monorepo until `harmonize-monorepo-apps.md` Phase 2 extraction).

## Follow-ups

After the first deploy is green:

- **Foundation (rizom.foundation)** — wire `apps/rizom-foundation/brain.yaml` to `@brains/site-rizom` with `variant: foundation`. Same code blockers as rizom-ai but the operator setup is faster the second time (one CF zone, one cert, one server label).
- **Work (rizom.work)** — same shape, `variant: work`.
- **Varlock backend expansion** — add additional backend templates/plugins for future external users. Not needed for the first deploy.
- **Repo extraction** — `harmonize-monorepo-apps.md` Phase 2. Extract `apps/rizom-ai` to its own repo so the deploy workflow lives outside the monorepo. Path-filter trigger is the interim solution.
- **`brain cert:bootstrap --push-to <backend>`** — landed for `1password` and `gh` push targets.

## Related

- `docs/plans/rizom-sites.md` — phases 0-3 (the in-tree work)
- `docs/plans/deploy-kamal.md` — the deploy pipeline shape this plan executes
- `docs/plans/varlock-instance-env-schema.md` — env schema generation + workflow consumption (done for rizom.ai)
- `docs/plans/init-artifact-reconcile.md` — `brain init` reconciliation behavior
- `docs/plans/standalone-apps.md` — long-term shape this plan is a step toward
- `docs/plans/harmonize-monorepo-apps.md` — repo extraction (post-v0.1.0)
