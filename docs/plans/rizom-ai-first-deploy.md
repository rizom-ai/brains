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
- **Full varlock workflow consumption** (`varlock-instance-env-schema.md` Phase 3). The schema generation half is shipped and the schema artifact lives in the instance dir, but the workflow still passes individual GH secrets named in YAML for the first deploy. Phase 3 hardening lands as a follow-up once rizom.ai is green.
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

These are pure code edits in the brains repo. All can land in one or two commits.

### 1. `apps/rizom-ai/config/deploy.yml` is stale

Three concrete bugs:

- `image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>` — missing the `ghcr.io/` registry prefix. Won't pull.
- `proxy: { ssl: true, ... }` — Let's Encrypt path. Should be `proxy: { ssl: { certificate_pem: CERTIFICATE_PEM, private_key_pem: PRIVATE_KEY_PEM }, ... }` per `deploy-kamal.md` §"Instance deploy.yml".
- Verify `app_port` consistency after the SSL change.

Fix: hand-edit (`brain init` reconciliation skips the existing file).

### 2. `apps/rizom-ai/.env.example` is incomplete

Currently lists only `AI_API_KEY` and `MCP_AUTH_TOKEN`. The new `brain init` template includes the full deploy var set: `GIT_SYNC_TOKEN`, `KAMAL_REGISTRY_PASSWORD`, `CERTIFICATE_PEM`, `PRIVATE_KEY_PEM`, `CF_API_TOKEN`, `CF_ZONE_ID`, `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`, `KAMAL_SSH_PRIVATE_KEY`, `BRAIN_MODEL`, `BRAIN_DOMAIN`.

Fix: hand-edit OR delete the existing file and re-run `brain init`.

### 3. `.env.schema` does not exist for `apps/rizom-ai`

The `feat(brain-cli): generate app env schema` work landed but hasn't been run for this instance. The schema is a committed artifact in the instance dir (per `varlock-instance-env-schema.md`).

Fix: re-run `brain init` in the instance directory; reconciliation generates `.env.schema` from the model template.

### 4. `apps/rizom-ai/.github/workflows/deploy.yml` is stale and missing steps

Current state passes only `KAMAL_REGISTRY_PASSWORD`, `SERVER_IP`, `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`. Missing:

- Forward `CERTIFICATE_PEM` + `PRIVATE_KEY_PEM` to kamal so kamal-proxy can terminate TLS.
- `.kamal/secrets` write step from resolved env (some kamal versions read secrets from disk, not env).
- A Cloudflare DNS step that creates/updates A records for `rizom.ai` and `preview.rizom.ai` → server IP, `proxied: true`. Per `deploy-kamal.md` §"Instance CI pipeline" Phase 1: "DNS ordering matters. kamal-proxy healthchecks the hostnames listed in `proxy.hosts` during deploy; if DNS doesn't resolve yet, the healthcheck fails and the container swap aborts. Always run the DNS job before `kamal deploy`, not after."
- Path-filter the workflow trigger to only fire on `apps/rizom-ai/**`, `brains/ranger/**`, `sites/rizom/**`, `shared/theme-rizom/**`, `shared/theme-base/**`, `shell/**`, `packages/brain-cli/**`. Avoids deploying rizom.ai on every monorepo push. (Proper fix is `harmonize-monorepo-apps.md` Phase 2 extraction; path-filter is the interim solution.)

### 5. Auto-provision step (pulls deploy-kamal Phase 2+ forward)

Per `deploy-kamal.md` §"Phase 2+ (auto-provisioning)":

> Provision — create server via Hetzner API if it doesn't exist (labeled by brain name), wait for SSH, output IP. All automated. Push to instance repo → deployed.

Add a `provision` job (or first step in the deploy job) to `.github/workflows/deploy.yml` that:

1. Reads `HCLOUD_TOKEN` from secrets.
2. `GET /v1/servers?label_selector=brain=rizom-ai` against `https://api.hetzner.cloud/v1`.
3. If the result is empty, `POST /v1/servers` with:
   - `name: rizom-ai`
   - `server_type: cpx21` (matches `options.memory: 4g` in `deploy.yml`)
   - `image: ubuntu-22.04`
   - `location: nbg1` (or operator default)
   - `ssh_keys: [$HCLOUD_SSH_KEY_NAME]`
   - `labels: { brain: rizom-ai }`
4. Polls `GET /v1/servers/{id}` until `status: running`.
5. Outputs `SERVER_IP` to `$GITHUB_OUTPUT`.
6. Subsequent DNS + kamal steps consume `${{ steps.provision.outputs.server_ip }}` instead of `secrets.SERVER_IP`.

Idempotent — re-runs no-op when the server exists. ~50 lines of YAML using `curl` + `jq`, or cleaner with the official `hetznercloud/cli` action.

Decision to make: rely on `kamal setup` (idempotent, runs apt + docker install on first deploy) vs. baking that into the provision step. Cleanest answer: rely on kamal's setup, just ensure the base image has SSH access and the registry pull works.

