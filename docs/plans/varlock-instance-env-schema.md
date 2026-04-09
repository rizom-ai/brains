# Plan: Instance-local Varlock schema for deploy automation

## Context

We want deploy/provision automation to use varlock properly.

Two constraints are now clear:

1. `apps/rizom-ai` must own a local `.env.schema`.
2. That schema must **not** depend on a monorepo-relative import like `@import(../../brains/ranger/.env.schema)`.

The current direction of stuffing app secrets into GitHub Actions secrets or a single env blob is not the intended architecture.

## Goal

Make app/deploy/provision env resolution varlock-native:

- each instance owns a local `.env.schema`
- the workflow loads env through varlock
- app/runtime secret requirements come from schema
- deploy/provision secret requirements are also modeled in schema
- the CI system's native secret store only holds bootstrap credentials for the secret backend (plus any unavoidable platform bootstrap secrets)

## Non-goals

- Relative schema imports from `apps/*` into `brains/*`
- Ad hoc per-workflow secret name contracts as the source of truth
- Large opaque `RIZOM_AI_ENV` blobs
- A "halfway" workflow that still hardcodes app env keys in GitHub Actions while merely validating them against `.env.schema`

## Target architecture

### 1. App-local schema

Each deployable app gets a committed/generated schema file:

```text
apps/rizom-ai/.env.schema
```

This file is the schema the workflow uses.

### 2. Generated, not hand-maintained

The app-local schema is generated from:

- the **model-exported env schema** (runtime vars)
- the **brain-cli's deploy template** (deploy/provision vars)
- the **user's backend choice** (plugin directive)

#### Generation mechanism

Each brain model package ships an `env.schema.template` file as part of its npm distribution (listed in package.json's `files`). At init time, `brain init` / reconcile:

1. Resolves the template via Node module resolution: `require.resolve('@brains/<model>/env.schema.template')`. This works in monorepo _and_ standalone repo layouts — no relative imports.
2. Reads the model's required runtime vars from that template.
3. Appends the deploy/provision section from a built-in `brain-cli` template (vars like `HCLOUD_TOKEN`, `CF_API_TOKEN`, `BRAIN_MODEL`, `BRAIN_DOMAIN`, etc. — see the full list below).
4. Appends TLS cert vars (`CERTIFICATE_PEM`, `PRIVATE_KEY_PEM`) — these are produced by `brain cert:bootstrap`, see "TLS cert handoff" below.
5. Injects the `@plugin(...)` directive for the user's chosen backend (default: 1Password for rizom's own instances; external users pass `--backend` to pick another).
6. Writes the result to `apps/<instance>/.env.schema`.

The model package remains the source of truth for runtime vars. Brain-cli is the source of truth for deploy/provision vars. The generated file is a committed artifact in the instance repo — re-running reconcile updates it when either source changes.

### 3. Varlock in CI

The deploy workflow should load env from the app directory using varlock.

Preferred flow:

1. checkout repo
2. load env in `apps/rizom-ai` via varlock
3. provision Hetzner
4. deploy with Kamal
5. update Cloudflare

### 4. Secret backend

Varlock should resolve secrets from a real backend, not from a pile of GitHub secrets.

**Rizom's own instances** use 1Password via `@varlock/1password-plugin` as the default backend. Scoping:

- One 1Password **vault per instance**: `brain-<instance>-prod` (e.g. `brain-rizom-ai-prod`).
- One 1Password **service account per instance**, with access only to that vault. Service account token lives in GitHub secrets as `OP_TOKEN` for that instance's repo; local shells can export `OP_SERVICE_ACCOUNT_TOKEN` when running the CLI by hand.
- This gives per-instance blast radius — a leaked `OP_TOKEN` in GitHub compromises one brain's secrets, not all of them.

**External users** pick their own backend. The schema format is varlock-native and backend-agnostic — only the `@plugin(...)` directive at the top changes. Supported alternatives include any varlock plugin the user wires up (Doppler, HashiCorp Vault, AWS Secrets Manager, env file for local dev, etc.). `brain init --backend <name>` selects the generator's plugin line.

In all cases:

- `.env.schema` describes required vars.
- Secret values are resolved by varlock from the chosen backend.
- GitHub (or the CI system of choice) stores only the bootstrap credential(s) needed for varlock to talk to that backend.

### 5. TLS cert handoff

`CERTIFICATE_PEM` and `PRIVATE_KEY_PEM` are a special case because they're **produced**, not entered by hand. The flow:

1. Operator runs `brain cert:bootstrap` once per instance (see `deploy-kamal.md` → "One-time bootstrap"). The command issues a Cloudflare Origin CA cert and writes `origin.pem` + `origin.key` to the instance directory.
2. Operator stores those files with `brain cert:bootstrap --push-to 1password` or `--push-to gh`. The env-backed secrets use `brain secrets:push --push-to 1password` (or `--push-to gh`), and `--dry-run` can preview the upload before it lands, so the instance backend ends up with the full secret set.
3. Operator deletes the local `origin.pem` / `origin.key` files.
4. On deploy, varlock resolves `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM` from the backend like any other secret and writes them into `.kamal/secrets` for kamal-proxy to pick up.

Re-issuing the cert (e.g. adding a custom domain) is the same loop: re-run `brain cert:bootstrap --push-to 1password` (or `--push-to gh`), update the backend, and the next deploy picks it up.

## App-local schema shape

`apps/rizom-ai/.env.schema` should contain four groups of variables. Names are aligned with `docs/plans/deploy-kamal.md` → "Secrets delivery".

### Runtime/app vars

Sourced from the model's `env.schema.template`. Example for the `ranger` model:

- `AI_API_KEY` — sensitive
- `GIT_SYNC_TOKEN` — sensitive
- `MCP_AUTH_TOKEN` — sensitive
- `DISCORD_BOT_TOKEN` — sensitive

These become the container's runtime env via kamal's `env.secret` list.

### Deploy/provision vars

The instance-level deploy/provision variables, injected by the brain-cli generator:

- `HCLOUD_TOKEN` — sensitive. Hetzner Cloud API token for provisioning.
- `HCLOUD_SSH_KEY_NAME` — not sensitive. Label of the SSH key registered in Hetzner, used when creating the server.
- `KAMAL_SSH_PRIVATE_KEY` — sensitive. Private key kamal uses to SSH into the server. Workflow writes it to `~/.ssh/id_ed25519` (`chmod 600`) at job start; kamal reads it from disk.
- `KAMAL_REGISTRY_PASSWORD` — sensitive. GHCR pull token.
- `CF_API_TOKEN` — sensitive. Cloudflare API token with `Zone > DNS > Edit` and `Zone > SSL and Certificates > Edit` on the instance's zone. Used by the DNS job and by `brain cert:bootstrap`.
- `CF_ZONE_ID` — not sensitive. Cloudflare zone ID for the instance's domain.
- `BRAIN_MODEL` — not sensitive. Which brain model image to deploy (e.g. `ranger`, `rover`). Consumed by `config/deploy.yml` via ERB.
- `BRAIN_DOMAIN` — not sensitive. Production hostname for this instance (e.g. `rizom.ai`). Consumed by `config/deploy.yml` via ERB.

Non-sensitive vars still belong in the schema (varlock validates presence and type); they simply omit the `@sensitive` marker.

### TLS cert vars

Produced by `brain cert:bootstrap`, stored in the backend, resolved on deploy (see "TLS cert handoff" above):

- `CERTIFICATE_PEM` — sensitive. Cloudflare Origin CA certificate, PEM-encoded.
- `PRIVATE_KEY_PEM` — sensitive. Corresponding private key, PEM-encoded.

### Secret backend bootstrap

If using the 1Password plugin:

- `OP_TOKEN` — sensitive. 1Password service account token for GitHub/workflow use; local CLI runs can use `OP_SERVICE_ACCOUNT_TOKEN` instead.

