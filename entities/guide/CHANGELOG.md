# @brains/guide

## 0.2.0-alpha.636

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.636
  - @brains/plugins@0.2.0-alpha.636
  - @brains/docs-chrome@0.2.0-alpha.636
  - @brains/utils@0.2.0-alpha.636

## 0.2.0-alpha.635

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.635
  - @brains/ui-library@0.2.0-alpha.635
  - @brains/utils@0.2.0-alpha.635
  - @brains/plugins@0.2.0-alpha.635

## 0.2.0-alpha.634

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.634
  - @brains/ui-library@0.2.0-alpha.634
  - @brains/utils@0.2.0-alpha.634
  - @brains/plugins@0.2.0-alpha.634

## 0.2.0-alpha.633

### Patch Changes

- Updated dependencies [[`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891)]:
  - @brains/utils@0.2.0-alpha.633
  - @brains/ui-library@0.2.0-alpha.633
  - @brains/plugins@0.2.0-alpha.633
  - @brains/docs-chrome@0.2.0-alpha.633

## 0.2.0-alpha.632

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.632
  - @brains/ui-library@0.2.0-alpha.632
  - @brains/utils@0.2.0-alpha.632
  - @brains/plugins@0.2.0-alpha.632

## 0.2.0-alpha.631

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.631
  - @brains/ui-library@0.2.0-alpha.631
  - @brains/utils@0.2.0-alpha.631
  - @brains/plugins@0.2.0-alpha.631

## 0.2.0-alpha.630

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.630
  - @brains/ui-library@0.2.0-alpha.630
  - @brains/utils@0.2.0-alpha.630
  - @brains/plugins@0.2.0-alpha.630
  - @brains/templates@0.2.0-alpha.630

## 0.2.0-alpha.629

### Patch Changes

- [#811](https://github.com/rizom-ai/brains/pull/811) [`b5ff631`](https://github.com/rizom-ai/brains/commit/b5ff6316e9d6de8fc9b8177100f9cc373ae779a8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A docs page lists each section's guides as short rows: the persona, and under it the guide's new optional `summary` frontmatter field, a few words on what the reader brings. The longer `for` sentence stays in the guide's own opening. A section with several guides asks "Which one are you?"; a section with one guide offers it as "Walk it through". The rows rule off like the reference docs below them.
- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.629
  - @brains/ui-library@0.2.0-alpha.629
  - @brains/utils@0.2.0-alpha.629
  - @brains/plugins@0.2.0-alpha.629
  - @brains/templates@0.2.0-alpha.629

## 0.2.0-alpha.628

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.628
  - @brains/ui-library@0.2.0-alpha.628
  - @brains/utils@0.2.0-alpha.628
  - @brains/plugins@0.2.0-alpha.628
  - @brains/templates@0.2.0-alpha.628

## 0.2.0-alpha.627

### Patch Changes

- [#807](https://github.com/rizom-ai/brains/pull/807) [`77e79ed`](https://github.com/rizom-ai/brains/commit/77e79ed3715cf86e7a861368faa5a7c0bd30a2d3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A docs page lists each guide with the section its content names, also when the guide was imported before guides had a `section` field. Such a guide's stored metadata lacks the field, and an unchanged file is not imported again, so the guide was left out of its section.
- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.627
  - @brains/ui-library@0.2.0-alpha.627
  - @brains/docs-chrome@0.2.0-alpha.627
  - @brains/utils@0.2.0-alpha.627
  - @brains/templates@0.2.0-alpha.627

## 0.2.0-alpha.626

### Patch Changes

- [#802](https://github.com/rizom-ai/brains/pull/802) [`37ecfde`](https://github.com/rizom-ai/brains/commit/37ecfde35b89a5f13e522774d93a9ae27ec399cf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A guide can name the docs section it is listed with: `section: Use a brain` in its frontmatter, matching a doc section by name, so a docs page can show each section's guides beside its docs. Absent, it reads as null and the guide is listed on its own. The Brains documentation guides set it: the writer, researcher, consultant and team guides with "Use a brain", the self-hosting guide with "Run a brain".

- [#802](https://github.com/rizom-ai/brains/pull/802) [`ea1cac9`](https://github.com/rizom-ai/brains/commit/ea1cac9c54c55d5448a4b329528d78d131de6261) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The guides plugin adds a `guides:guide-sections` template and its `guides:sections` data source: each docs section as a column of the guides listed with it and its reference docs, the first four shown and the rest behind a disclosure. A docs site composes it under its own section introductions, such as a homepage that opens on using, running and extending a brain. The docs landing page is left out, since the sections introduce it.
- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.626
  - @brains/ui-library@0.2.0-alpha.626
  - @brains/docs-chrome@0.2.0-alpha.626
  - @brains/utils@0.2.0-alpha.626
  - @brains/templates@0.2.0-alpha.626

## 0.2.0-alpha.625

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.625
  - @brains/ui-library@0.2.0-alpha.625
  - @brains/utils@0.2.0-alpha.625
  - @brains/plugins@0.2.0-alpha.625
  - @brains/templates@0.2.0-alpha.625

## 0.2.0-alpha.624

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.624
  - @brains/ui-library@0.2.0-alpha.624
  - @brains/utils@0.2.0-alpha.624
  - @brains/plugins@0.2.0-alpha.624
  - @brains/templates@0.2.0-alpha.624

## 0.2.0-alpha.623

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.623
  - @brains/ui-library@0.2.0-alpha.623
  - @brains/utils@0.2.0-alpha.623
  - @brains/plugins@0.2.0-alpha.623
  - @brains/templates@0.2.0-alpha.623

## 0.2.0-alpha.622

### Patch Changes

- Updated dependencies [[`adb2416`](https://github.com/rizom-ai/brains/commit/adb241616ff6bcc28b92a00d9538c6a2668fb8ad)]:
  - @brains/plugins@0.2.0-alpha.622
  - @brains/ui-library@0.2.0-alpha.622
  - @brains/docs-chrome@0.2.0-alpha.622
  - @brains/utils@0.2.0-alpha.622
  - @brains/templates@0.2.0-alpha.622

## 0.2.0-alpha.621

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.621
  - @brains/ui-library@0.2.0-alpha.621
  - @brains/docs-chrome@0.2.0-alpha.621
  - @brains/utils@0.2.0-alpha.621
  - @brains/templates@0.2.0-alpha.621

## 0.2.0-alpha.620

### Patch Changes

- [#796](https://github.com/rizom-ai/brains/pull/796) [`90483cf`](https://github.com/rizom-ai/brains/commit/90483cf788c5b1951879b77ef53db61bf1928c75) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Docs and guide pages no longer carry the Brains documentation site's branding on every brain. The docs index opened on "Handbook · Brains docs" and "Build, run, and publish brains.", its head described every brain's docs as "Brains documentation", and every docs and guide page drew a fixed "brains docs" header with Guides, Roadmap, GitHub and "Get Brains" links and a rizom.ai footer — over a site's own header, on sites whose layout brings one. Now the docs index opens on plain "Documentation" and the pages draw no header or footer brand of their own.

  A brain whose docs pages are the whole site sets them in its plugin config: `plugins.docs.hero` (`label`, `title`, `accent`, `lead`), and `plugins.docs.chrome` and `plugins.guides.chrome` (`brand` with an optional `wordmark`, header `links` with an optional `area` marked current on that area's pages, a `cta`, and a `footer` with its own `brand` and `links`). The Brains documentation site keeps its look by setting these to its current copy.

- Updated dependencies [[`90483cf`](https://github.com/rizom-ai/brains/commit/90483cf788c5b1951879b77ef53db61bf1928c75)]:
  - @brains/docs-chrome@0.2.0-alpha.620
  - @brains/ui-library@0.2.0-alpha.620
  - @brains/utils@0.2.0-alpha.620
  - @brains/plugins@0.2.0-alpha.620
  - @brains/templates@0.2.0-alpha.620

## 0.2.0-alpha.619

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.619
  - @brains/ui-library@0.2.0-alpha.619
  - @brains/utils@0.2.0-alpha.619
  - @brains/plugins@0.2.0-alpha.619
  - @brains/templates@0.2.0-alpha.619

## 0.2.0-alpha.618

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.618
  - @brains/ui-library@0.2.0-alpha.618
  - @brains/utils@0.2.0-alpha.618
  - @brains/plugins@0.2.0-alpha.618
  - @brains/templates@0.2.0-alpha.618

## 0.2.0-alpha.617

### Patch Changes

- Updated dependencies []:
  - @brains/docs-chrome@0.2.0-alpha.617
  - @brains/ui-library@0.2.0-alpha.617
  - @brains/utils@0.2.0-alpha.617
  - @brains/plugins@0.2.0-alpha.617
  - @brains/templates@0.2.0-alpha.617

## 0.2.0-alpha.616

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.616
  - @brains/ui-library@0.2.0-alpha.616
  - @brains/docs-chrome@0.2.0-alpha.616
  - @brains/utils@0.2.0-alpha.616
  - @brains/templates@0.2.0-alpha.616

## 0.2.0-alpha.615

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.615
  - @brains/ui-library@0.2.0-alpha.615
  - @brains/docs-chrome@0.2.0-alpha.615
  - @brains/utils@0.2.0-alpha.615
  - @brains/templates@0.2.0-alpha.615

## 0.2.0-alpha.614

### Patch Changes

- Updated dependencies [[`e32ef03`](https://github.com/rizom-ai/brains/commit/e32ef03b11da06ded05a1a039be2ad64dd715706)]:
  - @brains/plugins@0.2.0-alpha.614
  - @brains/ui-library@0.2.0-alpha.614
  - @brains/docs-chrome@0.2.0-alpha.614
  - @brains/utils@0.2.0-alpha.614
  - @brains/templates@0.2.0-alpha.614

## 0.2.0-alpha.613

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.613
  - @brains/ui-library@0.2.0-alpha.613
  - @brains/docs-chrome@0.2.0-alpha.613
  - @brains/utils@0.2.0-alpha.613
  - @brains/templates@0.2.0-alpha.613

## 0.2.0-alpha.612

### Patch Changes

- [#777](https://github.com/rizom-ai/brains/pull/777) [`6fe5a04`](https://github.com/rizom-ai/brains/commit/6fe5a044ac5315e0c29075e9d810d0989217822f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Brains can carry moving-in guides: a `guides` plugin with a `guide` entity type for walkthroughs addressed to one kind of user. A guide's frontmatter names who it is for, the recipe it starts from, optionally what it uses from that recipe (`brings`, shown in place of the recipe's own lines), and the material that user already has with what each part becomes; its body is markdown, one `##` stage per heading. Guides render inside the docs chrome at `/guides/<slug>`, with an index of every guide at `/guides`; the docs header links to it. The plugin also offers `guides:guide-band`, the guides as a band for a docs page composed of sections, and the docs plugin offers the docs home in two parts (`docs:doc-home-hero`, `docs:doc-home-sections`) so a site can set such a band between them. The plugin is off by default; a brain adds it with `add: [guides]`.

  The agent answers from them. Someone who says who they are and asks where to start, or how to run a brain of their own, gets the matching guide: the agent lists the guides, reads the one whose metadata fits the person and names it by its title; a how-to question is searched in the docs first. `network_ask` asks peer brains only after this brain's own search found little, and is offered to the agent only while the brain has an approved peer to ask: a tool can declare `isAvailable`, checked as each agent turn starts. An answer's sources include a result whose page the answer links, as well as those it names by title.

  A `system_search` result for a long entity (more than 3,000 characters of text) no longer carries its whole content: its `excerpt` holds the sections that best match the query, within that bound, and `excerpted: true` marks it; `system_get` reads the entity whole. A search scoped to a type the index leaves out (`embeddable: false`, such as `site-info`) answers with `notSearchable` and a hint to list and read that type, instead of an empty result, and the agent is told to search each entity type a user names in one step rather than after a broad search.

  Eval suites in `brain.eval.yaml` can set the `site` and `domain` a suite renders with, and a case can assert the sources a reply shows with `expectedSources` (`id`, optional exact `url`, `cited: false` for a source that must not appear). The requirement judge reads a prohibition ("does not claim X") as met when the reply does not do it. The `docs` suite evaluates the doc-brain composition with its docs and guides; its seed is the docs sync's output for the files it holds (`bun run docs:seed` rewrites them, and `docs:check` fails when they drift).

- Updated dependencies [[`484f1ae`](https://github.com/rizom-ai/brains/commit/484f1ae9d67540fc2b494fb073fe42c9234a17f0)]:
  - @brains/docs-chrome@0.2.0-alpha.612
  - @brains/plugins@0.2.0-alpha.612
  - @brains/ui-library@0.2.0-alpha.612
  - @brains/utils@0.2.0-alpha.612
  - @brains/templates@0.2.0-alpha.612
