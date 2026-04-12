# @brains/ops

## 1.0.1-alpha.17

### Patch Changes

- [`9040ba0`](https://github.com/rizom-ai/brains/commit/9040ba04d1c0604314d6138bb292231347387464) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the published `@rizom/ops` package so the installed CLI can scaffold deploy helpers without monorepo-only imports, and the `@rizom/ops/deploy` export resolves correctly from npm.

## 0.2.0-alpha.0

### Minor Changes

- [`e5320f3`](https://github.com/rizom-ai/brains/commit/e5320f3fc5db5147b31c1748af9842ada8c5ae8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `@brains/ops` publishable and update the `brains-ops init` scaffold to install and invoke the published package from `rover-pilot` workflows instead of checking out the `brains` monorepo at runtime.
