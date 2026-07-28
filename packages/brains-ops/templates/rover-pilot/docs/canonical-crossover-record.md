# Canonical Crossover Approval Record

> Draft evidence record only. Completing this file does not authorize a merge, publish, reconcile, or deployment.

Do not include secret values, private keys, access tokens, or decrypted user configuration.

## Authorization and freeze

- Operator:
- Approval reference:
- Approved window:
- Freeze start:
- Build workflow disabled and idle:
- Reconcile workflow disabled and idle:
- Deploy workflow disabled and idle:

## Reviewed inputs

- `brains` crossover commit:
- Private-pilot source commit used for staging:
- Canonical review commit:
- Secret-free review diff SHA-256:
- Identity-review evidence SHA-256:
- Reviewed hosted-site pin manifest SHA-256:
- Source and review worktrees clean:

## Hosted site and theme pins

List every hosted site. External site and theme package versions must be exact and must
match the staged user desired state; do not infer them from the brain or from each other.

| Handle | Site package | Exact site version | Theme package | Exact theme version | Package/image evidence |
| ------ | ------------ | ------------------ | ------------- | ------------------- | ---------------------- |
|        |              |                    |               |                     |                        |

## Forward artifact pins

| Artifact               | Exact version | Registry integrity or digest | Verified installable |
| ---------------------- | ------------- | ---------------------------- | -------------------- |
| `@rizom/brain`         |               |                              |                      |
| `@rizom/ops`           |               |                              |                      |
| private-pilot lockfile | n/a           |                              |                      |

Record every image. Tags alone are not immutable evidence.

| Cohort/handle | Config commit | Image repository | Image tag | Image digest |
| ------------- | ------------- | ---------------- | --------- | ------------ |
|               |               |                  |           |              |

## Rollback pair

- Prior private-pilot commit:
- Prior `@rizom/ops` version and registry integrity:

| Cohort/handle | Prior config commit | Prior image repository | Prior image tag | Prior image digest |
| ------------- | ------------------- | ---------------------- | --------------- | ------------------ |
|               |                     |                        |                 |                    |

## Identity review

- Repository and image names unchanged or explicitly approved:
- GitHub organization and content repository identities unchanged:
- Server, domain, Cloudflare zone, and ATProto identities unchanged:
- Secret selector names and encrypted secret artifacts unchanged:
- Per-user runtime-version and site-package tag inputs reviewed:
- No plaintext source secrets copied into the review artifact:
- No removed model, preset, or old-format schema discriminator remains:
- Every external hosted site and theme package has an exact reviewed pin:

## Offline convergence

Command:

```sh
bunx brains-ops reconcile-all <canonical-review-copy> --dry-run
```

- First-pass changed files:
- Second-pass changed files (must be zero):
- Review copy unchanged:
- External content-repository access blocked:

## Pre-window validation

- Package tests, typecheck, lint, build, and packed-consumer startup:
- Architecture and dependency boundaries:
- Environment-schema and workspace checks:
- Crossover migration and comment preservation:
- Canary-first order and health checks reviewed:
- Paired rollback reviewed:

## Execution record

Complete only inside the explicitly approved maintenance window.

- Unified packages published and verified:
- Canonical desired state committed while automation remained frozen:
- Image digest set matched this record:
- First reconcile reviewed:
- Per-instance health, MCP authorization, identity, content, and site checks:
- Second reconcile produced zero drift and no deploy work:
- Freeze lifted:
- One-week soak start:
