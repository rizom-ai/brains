---
"@brains/image": patch
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/blog": patch
"@brains/portfolio": patch
"@brains/social-media": patch
"@brains/series": patch
"@brains/site-personal": patch
"@rizom/brain": patch
---

Cover images on brain sites say what they show. Posts, projects, social posts, series and the personal homepage render a cover with the image's own alt text once the brain's vision model or its owner has written one, carried as `coverImageAlt`; until then the cover keeps the post's title. A stand-in alt (a title or `cover-<post>`) is never used.
