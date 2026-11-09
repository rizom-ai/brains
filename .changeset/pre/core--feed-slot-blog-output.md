---
"@rizom/brain": patch
---

A declared type's feed now writes the feed the blog has always written, byte for byte:

- The channel links the site URL as configured, and the feed's self link is that URL, a slash and the path.
- The document ends at its closing tag.
- No copyright line is written.
- When the site config gives no title or description, the channel takes the type's own (`title`, `description`), else "Feed" and "Latest updates".
- `toItem` is told which build it serves (`{ environment }`), so a production feed can leave out what is not ready, such as a published post without a date.

`routePrefix` is gone from `EntityFeedDeclaration`; a declaration that still passes it no longer typechecks.
