# @brains/ops

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
