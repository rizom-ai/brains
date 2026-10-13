# Plan: Bootstrap secrets go where `--push-to` says

## Status

Proposed 2026-09-27. Not started. Builds on #399 (on main), which routes both CLIs' certificate issuing through `@brains/deploy-support` and renames the GitHub push to `pushSecretsToGitHub`.

## Problem

`brain cert:bootstrap` and `brain ssh-key:bootstrap` advertise `--push-to bitwarden` (the shared `pushToFlag`: "`gh`, `github`, `bw`, or `bitwarden`"). Given `bitwarden`, both store the secret in GitHub Secrets and then log `Pushed … to bitwarden`. `brains-ops cert:bootstrap`, `age-key:bootstrap` and `ssh-key:bootstrap` advertise only `gh`, but the shared `normalizePushTarget` accepts `bitwarden` too, with the same result.

A plain switch to Bitwarden would break deploys: the deploy workflow resolves its environment with `varlock load --path .env.schema`, and an entry such as `CERTIFICATE_PEM=` is read from the GitHub secret of that name. Only an entry rewritten to `bitwarden("<id>")` is fetched from Bitwarden.

## Facts this rests on

- `brain secrets:push --push-to bitwarden` already does the whole job for env secrets: `BitwardenSecretsManagerClient.pushSecrets` stores each value in the Bitwarden project named for the brain (`inferBitwardenProjectName`), then `updateSchemaWithBitwardenMappings` rewrites each `.env.schema` entry to `bitwarden("<id>")` and adds the plugin decorators. It requires a `.env.schema`.
- For certificates this already works in two steps: `secrets:push` skips `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` for GitHub, but keeps them for Bitwarden, which its comment names the source-of-truth backend. The bootstrap command's `--push-to bitwarden` is the one-step form of that same path.
- `bootstrapSshKey` lives in `@brains/deploy-support` and pushes through `pushSecretsToGitHub` itself; `brain ssh-key:bootstrap` and `brains-ops ssh-key:bootstrap` both call it.
- The rover-pilot `.env.schema` template carries no Bitwarden plugin: shared deploy values are GitHub secrets and per-user values come from age-encrypted files. The pilot has no Bitwarden backend.

## Decisions

- **The CLI chooses where secrets go; bootstrap code only hands them over.** Every bootstrap function takes a `pushSecrets(secrets)` sink instead of calling `pushSecretsToGitHub` itself. The CLI builds the sink from `--push-to`.
- **One sink per backend in `brain-cli`.** `gh` → `pushSecretsToGitHub`. `bitwarden` → the `secrets:push` Bitwarden path: store the values, then rewrite their `.env.schema` entries. That path moves out of `commands/secrets-push.ts` into a `brain-cli` module that `secrets:push` and both bootstrap commands share. Bitwarden stays in `brain-cli`, the only CLI with a Bitwarden backend.
- **`brains-ops` accepts the targets it documents.** `normalizePushTarget` takes the set of targets a CLI supports; `brains-ops` passes `gh` only, so `--push-to bitwarden` fails at argument parsing with the same message any unknown target gets. `brain` passes both.
- **The log states the backend that was written**, from the sink, not from the flag.

## Phases

Each phase is one PR with its changeset; tests are written first.

### Phase 1 — `brain cert:bootstrap --push-to bitwarden` deploys (walking skeleton)

- Tests first (`packages/brain-cli/test`): with a Bitwarden-backed `.env.schema` and a fake Bitwarden client, `cert:bootstrap --push-to bitwarden` stores `CERTIFICATE_PEM` and `PRIVATE_KEY_PEM` in the brain's project, rewrites both schema entries to `bitwarden("<id>")`, runs no `gh` command, and logs Bitwarden. Without a `.env.schema` it fails before issuing a certificate. `--push-to gh` is unchanged.
- Extract the Bitwarden sink from `secrets-push.ts`; `secrets:push` uses it unchanged (its suite stays green).
- Verify on a test brain: bootstrap with `--push-to bitwarden`, run the deploy workflow, and confirm the origin serves the new certificate. The PR records the run.

### Phase 2 — `ssh-key:bootstrap` takes the sink

- Tests first (`shared/deploy-support/test`): `bootstrapSshKey` hands `KAMAL_SSH_PRIVATE_KEY` to the injected sink and pushes nothing itself. A `brain-cli` test: `ssh-key:bootstrap --push-to bitwarden` maps the key in `.env.schema`.
- `brain ssh-key:bootstrap` builds its sink from `--push-to`; `brains-ops ssh-key:bootstrap` passes the GitHub sink.
- Verify with a deploy on the test brain that Kamal connects with the Bitwarden-held key.

### Phase 3 — `brains-ops` parses only `gh`

- Tests first (`packages/brains-ops/test`): `cert:bootstrap`, `age-key:bootstrap` and `ssh-key:bootstrap` reject `--push-to bitwarden` at parsing with the unknown-target message and issue nothing; `gh`/`github` behave as before.
- `normalizePushTarget(value, supported)`; `brains-ops` passes `["gh"]`.

## Constraints

- No change to `--push-to gh` anywhere: same secrets, same GitHub names, same workflows.
- Existing Bitwarden-backed brains keep working: schema entries already mapped are rewritten to the new secret ids on the next bootstrap, exactly as `secrets:push` does today.
- Per-phase gates: `@rizom/brain`, `@rizom/ops` and `@brains/deploy-support` tests; `bun run typecheck`; `bun scripts/lint.mjs --force --filter` for each touched workspace; phases 1 and 2 add the recorded test-brain deploy.
