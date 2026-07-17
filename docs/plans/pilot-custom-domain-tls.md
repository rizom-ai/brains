# Plan: Custom-domain TLS from rover-pilot

## Status

Implemented, with the long-PEM YAML parser follow-up pending release; production
cutover remains. This enables the rizom.ai cutover
([rizom-consolidation.md](./rizom-consolidation.md)) and hosting brains at foreign
zones (yeehaa.io) from the pilot.

## Context

Today every fleet brain lives at `<handle>.rizom.ai` behind one shared Cloudflare
Origin CA cert (`*.rizom.ai`), stored in Bitwarden and varlock-loaded into every
deploy. That model cannot serve the zone apex (`rizom.ai` is not covered by the
wildcard — verified against the live cert's SANs) or foreign zones (yeehaa.io).

The repo already has most of the right design and it is age-based, not
Bitwarden-based:

- `brains-ops cert:bootstrap . --handle <h>` issues `[domain, *.domain]` from
  the user's registry entry and writes `origin.pem`/`origin.key` plus a
  `secrets.yaml` snippet in the staging-file format.
- `brains-ops secrets:encrypt . <h>` already accepts `certificatePem` /
  `privateKeyPem` (schema, staging file, `CERTIFICATE_PEM(_FILE)` fallbacks)
  and folds them into `users/<h>.secrets.yaml.age`. Rotation is a commit; cert
  and key travel in one file, so a half-updated pair cannot ship.
- The deploy workflow decrypts the user file after varlock loads the shared
  env, so user-level exports naturally override the shared cert per user.

TLS is per-user material delivered through the age flow. Bitwarden keeps the
existing shared wildcard cert for plain fleet members and never holds another
cert. An apex-covering replacement cert is already issued and sits in
`rover-pilot/.brains-ops/certs/shared/` — it will be re-issued per user via
`cert:bootstrap --handle` instead of updating the shared store.

## Implementation

1. **Decrypt-side export** — `decrypt-user-secrets.ts` exports a complete
   `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` pair when present in the user's decrypted
   secrets and rejects a partial pair. Users without overrides leave the shared
   varlock-loaded certificate untouched. The pilot copy also exports the
   per-user `ATPROTO_APP_PASSWORD`.
2. **Custom-domain aliases** — `resolve-user-config.ts` keeps
   `<handle>-preview.<zone>` for exact fleet domains and falls back to
   `preview.<domain>` for custom/apex domains. Custom domains also resolve
   `www.<domain>`; deploy routes it through Kamal, migrates its DNS record, and
   verifies origin TLS. Fleet subdomains do not get a `www` alias.
3. **Per-user DNS zone** — deploy resolution selects the user's
   `cloudflareZoneId` when configured and otherwise preserves the shared
   `CF_ZONE_ID`. The shared `CF_API_TOKEN` must be authorized on foreign zones
   before those domains are deployed (dashboard change).

## Review findings

The implementation was reviewed end-to-end (both repos, template + pilot in
lockstep, all tests green). One real bug was found on the rollout path and fixed:

- **Resolved: `secrets:encrypt` corrupted real multi-line PEMs.** The `_FILE`
  fallback (and a `CERTIFICATE_PEM` env var holding real newlines) read the PEM
  raw; `toYaml` then serialized any multi-line string as a YAML block scalar
  (`certificatePem: |`). The decrypt script's line-based `parseFlatYaml` reads
  the value as the literal string `"|"` — for **both** keys, so the
  pair-completeness check passes and the deploy exports `CERTIFICATE_PEM=|` to
  kamal-proxy. TLS would break at cutover with no error anywhere upstream
  (verified empirically against the real `toYaml`/parser pair). Before the fix,
  the only working input path was a staging file with `\n`-escaped one-liners —
  the format `cert:bootstrap`'s `secrets.yaml` snippet emitted.
- **Fix:** `secrets-encrypt.ts` normalizes resolved cert/key values by escaping
  real newlines to `\n`. Follow-up validation with the issued production cert
  found that js-yaml still folds a long normalized scalar as `>-`; the original
  line parser then exported `>-` instead of the PEM. The deploy script now uses
  Bun's YAML parser, so quoted, literal, and folded scalars all decode correctly.
  The round-trip test uses realistic long PEM lines through
  `CERTIFICATE_PEM_FILE` / `PRIVATE_KEY_PEM_FILE` → encrypt → decrypt script →
  `GITHUB_ENV` heredocs and asserts the original PEM contents.

A second rollout regression was found during follow-up: the earlier custom-domain
implementation's `WWW_DOMAIN` wiring had been lost during a broad pilot tooling
rollback. `www.rizom.ai` currently serves production traffic, so the cutover must
keep it routed. The resolver, DNS step, Kamal proxy env, origin verification, and
live pilot config now restore that optional alias with coverage.

Everything else held up under review: the preview-domain derivation matches
exactly against `<handle> + pilot.domainSuffix` from the registry (correctly
handling the handle-matches-zone-name trap), the decrypt export rejects partial
pairs and masks multi-line values with `%0A` escaping, the `CF_ZONE_ID`
fallback resolves after the varlock env load so the shared zone is always
populated, and the pilot copy picked up the missing `ATPROTO_APP_PASSWORD`
export (task #38's deploy-side half).

## Non-goals

- No Bitwarden push automation (`--push-to bitwarden`); the age flow replaces
  it. The legacy `--push-to gh` path stays untouched.
- No shared-cert rotation machinery; the shared wildcard cert is valid to 2041
  and rotation stays a manual Bitwarden update.

## Rollout

1. Release the long-PEM parser follow-up in `@rizom/ops`, bump the pilot
   dependency, and regenerate the encrypted production payload.
2. rizom.ai cutover: `cert:bootstrap . --handle <prod-user>` (already done in
   effect — the issued apex cert can be encrypted directly),
   `secrets:encrypt . <prod-user>` with the `_FILE` fallbacks, commit,
   set `domainOverride: rizom.ai`, deploy.
3. yeehaa.io later: gap 3, token scope, then the same three commands.

## Verification

- Unit: preview/`www` alias cases (fleet, apex, foreign,
  handle-matches-TLD trap); decrypt export present/absent/partial-pair
  rejection; and a real multi-line
  PEM `_FILE` encrypt/decrypt round trip through `GITHUB_ENV`.
- Fleet regression: a member without cert overrides deploys with the shared
  wildcard cert unchanged.
- Cutover: `openssl s_client` against the server with SNI `rizom.ai` and
  `www.rizom.ai` shows the expected SAN coverage; apex, `www`, preview,
  `new.rizom.ai`, and ordinary `<h>-preview` fleet hosts still serve during the
  rollback window. After the production soak, remove the `new` pilot entry and
  its DNS record.
