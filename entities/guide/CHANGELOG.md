# @brains/guide

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
