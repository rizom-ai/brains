---
"@rizom/brain": patch
---

The blog is a declarative entity package, composed under its plugin id `blog`. Its templates, `blog:entities` and `blog:rss` data sources, `post:generation` job, evals, printable and social-card attachments, publish and social-card registrations and AT Protocol records are unchanged. A post reads back as its body, with its frontmatter as its metadata, and is stored, imported, exported and published byte for byte as before.

- **Feed:** `feed.xml` is now written through the declared feed and is byte-identical to before. If the feed cannot be written, the build reports "post feed generation failed" instead of "RSS feed generation failed".
- **From the writer's text:** a post written from the writer's text still gets its placeholder and is filled by `post:generation`, queued for the caller who asked. The job now carries the caller's authority; a job queued in the old shape still runs.
- **Generation reads:** a generation counts a post's place in its series, and reads the entries it is written from, at the scope the run reads at.
- **Newsletter email:** a newsletter sent when a post is published carries the post's body under its title. Before, subscribers also received the post's frontmatter, rendered as a rule and a heading.
- **Newsletter from posts:** a newsletter generated from posts summarizes each post from its excerpt, which a post's metadata now carries. Before, it took the first 500 characters of the stored document.
