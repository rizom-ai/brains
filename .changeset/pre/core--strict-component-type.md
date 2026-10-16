---
"@rizom/brain": patch
---

A template's component can no longer ask for data its schema does not supply. `ComponentType` checked props bivariantly, so a component could require a field the datasource never declared; the book's missing section number got through that way. Props are now checked as an ordinary function parameter. Templates whose components read the link fields site-builder fills (blog, decks, portfolio, agents, the personal and professional homepages, social posts) declare a render schema built on a shared `renderedLinkFields`, so those fields are parsed at render rather than assumed.
