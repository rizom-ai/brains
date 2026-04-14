# @brains/ops

## 0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- [`db41123`](https://github.com/rizom-ai/brains/commit/db411235976b9896cb0b77bd09f218714acefa3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align preview domain routing across deploy paths.
  - Derive preview URLs consistently from the configured brain domain
  - Support both `preview.<domain>` and `*-preview.*` preview host shapes in deploy Caddy templates
  - Add regression coverage for preview URL derivation and preview host routing

## 0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- [`44b03e3`](https://github.com/rizom-ai/brains/commit/44b03e3e560fb17b97b9cf7178c0e2084b9d818e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore `brains-ops secrets:push <repo>` as a shared GitHub Actions secret sync command so operators can push repo-wide pilot secrets like `GIT_SYNC_TOKEN` and `MCP_AUTH_TOKEN` from local env files without hand-written `gh secret set` calls.

## 0.2.0-alpha.13

### Patch Changes

- [`5798b3b`](https://github.com/rizom-ai/brains/commit/5798b3bc70be7475a4fad26c4dab0323d602077b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace rover-pilot's per-user GitHub secret push flow with age-encrypted checked-in user secret files, add `brains-ops age-key:bootstrap` and `brains-ops secrets:encrypt`, and update the published deploy scaffold to decrypt per-user overrides while falling back to shared pilot secret selectors.

## 0.2.0-alpha.12

### Patch Changes

- [`30cce87`](https://github.com/rizom-ai/brains/commit/30cce876daba182fdf1063506d4662692873d5fe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Seed a per-user `anchor-profile` into new Rover content repos and sync generated content seeds through the pilot deploy workflow.

## 0.2.0-alpha.11

### Patch Changes

- [`cf353fd`](https://github.com/rizom-ai/brains/commit/cf353fd41279a1ab59ab5ecd07dee9b1bcfd98dc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore an explicit Caddy redirect from `/` to `/.well-known/agent-card.json` so core-only deployments never return a bare 502 on the root path.

## 0.2.0-alpha.10

### Patch Changes

- [`afd89a0`](https://github.com/rizom-ai/brains/commit/afd89a011595edccab23ed761dda92517ee9d806) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the generated rover-pilot deploy workflow so its final generated-config commit can push successfully from GitHub Actions checkout state.

## 0.2.0-alpha.9

### Patch Changes

- [`676b2c1`](https://github.com/rizom-ai/brains/commit/676b2c15d4a696b400783ad5c46325c7990d9154) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix deployed smoke routing so the container healthcheck goes through Caddy, core-only root requests no longer fail when no site webserver is running, and GET `/a2a` returns a helpful non-404 response.

## 0.2.0-alpha.8

### Patch Changes

- [`ddf17de`](https://github.com/rizom-ai/brains/commit/ddf17def0015d19da2647ca42417c93b7c80fe4e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Sync the shared Kamal deploy template into both published packages so deployed scaffolds use the same package-local runtime copy after install, and align the rover-pilot scaffold with preview host routing.

## 0.2.0-alpha.7

### Patch Changes

- [`b7eb35c`](https://github.com/rizom-ai/brains/commit/b7eb35cee36e1bb1742dcf99af0510f490e5a5cb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix published deploy scaffolds to use package-local deploy templates and sync shared Docker/Caddy sources into both published packages at build time.

## 0.2.0-alpha.6

### Patch Changes

- [`a9c2fbd`](https://github.com/rizom-ai/brains/commit/a9c2fbd4baba6a45a08580177ca8d62fe7875179) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `brains-ops render` fill rover-pilot status columns from built-in live probes for DNS, `/health`, and unauthenticated `/mcp` reachability.

## 0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- [`6067211`](https://github.com/rizom-ai/brains/commit/60672115d53b6c53b0ed04b2517f2252a80c9d27) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add private `brains-ops ssh-key:bootstrap` and `brains-ops cert:bootstrap` commands for rover-pilot operator bootstrap, and share the Origin CA helper boundary used by `@rizom/brain`.

## 0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- [`335dd77`](https://github.com/rizom-ai/brains/commit/335dd770538c84f289c96ea4cf33f218b214bcb4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `brains-ops secrets:push <repo> <handle>` for pilot GitHub secret delivery, reusing the CLI-style local env and file-backed secret resolution contract.

## 0.2.0-alpha.1

### Patch Changes

- [`8e39eb7`](https://github.com/rizom-ai/brains/commit/8e39eb78a6927246326262a5ebf1628f8b14e546) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Republish the fixed public package set on the corrected 0.2.x alpha line so installed `@rizom/ops` and `@rizom/ops/deploy` match the repaired artifact.

## 1.0.1-alpha.17

### Patch Changes

- [`9040ba0`](https://github.com/rizom-ai/brains/commit/9040ba04d1c0604314d6138bb292231347387464) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the published `@rizom/ops` package so the installed CLI can scaffold deploy helpers without monorepo-only imports, and the `@rizom/ops/deploy` export resolves correctly from npm.

## 0.2.0-alpha.0

### Minor Changes

- [`e5320f3`](https://github.com/rizom-ai/brains/commit/e5320f3fc5db5147b31c1748af9842ada8c5ae8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `@brains/ops` publishable and update the `brains-ops init` scaffold to install and invoke the published package from `rover-pilot` workflows instead of checking out the `brains` monorepo at runtime.
