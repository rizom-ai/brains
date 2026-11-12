# @brains/link

Saved links: web pages captured from their URL, summarized by AI, kept as markdown.

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `link`, so its templates, data source and jobs keep the names sites and queued jobs use (`link:link-list`, `link:entities`, `link:capture`):

```typescript
import linkPackage from "@brains/link";
```

Settings:

```yaml
plugins:
  link:
    # Jina Reader key for higher rate limits (500 RPM vs 20 RPM without one)
    jinaApiKey: <your Jina Reader key>
```

## Capturing links

The package registers no tools of its own. `system_create` captures the URL a request names, whether as a URL source, in a prompt, in content or in the title:

1. A pending link is written under the URL's id. A link that already has the id is reused, and one that exists at another visibility than asked is refused.
2. `link:capture` is queued as the caller's data processing, in their channel. It fetches the page through Jina Reader, extracts its title, description and summary with `link:extraction`, and saves the link as a draft. A page out of reach, or an extraction that comes back incomplete, keeps the link pending with what was found.

A full link document given as content is saved as written. Content or a prompt that names no URL is refused. Jobs queued under `link:generation` run the same capture.

## Link

A link's body is its summary. Its frontmatter is its metadata:

```yaml
---
status: draft # pending | draft | published
title: How to Build Modern Web Apps
url: https://example.com/modern-web-apps
description: A guide to building web applications with modern tools.
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "matrix:!room:server" # where it was captured from
  label: "#engineering"
---
This article explores the current landscape of web development...
```

A link file written by hand keeps its own frontmatter order when the brain rewrites it.

## Site and AT Protocol

- `link:link-list` and `link:link-detail` render the links through `link:entities`: every link, newest captured first, or one by its id with its neighbors.
- Each link is published as an `ai.rizom.brain.link` record.

## License

AGPL-3.0-only
