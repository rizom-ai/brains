---
"@rizom/brain": patch
---

Social posts are a declarative entity package, composed under their plugin id `social-media`. Their templates, `social-media:posts` data source, `social-post:generation` job, evals, LinkedIn publishing, the rule that drafts posts from queued blog posts and their AT Protocol records are unchanged. A post reads back as its text, with its frontmatter as its metadata, and is stored, imported and exported byte for byte as before.

- **Metadata:** a post's metadata now carries every frontmatter field, `coverImageId`, `documents`, `sourceEntityId` and `sourceEntityType` included, beside its slug and a failed publish's error.
- **Scheduled generation:** a scheduled social post skips a published blog post a social post was already written from. The plugin class looked for that in metadata that never carried the source, so every scheduled run could write another post from the same blog post. The run is queued as the `social-media` plugin rather than as `social-media-auto-generate`. Nothing to write from is reported as "No published post available to write a social-post from", where the class reported "No published posts available for social post generation" or "All recent posts already have social posts generated".
- **Drafts from blog posts:** the rule that drafts a LinkedIn post for a queued blog post writes it from the post's title and text (`Title:` line), as a declared blog post reads back as its body.
- **Progress:** a generation that queues its graphic no longer reports "Queueing image generation" as a step.
