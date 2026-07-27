# @rizom/site-smoke-canary

## 0.2.0-alpha.232

### Patch Changes

- [`8ec2bd7`](https://github.com/rizom-ai/brains/commit/8ec2bd745e2aa25c61f48216e7552c48e6466361) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reject published site/theme manifests that ship unresolved `workspace:` specifiers in any dependency field. The release-time peer-metadata check now guards against the alpha.144/145 packument failure mode (a `workspace:*` range surviving into the registry manifest) in addition to the `@rizom/brain` peer range and authoring-only field checks.

## 0.2.0-alpha.231

### Patch Changes

- [#71](https://github.com/rizom-ai/brains/pull/71) [`c7547f5`](https://github.com/rizom-ai/brains/commit/c7547f5dfa2756cfded40800b7fdb76a8375ef4f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release site and theme packages independently and publish standard `@rizom/brain` peer compatibility metadata in both npm packuments and tarballs.

## 0.2.0-alpha.230

### Patch Changes

- [`fbe6803`](https://github.com/rizom-ai/brains/commit/fbe68039507bdd581391ba59aa02f2f25abd7408) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare the preact JSX runtime via a `/** @jsxImportSource preact */` pragma in each shipped `.tsx`. The package ships raw `src` that the brain runtime transpiles live; without the pragma the runtime defaulted to `react/jsx-runtime` and the site failed to boot (`Cannot find module 'react/jsx-runtime'`). The pragma makes the external package self-describing about its JSX runtime instead of depending on the consumer's tsconfig.

## 0.2.0-alpha.229

### Patch Changes

- [`c058ab7`](https://github.com/rizom-ai/brains/commit/c058ab7ac4238461d79b87b8ef085dac22f7dc36) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rebuild the smoke-canary as a minimal, content-independent site. Previously it re-exported the professional layout, so its homepage required a curated `site-info` (with a cta) and rendered empty on a bare instance. It now defines its own static homepage template — a single `/` route with no datasource — that renders the package's build metadata, proving the hosted site+theme package loaded, built, deployed, and styled without depending on any brain content. Built against the public `@rizom/brain/{site,plugins,templates}` surface.

## 0.2.0-alpha.228

## 0.2.0-alpha.227

## 0.2.0-alpha.226

## 0.2.0-alpha.225

## 0.2.0-alpha.224

## 0.2.0-alpha.223

## 0.2.0-alpha.222

## 0.2.0-alpha.221

## 0.2.0-alpha.220

## 0.2.0-alpha.219

## 0.2.0-alpha.218

### Minor Changes

- [#66](https://github.com/rizom-ai/brains/pull/66) [`b840046`](https://github.com/rizom-ai/brains/commit/b8400466c02fa2c4b8b671a0467bea7a9577eab1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a public Rover site/theme pair for the hosted external-package canary. The site uses only the documented `@rizom/brain/site` contract and ships a deterministic well-known marker; the signal theme composes the default theme with a high-contrast, light/dark instrument-panel visual system.

  Preserve the real personal/professional site plugin instances returned by `@rizom/brain/site` so externally authored packages retain required runtime lifecycle methods. Align the Chat SDK and all adapters on 4.34 to keep their private nominal types compatible during the release checks.