### Pipeline-produced values (not in schema)

`SERVER_IP` is **not** a schema variable — it's computed by the provision job (Hetzner API response or lookup by label) and passed between pipeline jobs as step output, not resolved from a secret backend. When SSH/kamal commands need it, the workflow interpolates it from the job output, not from varlock.

If an operator is running against a pre-existing static server and prefers to pin the IP, they can set it as a plain pipeline env var in the workflow file (not the schema) — but that's a workflow concern, not a secret-backend concern.

## Recommended varlock pattern

Use the app-local `.env.schema` as the only schema the workflow sees.

That schema should:

- register the 1Password plugin
- initialize it for CI/service-account auth
- optionally bulk-load an environment from 1Password
- define/validate both runtime and deploy vars

Conceptually (using 1Password as the default backend for rizom instances):

```env
# @plugin(@varlock/1password-plugin)
# @initOp(token=$OP_TOKEN)
# @setValuesBulk(opLoadVault(brain-rizom-ai-prod))
# ---

# ---- runtime/app vars (from model env.schema.template) ----

# @required @sensitive
AI_API_KEY=

# @required @sensitive
GIT_SYNC_TOKEN=

# @sensitive
MCP_AUTH_TOKEN=

# @sensitive
DISCORD_BOT_TOKEN=

# ---- deploy/provision vars (from brain-cli template) ----

# @required @sensitive
HCLOUD_TOKEN=

# @required
HCLOUD_SSH_KEY_NAME=

# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=

# @required @sensitive
KAMAL_REGISTRY_PASSWORD=

# @required @sensitive
CF_API_TOKEN=

# @required
CF_ZONE_ID=

# @required
BRAIN_MODEL=

# @required
BRAIN_DOMAIN=

# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----

# @required @sensitive
CERTIFICATE_PEM=

# @required @sensitive
PRIVATE_KEY_PEM=

# ---- secret backend bootstrap ----

# @type=opServiceAccountToken @required @sensitive
OP_TOKEN=
```

External users swap the `@plugin` line for their backend of choice and remove `OP_TOKEN` from the bootstrap section, substituting whatever credential their backend needs. Everything else stays identical.

The important points: **the app owns the final schema**, and **the only thing that changes between backends is the plugin directive and the bootstrap credential**.

## Workflow implications

The deploy workflow should stop manually naming app/runtime env keys.

The intended end state is:

1. Run varlock in `apps/rizom-ai` once at the start of the job — `varlock load` (or equivalent) resolves every var in `.env.schema` from the configured backend.
2. Export the resolved env to the job's shell so all subsequent steps inherit it via `$GITHUB_ENV` (GitHub Actions) or the equivalent mechanism in other CI systems.
3. Write `KAMAL_SSH_PRIVATE_KEY` to `~/.ssh/id_ed25519` (`chmod 600`) so kamal can SSH into the target host.
4. Write `.kamal/secrets` from the resolved env — only the keys kamal needs (`KAMAL_REGISTRY_PASSWORD`, the app `secret:` list from `config/deploy.yml`, and the two `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM` values).
5. Run provision (Hetzner API using `HCLOUD_TOKEN`), capture `SERVER_IP` as step output.
6. Run Cloudflare DNS (API using `CF_API_TOKEN`, `CF_ZONE_ID`, `BRAIN_DOMAIN`), receives `SERVER_IP` as an input from step 5.
7. Run `kamal deploy` with `SERVER_IP` passed via env to `config/deploy.yml`'s ERB.

No step in the workflow file should reference individual app secret names like `AI_API_KEY` — those are resolved once by varlock and inherited through the shell env.

### Explicit anti-pattern to avoid

This is **not** enough:

- app-local `.env.schema` exists
- workflow still passes `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`, etc. individually from GitHub secrets
- varlock only validates those injected values

That still leaves the workflow as the real secret contract. It is only schema validation, not proper varlock-based secret resolution.

### Good

