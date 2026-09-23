---
"@brains/entity-service": patch
"@brains/decks": patch
"@brains/ui-library": patch
"@brains/image": patch
---

Keep entity reads as durable markdown instead of expanding image references into controller data URLs. Render deck covers from the prepared site image URL, preserving title-slide appearance and explicit body-image rendering. Remove the unused buffered image-display resolver APIs; retain metadata-only frontmatter helpers.
