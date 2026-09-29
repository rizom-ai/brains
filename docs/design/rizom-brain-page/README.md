# Brain page — agent-first design evidence

The production implementation has shipped to the Rizom preview path; see [implementation.md](implementation.md) and the active [Public Ask plan](../../plans/public-ask.md). Guest admission and production-page publication remain off/unapproved.

Open [index.html](index.html) locally to review the original design proposal. It links the stylesheet from `../rizom-living-memory-page/styles/main.css`, so keep both folders together. The mockup is historical evidence, not the current runtime or authoritative copy.

## Accepted direction

The page leads with the brain as an owned agent, per [product-audit.md](product-audit.md) and the July 2026 brand book: grounded in its owner's knowledge, equipped with selected capabilities, and able to work with other independently owned brains. Publishing is one capability, not the product's defining scope. The colleague's editorial structure is retained.

Structure:

1. Hero: "Build the agent that represents you." A plain chat box, without “working proof” labels or a premature live status. In the retained mockup, topic hints fill the input and submission stays local-only. The shipped preview enhances this same box through Public Ask; guest admission remains off.
2. Three chapters: Answers, Capabilities, Collective. Chat and network captures are retained. Capabilities shows the real bundle list from the CLI as a `brain.yaml` excerpt: core always on, the personal recipe active, the other bundles dimmed. The earlier icon grid of supported packages was rejected as generic.
3. You / Team / Network distinguishes an individually owned brain, a team-owned brain with shared context, and collaboration between independently owned brains. It does not imply merged private archives or automatic collective outcomes.
4. Stays yours: portable text records, self-hosting and provider choice, AGPL runtime with Apache SDK. Cloud model processing is distinguished from local hosting. Unsupported guarantees about review, universal signing, ownership of all outputs, and foundation-held methodology have been removed.
5. Quick start with the real commands from the repository README, plus the knowledge-session route to `/work`.

## Visual material on the page

**This is a product landing page. Do not respond to weak screenshot relevance by stripping out the visuals and leaving text-heavy sections.** The user explicitly rejected that direction and requested reversal. The previous page was restored exactly from `/tmp/rizom-brain-before-removing-screenshots.html`. Screenshot relevance remains unresolved; restoration is not approval of every image.

The request/document experiment was emphatically rejected. `index.html` has been restored exactly from `/tmp/rizom-brain-before-work-composition.html`. This restores the preceding work-led icon grid, which was also disliked—not an approved visual. Stop iterating from the assumption that more text-heavy panels or fabricated conversations solve this product-landing-page brief.

The work-led positioning remains; capabilities are named by their real bundle ids (media, web, chat, site, publishing, automation, federation, team) plus plugins. The rejected request/document version is backed up at `/tmp/rizom-brain-rejected-work-composition.html`; its captures remain off-page.

### Rejected request/document experiment

This paired two crops of Studio’s real interface using the same fictional pilot material as the retained Answers capture. It did not provide a compelling product visual. The following provenance describes that rejected experiment, not the active page.

The interface was rebuilt before capture. Conversation and document content were supplied through the visual-regression harness, entirely in memory. The Brain runtime did not generate this brief: the conversation and document were authored as fixtures. No retrieval or tool execution was observed, and nothing was saved to app data or published. Captions were removed from the page; this file and the alt text carry the provenance. These are two separate interface crops, not a claim that Studio has this combined layout. Both have native mobile captures and open the matching full-size image. Details are recorded in `evidence/work-captures.json`.

Obsidian, Discord and MCP remain in supporting integration details. MCP is explicitly built in; research is not advertised as an optional plugin. The plugin-authoring link remains in the section copy. The request/document visual is rejected. The restored tile version is also not approved.

The retained chat figure uses `images/chat-{desktop,mobile}-{dark,light}.png`: Chromium captures of the rebuilt Studio frontend at revision `2b7ecfe604`, using fictional in-memory fixtures. Nothing was imported or published. It uses mobile captures below 600px.

The network figure uses public dashboard captures from 8 September 2026, documented in `evidence/public-dashboard-captures.json`. It depicts semantic proximity, not demonstrated collaboration. The chat and network figures open their matching full-size captures. The post captures and other earlier assets remain on disk but are not displayed.

## Not on the page

- The live A2A workshop exchange documented in [evidence/README.md](evidence/README.md) was tried as the hero proof and rejected. The evidence stays as evidence.
- The earlier memory-first version is kept as [memory-first-version.html](memory-first-version.html) for comparison. It is not the direction.
- The three study files (`collective-study.html`, `illustration-study.html`, `shared-project-study.html`) are earlier explorations and are not incorporated.

## Scope

Historical standalone design proposal. The mockup itself makes no application requests and writes no data. Live templates, authoritative copy, rollout state, and remaining approval gates are documented in [implementation.md](implementation.md) and [public-ask.md](../../plans/public-ask.md).
