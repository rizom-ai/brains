# @brains/ops

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
