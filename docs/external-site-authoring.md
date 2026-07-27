# External Site and Theme Authoring

Site and theme packages are ordinary public npm packages. They may live in any
repository and use only the published `@rizom/brain` API; hosted resolution does
not depend on the Brains monorepo or the `@rizom` scope.

The reference implementation is
[`rizom-ai/site-smoke-canary`](https://github.com/rizom-ai/site-smoke-canary).
It is intentionally released from a standalone repository with plain
`npm publish`, hand-authored peer metadata, and no private `@brains/*` tooling.

## Required package metadata

A deployable site must publish a manifest shaped like this:

```json
{
  "name": "@scope/my-site",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "files": ["src"],
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.233 <0.3.0",
    "preact": "^10.27.2"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0-alpha.233",
    "preact": "^10.27.2",
    "typescript": "^7.0.2"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

The published npm packument and tarball must both:

- contain a standard `peerDependencies["@rizom/brain"]` range;
- contain no `publishPeerDependencies` or `publishExports` fields;
- contain no `workspace:` dependency ranges;
- import only public `@rizom/brain` entry points, never private `@brains/*`
  packages.

External themes follow the same metadata rules and publish their brain range in
`peerDependencies`. A site's version and an external theme's version are
independent; do not infer one from the other.

## Compatibility rule

While `@rizom/brain` is on the `0.2.0-alpha.*` line, declare compatibility as
`>=<first-compatible> <0.3.0`. A release that first uses a newer hosting
contract must advance the lower bound. A change to `@rizom/brain/site` or the
runtime site loader that breaks existing packages must be called out in the
brain release notes.

When the external authoring contract graduates to stable semver, breaking host
changes advance the range ceiling in the usual way. A broad range is a promise
that the package has been tested against that hosting contract, not decoration.

## Site export contract

Export a `SitePackage` as the package's default export. Use the curated public
subpaths for routes, plugins, templates, and schemas:

```ts
import { z } from "@rizom/brain";
import type { SitePackage } from "@rizom/brain/site";
import { ServicePlugin } from "@rizom/brain/plugins";
import { createTemplate } from "@rizom/brain/templates";
```

The reference canary keeps its shipped TypeScript source and lets the Brain
runtime transpile it. Packages may instead export built JavaScript and type
declarations, provided the npm `exports` map points only at files included in
the tarball.

## Verify and publish

A standalone package does not need Changesets or Brains build tooling:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
npm pack --dry-run
npm publish --access public
```

Before publishing, inspect the dry-run file list and packed `package.json`.
After publishing, verify standard registry metadata directly:

```bash
npm view @scope/my-site@1.0.0 peerDependencies --json
npm view @scope/my-site@1.0.0 publishPeerDependencies
```

The second command must return no field. Keep hosted production configuration
on an exact package version. Floating `latest` policy is reserved for a
lock-backed canary; until that resolver is deployed, the Smoke instance also
pins each standalone canary version exactly.