- workflow depends on app-local `.env.schema`
- one schema-backed env model for runtime + deploy
- bootstrap secret only in the CI system's native secret store
- no hardcoded app env key list in the workflow

### Bad

- workflow invents a separate deploy secret contract
- app secrets duplicated as individual CI-native secrets
- giant raw env blob in CI-native secrets

## Implementation steps

### Phase 1: schema generation

1. Ship `env.schema.template` from each brain model package (add to `files` in package.json). Start with the `ranger` model.
2. Add a deploy/provision template inside `packages/brain-cli` covering the vars listed under "Deploy/provision vars" above.
3. Implement the generator in `brain init` and the reconcile flow: resolve model template via `require.resolve`, merge with brain-cli template, inject `@plugin` directive based on `--backend` flag (default `1password`), write to `apps/<instance>/.env.schema`.
4. Reconcile missing `.env.schema` for existing apps on next `brain init` run (this slots into the existing reconcile logic from commit `07b5da39`).
5. Verify in monorepo and a standalone-repo test fixture that the resolution works identically.

### Phase 2: backend integration

1. Land the 1Password plugin wiring as the default `--backend` option.
2. Document the per-instance vault + service account pattern from the "Secret backend" section above.
3. Document the `brain cert:bootstrap` → backend push flow for `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM`.
4. Reduce existing GitHub Actions secrets on rizom's instance repos to just `OP_TOKEN` (keep `OP_SERVICE_ACCOUNT_TOKEN` for local shells only).
5. Add at least one non-1Password backend option (e.g. env file for local dev) to validate the plugin abstraction works for external users.

### Phase 3: workflow consumption

1. Update the deploy workflow to run `varlock load` from `apps/<instance>` at job start and export resolved env via `$GITHUB_ENV`.
2. Remove every explicit `env:` or `secrets.*` reference to app/runtime secret names from the workflow YAML. Only bootstrap credentials (`OP_TOKEN`) remain named in the workflow; local CLI runs can still read `OP_SERVICE_ACCOUNT_TOKEN`.
3. Add the `KAMAL_SSH_PRIVATE_KEY` → `~/.ssh/id_ed25519` step.
4. Build `.kamal/secrets` by templating resolved env values — no hardcoded secret names in the workflow.
5. Pass `SERVER_IP` from the provision step's output to the Cloudflare DNS step and the `kamal deploy` step as step inputs, not via the secret backend.
6. Verify the workflow works for first deploy (cert bootstrap run manually once), subsequent deploy (cert already in backend), and rollback (`kamal rollback` — should work without re-resolving secrets since kamal caches the last-deployed container image).

## Success criteria

- Brain models ship `env.schema.template` in their npm package `files`.
- `apps/rizom-ai/.env.schema` exists, is app-local, and is generated — not hand-maintained.
- No relative import into `brains/ranger/.env.schema`. Resolution goes through `require.resolve('@brains/<model>/env.schema.template')` and works identically in monorepo and standalone repo layouts.
- The schema includes all four groups: runtime vars, deploy/provision vars, TLS cert vars, backend bootstrap.
- Variable names are aligned with `docs/plans/deploy-kamal.md` → "Secrets delivery" (same names on both sides of the deploy contract).
- `brain cert:bootstrap` pushes `CERTIFICATE_PEM` + `PRIVATE_KEY_PEM` into the chosen secret backend; deploys resolve them via varlock like any other secret.
- The deploy workflow calls `varlock load` once, exports to `$GITHUB_ENV`, and every subsequent step inherits resolved values. No individual app secret names appear in the workflow YAML.
- GitHub secret surface on rizom's instance repos is reduced to `OP_TOKEN` only, while local operator shells use `OP_SERVICE_ACCOUNT_TOKEN`.
- External users can run `brain init --backend <name>` to generate the same schema against a non-1Password backend, and the rest of the flow is unchanged.
- `SERVER_IP` is handled as pipeline output, not a schema variable — the doc makes this distinction explicit.
