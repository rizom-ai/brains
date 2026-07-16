# Plan: Custom-domain TLS from rover-pilot

## Status

Not started. Enabler for the rizom.ai cutover ([rizom-consolidation.md](./rizom-consolidation.md))
and for hosting brains at foreign zones (yeehaa.io) from the pilot.

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

## Gaps (all small, test-first, template + pilot in lockstep)

1. **Decrypt-side export** — `decrypt-user-secrets.ts` explicitly skips TLS
   material today. Export `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` when present in
   the user's decrypted secrets (~4 lines). Syncing the pilot copy also picks
   up the `ATPROTO_APP_PASSWORD` export it is missing (open task #38).
2. **Preview-domain fallback** — `resolve-user-config.ts` throws on domains
   that are not `<handle>.<zone>`-shaped. Add `resolvePreviewDomain`: keep
   `<handle>-preview.<zone>` for fleet domains, fall back to
   `preview.<domain>` for custom/apex domains (wildcard-SAN covered; the
   webserver's preview-host regex already accepts it). Test written.
3. **Per-user DNS zone** — `update-dns.ts` always writes to the shared
   `CF_ZONE_ID`. Use the user's `cloudflareZoneId` (already in the registry
   schema) when set. Only needed for foreign zones; requires the shared
   `CF_API_TOKEN` to be authorized on those zones (dashboard change).

## Non-goals

- No Bitwarden push automation (`--push-to bitwarden`); the age flow replaces
  it. The legacy `--push-to gh` path stays untouched.
- No shared-cert rotation machinery; the shared wildcard cert is valid to 2041
  and rotation stays a manual Bitwarden update.

## Rollout

1. Land gaps 1–2 (release train), sync pilot scripts, bump pilot `@rizom/ops`.
2. rizom.ai cutover: `cert:bootstrap . --handle <prod-user>` (already done in
   effect — the issued apex cert can be encrypted directly),
   `secrets:encrypt . <prod-user>` with the `_FILE` fallbacks, commit,
   set `domainOverride: rizom.ai`, deploy.
3. yeehaa.io later: gap 3, token scope, then the same three commands.

## Verification

- Unit: preview-domain cases (fleet, apex, foreign, handle-matches-TLD trap);
  decrypt export present/absent; secrets:encrypt round-trip already covered.
- Fleet regression: a member without cert overrides deploys with the shared
  wildcard cert unchanged.
- Cutover: `openssl s_client` against the server with SNI `rizom.ai` shows the
  apex SAN; `new.rizom.ai` and `<h>-preview` hosts still serve.
