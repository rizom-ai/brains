---
"@rizom/brain-ui": patch
"@rizom/brain": patch
"@brains/agent-discovery": patch
"@brains/blog": patch
"@brains/book": patch
"@brains/conversation-memory": patch
"@brains/dashboard": patch
"@brains/decks": patch
"@brains/doc": patch
"@brains/docs-chrome": patch
"@brains/email-workflows": patch
"@brains/faq": patch
"@brains/guide": patch
"@brains/link": patch
"@brains/media-page-composer": patch
"@brains/newsletter": patch
"@brains/portfolio": patch
"@brains/series": patch
"@brains/site-atlas": patch
"@brains/site-builder-plugin": patch
"@brains/site-engine": patch
"@brains/site-organization": patch
"@brains/site-personal": patch
"@brains/site-professional": patch
"@brains/social-media": patch
"@brains/topics": patch
"@brains/unified-inbox": patch
---

The component library is published as `@rizom/brain-ui`, moved from the private `@brains/ui-library` workspace to `packages/ui`. It versions and releases with `@rizom/brain`. Its public entry holds the components a site or plugin view renders entities with: `Card`, `CardTitle`, `CardMetadata`, `TagsList`, `MarkdownContent` and `formatDate`, with their props and option types. It ships built JavaScript and declarations, with `react` and `react-dom` as peers and no private workspace dependency. The rest of the library stays first-party in `@rizom/brain-ui/internal`, which is not published, and every package in this repository now imports from one entry or the other. `@brains/email-workflows` and `@brains/unified-inbox` drop a dependency they never imported, and Dashboard keeps it for its tests only.
