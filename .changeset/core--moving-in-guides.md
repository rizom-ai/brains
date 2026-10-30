---
"@brains/guide": patch
"@brains/doc": patch
"@brains/agent-discovery": patch
"@brains/ai-service": patch
"@brains/ai-evaluation": patch
"@rizom/brain": patch
---

Brains can carry moving-in guides: a `guides` plugin with a `guide` entity type for walkthroughs addressed to one kind of user. A guide's frontmatter names who it is for, the recipe it starts from, optionally what it uses from that recipe (`brings`, shown in place of the recipe's own lines), and the material that user already has with what each part becomes; its body is markdown, one `##` stage per heading. Guides render inside the docs chrome at `/guides/<slug>`, with an index of every guide at `/guides`; the docs header links to it. The plugin also offers `guides:guide-band`, the guides as a band for a docs page composed of sections, and the docs plugin offers the docs home in two parts (`docs:doc-home-hero`, `docs:doc-home-sections`) so a site can set such a band between them. The plugin is off by default; a brain adds it with `add: [guides]`.

The agent answers from them. Someone who says who they are and asks where to start gets the matching guide, found with a guide-scoped search and named by its title; a how-to question is searched in the docs first. `network_ask` asks peer brains only after this brain's own search found little. An answer's sources include a result whose page the answer links, as well as those it names by title.

Eval suites in `brain.eval.yaml` can set the `site` and `domain` a suite renders with, and a case can assert the sources a reply shows with `expectedSources` (`id`, optional exact `url`, `cited: false` for a source that must not appear). The `docs` suite evaluates the doc-brain composition with its docs and guides.
