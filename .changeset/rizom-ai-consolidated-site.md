---
"@rizom/site-rizom-ai": patch
"@brains/rover": patch
---

The consolidated rizom.ai site (rev-5): one site serving the platform home plus
the `/work` and `/foundation` rooms, with `/writing` (essays + talks) and
`/network` (agent directory) rendered by the blog/decks/agent-discovery
plugins' own list templates. Two-tier chrome (faces strip over per-face nav),
mycelium rail, You→Team→Network growth diagram, and a four-column footer on
every face. All sections are authored schema-first via `@rizom/site-sections`;
copy ships as `site-content/<page>/<section>.md` entities. The consolidated
rover composition adds `site-content` (it registers the entity type the page
sections render from) alongside web-chat, atproto-registry, products,
rizom-ecosystem, and newsletter.
