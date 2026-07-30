# @rizom/theme-signal

## 0.2.0-alpha.234

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. The SDK and theme packages — `@rizom/site`, `@rizom/site-sections`, `@rizom/theme-default`, `@rizom/theme-signal`, `@rizom/theme-rizom-ai` — remain **Apache-2.0**; the Rizom-owned site packages (`@rizom/site-docs`, `@rizom/site-rizom`, `@rizom/site-rizom-ai`, `@rizom/site-rizom-foundation`, `@rizom/site-rizom-work`) are now **AGPL-3.0-only**. Site packages built against the Apache-licensed interfaces are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

- Updated dependencies [[`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5)]:
  - @rizom/theme-default@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- [`76a29f9`](https://github.com/rizom-ai/brains/commit/76a29f93e5b53044d0b59fecf36831fda8aa6a24) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish correct registry metadata for site and theme packages. `postpack: publish-manifest restore` put the authoring manifest back mid-publish, and npm derives the registry packument from the on-disk manifest _after_ postpack — so every release shipped a correct tarball alongside a packument that retained `publishPeerDependencies` and dropped the real `@rizom/brain` peer range (0.2.0-alpha.231 and .232 are affected; the same mechanism caused the earlier `workspace:*` packuments). Restoring is now done once by the release wrapper after the whole publish completes, and a drift-guard test fails if any publishable package reintroduces a mid-publish restore.

- Updated dependencies [[`76a29f9`](https://github.com/rizom-ai/brains/commit/76a29f93e5b53044d0b59fecf36831fda8aa6a24)]:
  - @rizom/theme-default@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- [`8ec2bd7`](https://github.com/rizom-ai/brains/commit/8ec2bd745e2aa25c61f48216e7552c48e6466361) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reject published site/theme manifests that ship unresolved `workspace:` specifiers in any dependency field. The release-time peer-metadata check now guards against the alpha.144/145 packument failure mode (a `workspace:*` range surviving into the registry manifest) in addition to the `@rizom/brain` peer range and authoring-only field checks.

- Updated dependencies [[`8ec2bd7`](https://github.com/rizom-ai/brains/commit/8ec2bd745e2aa25c61f48216e7552c48e6466361)]:
  - @rizom/theme-default@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- [#71](https://github.com/rizom-ai/brains/pull/71) [`c7547f5`](https://github.com/rizom-ai/brains/commit/c7547f5dfa2756cfded40800b7fdb76a8375ef4f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release site and theme packages independently and publish standard `@rizom/brain` peer compatibility metadata in both npm packuments and tarballs.

- Updated dependencies [[`c7547f5`](https://github.com/rizom-ai/brains/commit/c7547f5dfa2756cfded40800b7fdb76a8375ef4f)]:
  - @rizom/theme-default@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- [#67](https://github.com/rizom-ai/brains/pull/67) [`9b88099`](https://github.com/rizom-ai/brains/commit/9b88099767282df468a4f912e7e85b1a98e8284b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Pin the published `@rizom/theme-default` dependency to a concrete version in the source manifest. npm creates registry dependency metadata before `prepack`, so the workspace protocol in the initial release produced an uninstallable packument even though its tarball manifest was valid.

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.219

## 0.2.0-alpha.218

### Minor Changes

- [#66](https://github.com/rizom-ai/brains/pull/66) [`b840046`](https://github.com/rizom-ai/brains/commit/b8400466c02fa2c4b8b671a0467bea7a9577eab1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a public Rover site/theme pair for the hosted external-package canary. The site uses only the documented `@rizom/brain/site` contract and ships a deterministic well-known marker; the signal theme composes the default theme with a high-contrast, light/dark instrument-panel visual system.

  Preserve the real personal/professional site plugin instances returned by `@rizom/brain/site` so externally authored packages retain required runtime lifecycle methods. Align the Chat SDK and all adapters on 4.34 to keep their private nominal types compatible during the release checks.

### Patch Changes

- Updated dependencies []:
  - @rizom/theme-default@0.2.0-alpha.218
