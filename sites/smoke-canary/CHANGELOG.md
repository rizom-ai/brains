# @rizom/site-smoke-canary

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