## One-time operator setup (account-level, can't be code)

These run once per rizom-ai instance and never again.

1. **Cloudflare zone activation for rizom.ai.** Per `deploy-kamal.md` §"DNS setup → Zone prerequisites" and §"Rizom instance notes": `rizom.ai` is registered at MijnDomein. Add the zone on Cloudflare, update nameservers at MijnDomein to Cloudflare's assigned NS, wait for activation.
2. **Generate the kamal SSH keypair, register the public key in Hetzner.** `ssh-keygen -t ed25519 -N "" -f rizom-ai-kamal`. In Hetzner console: SSH keys → Add key → name it `rizom-ai-kamal` (this becomes the `HCLOUD_SSH_KEY_NAME` value). Push the private key to GH secrets as `KAMAL_SSH_PRIVATE_KEY`. Delete the local copy.
3. **Mint API tokens** in their respective consoles:
   - `HCLOUD_TOKEN` — Hetzner Cloud → Security → API tokens. Read+Write scope.
   - `CF_API_TOKEN` — Cloudflare → My Profile → API Tokens → Create. Permissions: `Zone > DNS > Edit` and `Zone > SSL and Certificates > Edit` on the rizom.ai zone.
   - `KAMAL_REGISTRY_PASSWORD` — GitHub → Settings → Developer settings → Personal access tokens. Scope `read:packages`.
4. **Capture `CF_ZONE_ID`** from the Cloudflare dashboard (Overview tab, right column).
5. **Create `rizom-ai/rizom-ai-content` GitHub repo.** `gh repo create rizom-ai/rizom-ai-content --private`. Push current `apps/rizom-ai/brain-data/` into it. directory-sync clones it on first boot.
6. **Run `brain cert:bootstrap` in `apps/rizom-ai/`** with `CF_API_TOKEN` and `CF_ZONE_ID` set in env. Issues 15-year Origin CA cert + sets zone SSL mode to Full (strict). Writes `origin.pem` and `origin.key` locally.
7. **Push cert + remaining secrets to GH Actions secrets** for the brains repo:
   - `CERTIFICATE_PEM` ← from `origin.pem`
   - `PRIVATE_KEY_PEM` ← from `origin.key`
   - `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`
   - `KAMAL_SSH_PRIVATE_KEY` (from step 2)
   - `KAMAL_REGISTRY_PASSWORD`
   - `CF_API_TOKEN`, `CF_ZONE_ID`
   - `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`

   Then delete `origin.pem` and `origin.key` locally.

## Verifications

Quick sanity checks before pulling the trigger:

- **`ghcr.io/rizom-ai/ranger:latest` exists and is fetchable** — `crane manifest ghcr.io/rizom-ai/ranger:latest` or browse the GHCR package page.
- **`bun shell/app/scripts/build-model.ts ranger` builds locally without errors** — confirms the model bundle hasn't bitrotted (rover gets exercised regularly, ranger less so).
- **Variant content pass on `apps/rizom-ai/brain-data/site-content/home/*.md`** — read the 8 section files, confirm copy matches the brand guide for the `ai` variant register and that the CTA hrefs land on real anchors.

## Execution order

The shortest credible path to a green deploy.

### Step 1 — Code (one PR)

1. Edit `apps/rizom-ai/config/deploy.yml` per blocker #1.
2. Edit `apps/rizom-ai/.env.example` per blocker #2 (or regenerate via `brain init`).
3. Run `brain init` in `apps/rizom-ai/` to materialize `.env.schema` per blocker #3.
4. Edit `apps/rizom-ai/.github/workflows/deploy.yml` per blockers #4 and #5: add cert vars, add `.kamal/secrets` write, add CF DNS step, add Hetzner provision step, path-filter the trigger.
5. Run typecheck + tests + lint locally.
6. Open PR. Don't merge yet.

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
- **Varlock workflow consumption** — `varlock-instance-env-schema.md` Phase 3. Replace named-secret YAML with `varlock load`. Cleaner but not blocking.
- **Repo extraction** — `harmonize-monorepo-apps.md` Phase 2. Extract `apps/rizom-ai` to its own repo so the deploy workflow lives outside the monorepo. Path-filter trigger is the interim solution.
- **`brain cert:bootstrap --push-to <backend>`** flag — currently the cert push to GH secrets is `gh secret set` by hand. A `--push-to gh` flag on the bootstrap command would round-trip the whole flow.

## Related

- `docs/plans/rizom-sites.md` — phases 0-3 (the in-tree work)
- `docs/plans/deploy-kamal.md` — the deploy pipeline shape this plan executes
- `docs/plans/varlock-instance-env-schema.md` — env schema generation (done) + workflow consumption (deferred)
- `docs/plans/init-artifact-reconcile.md` — `brain init` reconciliation behavior
- `docs/plans/standalone-apps.md` — long-term shape this plan is a step toward
- `docs/plans/harmonize-monorepo-apps.md` — repo extraction (post-v0.1.0)
