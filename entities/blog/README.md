# @brains/blog

Blog posts for Brain applications: long-form essays written by the user or generated with AI, published to the site, its feed and AT Protocol.

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `blog`, so its templates, data sources and job keep the names sites and queued jobs use (`blog:post-list`, `blog:entities`, `post:generation`):

```typescript
import blogPackage from "@brains/blog";
```

A brain enables it through the `publishing` bundle:

```yaml
# brain.yaml
bundles:
  - core
  - site
  - publishing

plugins:
  blog:
    defaultPrompt: Write about my recent work and insights
```

## Writing posts

The blog registers no tools of its own:

- `system_create` saves the user's own text as a post. A leading `#` heading becomes the title, the text is kept as written, and the post's generation fills in the excerpt and the author. An essay published elsewhere keeps the `status`, `publishedAt` and `canonicalUrl` the user states.
- `system_generate` writes a post from a prompt through `post:generation`, in the brain's voice. It can work from source entries and name a series.

The content pipeline publishes a post: its status becomes `published`, its date is recorded, and its social card is rendered first.

## Post

A post's body is the essay. Its frontmatter is its metadata:

```yaml
---
title: Post Title
slug: post-title # resolved from the title when left out
status: draft # generating | draft | queued | published | failed
publishedAt: "2025-01-01T10:00:00.000Z"
excerpt: A brief summary of the post
author: Author Name
coverImageId: cover-image # an image entity
ogImageId: og-post-post-title # the social card, rendered when published
seriesName: My Series
seriesIndex: 1
ogImage: https://example.com/og-image.jpg
canonicalUrl: https://example.com/posts/my-post
---
# Post Content
```

## Site

- `blog:post-list` and `blog:post-detail` render `/posts` and each post, through `blog:entities`, which serves paged lists, newest published first, and a post by its slug with its neighbors and the other posts in its series.
- `blog:homepage` shows the latest post or a page of markdown, read from a `blog:homepage` data source the site provides.
- Every site build writes `feed.xml`. A preview carries every post; production carries the published, dated ones. `blog:rss` answers the same feed for a channel a query names.
- `blog:printable` and `blog:og-image` render a post as a PDF and as its social card.

## License

AGPL-3.0-only
