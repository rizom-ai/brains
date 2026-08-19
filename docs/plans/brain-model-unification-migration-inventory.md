# Brain Model Unification Migration Inventory

Last reviewed: 2026-08-19

This inventory records the configuration sources that must cross from the four-bundle
canonical contract to `capability-bundles-v1`. It contains no secrets and does not modify
or deploy either source repository.

## Safety contract

The crossover is fail-closed rather than dual-format:

- new canonical `brain.yaml` files declare
  `bundleContract: capability-bundles-v1`;
- the unified runtime rejects a missing or different contract before bundle resolution;
- the new `@rizom/ops` desired-state loader requires the same contract and accepts all
  nine active bundle IDs;
- the prior runtime rejects the new field through strict YAML validation;
- therefore an old image/new config or new image/old config pairing fails instead of
  silently resolving overlapping bundle names with different meanings.

Standalone canonical YAML migration requires an explicit recipe. Hosted desired-state
migration requires a reviewed manifest containing both the expected source bundles and
exact target bundles for the pilot and every cohort with an explicit selection. Source
drift invalidates the review.

## Rover pilot desired state

Inventory source: private `rizom-ai/rover-pilot` `origin/main` at `6350a99`.

- Operator package: `@rizom/ops@0.2.0-alpha.309`.
- Fleet default runtime: `@rizom/brain@0.2.0-alpha.279`.
- Site canary runtime: `@rizom/brain@0.2.0-alpha.311`.
- Instances: 19.
- Default-selection instances: 16.
- Explicit site-selection instances: 3 (`docs.rizom.ai`, `rizom.ai`, and
  `smoke.rizom.ai`).

### Reviewed bundle mappings

| Scope                                | Count | Source                   | Target                                                             | Rationale                                                                                                                                          |
| ------------------------------------ | ----: | ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot default and inheriting cohorts |    16 | `core`                   | `core, media, web, chat`                                           | Existing generated configs use passkey setup, email delivery, notifications, browser chat, and Git-backed personal content; they are not headless. |
| `site-canary`                        |     1 | `core, site, publishing` | `core, media, automation, web, chat, site, publishing, federation` | Preserve the existing professional site surface while making split capabilities explicit.                                                          |
| `sites-primary`                      |     1 | `core, site, publishing` | `core, media, automation, web, chat, site, publishing, federation` | `rizom.ai` publishes the ATProto brain card and requires federation explicitly.                                                                    |
| `sites`                              |     1 | `core, site, publishing` | `core, media, automation, web, chat, site, publishing, federation` | Preserve the documentation site, setup delivery, and publishing-backed content types.                                                              |

The required review manifest is:

```yaml
bundleContract: capability-bundles-v1
pilot:
  sourceBundles: [core]
  targetBundles: [core, media, web, chat]
cohorts:
  site-canary:
    sourceBundles: [core, site, publishing]
    targetBundles:
      [core, media, automation, web, chat, site, publishing, federation]
  sites-primary:
    sourceBundles: [core, site, publishing]
    targetBundles:
      [core, media, automation, web, chat, site, publishing, federation]
  sites:
    sourceBundles: [core, site, publishing]
    targetBundles:
      [core, media, automation, web, chat, site, publishing, federation]
```

A source-tree staging rehearsal produced a separate secret-free copy with 19 generated
`brain.yaml` files, one contract value, 16 personal selections, and three professional
selections. First- and second-pass dry-run reconciliation both reported zero changed
files.

### Hosted site pins

| Instance   | Site package               | Site version      | Theme                   | Theme version     |
| ---------- | -------------------------- | ----------------- | ----------------------- | ----------------- |
| `docs`     | `@rizom/site-docs`         | `0.2.0-alpha.237` | `@rizom/theme-rizom-ai` | `0.2.0-alpha.234` |
| `rizom-ai` | `@rizom/site-rizom-ai`     | `0.2.0-alpha.238` | `@rizom/theme-rizom-ai` | `0.2.0-alpha.234` |
| `smoke`    | `@rizom/site-smoke-canary` | `0.2.0-alpha.235` | `@rizom/theme-signal`   | `0.2.0-alpha.233` |

The crossover command continues to require a complete identity-matched site-pin manifest.

### Reviewed product decision

`newsletter` remains disabled on `rizom-ai` for this crossover. The instance currently
inherits `remove: [newsletter]` while also adding and configuring `newsletter`; removal
wins in both contracts. The migration intentionally preserves that effective state rather
than enabling a product surface as a side effect of the taxonomy change.

## yeehaa.io standalone instance

Inventory source: `rizom-ai/yeehaa-io` `origin/main` at `795236e`.

- Runtime dependency: exact `@rizom/brain@0.2.0-alpha.278`.
- Site SDK dependency: exact `@rizom/site@0.2.0-alpha.233`.
- Source selection: `core, site, publishing`.
- Reviewed target recipe: `professional`.
- Target selection:
  `core, media, automation, web, chat, site, publishing, federation`.
- Preserved explicit addition: `obsidian-vault`.
- Preserved site: `@brains/site-default` with `@rizom/theme-default`.
- Preserved runtime config includes ATProto, MCP, topics, auth/email, CMS,
  directory sync, Discord chat, social media, newsletter, and analytics.

The deterministic preview command is:

```bash
brain config migrate --recipe professional
```

A source-tree preview retained the domain, profile kind, site/theme, addition, permissions,
all 11 plugin configuration blocks, and secret references while adding the bundle contract
and replacing only the bundle selection. The command remains preview-only; the reviewed
output and exact unified runtime pin must be committed together in `yeehaa-io`.

## Prepared codebase branches

The following local, unpushed branches contain review inputs only. Active desired state and
runtime dependencies remain unchanged until matching unified artifacts exist:

- `rover-pilot` `work/brain-model-unification` at `4e5100f` stores the reviewed bundle
  mapping, hosted-site pins, and the disabled-newsletter decision. Staging from that branch
  produced 19 configs with the expected 16/3 posture split and zero first- or second-pass
  reconciliation drift.
- `yeehaa-io` `work/brain-model-unification` at `5d424b3` stores the deterministic
  professional target YAML and credential-free pull-request CI. It matches a fresh
  migration preview exactly, parses as `capability-bundles-v1` with all 11 plugin blocks,
  and passes frozen install, typecheck, migration-preservation, and workflow-safety checks.

Neither branch changes an active `brain.yaml`, runtime version, operator package, lockfile,
workflow, or deployment input. Those files must cross together after exact published
versions and image digests are available.

## Crossover sequence

1. Land and publish the runtime and ops artifacts containing the contract guard and offline
   migration tools.
2. Stage the pilot from a freshly fetched tip using the reviewed bundle and site-pin
   manifests; require zero second-pass drift.
3. Commit the standalone `yeehaa.io` preview with one exact unified runtime pin.
4. In the authorized maintenance window, deploy each config/image pair together. Never
   place a `capability-bundles-v1` config on an old image or an unmarked config on the new
   image.
5. Roll back config revision and image digest together on any failed gate.
