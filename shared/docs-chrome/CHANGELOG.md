# @brains/docs-chrome

## 0.2.0-alpha.622

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.622
  - @brains/utils@0.2.0-alpha.622

## 0.2.0-alpha.621

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.621
  - @brains/utils@0.2.0-alpha.621

## 0.2.0-alpha.620

### Patch Changes

- [#796](https://github.com/rizom-ai/brains/pull/796) [`90483cf`](https://github.com/rizom-ai/brains/commit/90483cf788c5b1951879b77ef53db61bf1928c75) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Docs and guide pages no longer carry the Brains documentation site's branding on every brain. The docs index opened on "Handbook · Brains docs" and "Build, run, and publish brains.", its head described every brain's docs as "Brains documentation", and every docs and guide page drew a fixed "brains docs" header with Guides, Roadmap, GitHub and "Get Brains" links and a rizom.ai footer — over a site's own header, on sites whose layout brings one. Now the docs index opens on plain "Documentation" and the pages draw no header or footer brand of their own.

  A brain whose docs pages are the whole site sets them in its plugin config: `plugins.docs.hero` (`label`, `title`, `accent`, `lead`), and `plugins.docs.chrome` and `plugins.guides.chrome` (`brand` with an optional `wordmark`, header `links` with an optional `area` marked current on that area's pages, a `cta`, and a `footer` with its own `brand` and `links`). The Brains documentation site keeps its look by setting these to its current copy.

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.620
  - @brains/utils@0.2.0-alpha.620

## 0.2.0-alpha.619

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.619

## 0.2.0-alpha.618

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.618

## 0.2.0-alpha.617

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.617

## 0.2.0-alpha.616

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.616

## 0.2.0-alpha.615

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.615

## 0.2.0-alpha.614

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.614

## 0.2.0-alpha.613

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.613

## 0.2.0-alpha.612

### Patch Changes

- [#777](https://github.com/rizom-ai/brains/pull/777) [`484f1ae`](https://github.com/rizom-ai/brains/commit/484f1ae9d67540fc2b494fb073fe42c9234a17f0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The docs footer's theme toggle switches between light and dark again, and its label names the theme it switches to. Header and footer links take their own muted colors again, with the current page emphasized.
- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.612
