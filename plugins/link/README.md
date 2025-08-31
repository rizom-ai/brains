# Link Plugin

Web content capture plugin for the Personal Brain system with AI-powered extraction and structured storage.

## Overview

The Link plugin allows you to capture web links and automatically extract their content using AI. Content is stored as structured markdown entities following the same pattern as the topics plugin, making links human-readable and searchable.

## Features

- **AI-Powered Extraction**: Automatically extracts title, description, summary, and main content from web pages
- **Structured Storage**: Uses StructuredContentFormatter for consistent markdown organization
- **Tag Support**: Automatic tag generation or custom tags
- **Search Integration**: Full-text search across all captured link content
- **Minimal Metadata**: All data stored in content body, no complex metadata

## Tools

### `link:capture`

Capture a web link with AI-powered content extraction.

**Parameters:**

- `url` (string, required): URL to capture
- `tags` (string[], optional): Optional tags for the link

**Returns:**

- `entityId`: The created entity ID
- `title`: Extracted page title
- `url`: The captured URL
- `message`: Success message

### `link:list`

List captured links.

**Parameters:**

- `limit` (number, optional, default: 10): Maximum number of links to return

**Returns:**

- `links`: Array of link summaries
- `count`: Number of links returned

### `link:search`

Search captured links.

**Parameters:**

- `query` (string, optional): Search query to match against link content
- `tags` (string[], optional): Filter by specific tags
- `limit` (number, optional, default: 20): Maximum number of results

**Returns:**

- `links`: Array of matching link summaries
- `count`: Number of matches
- `query`: The search query used

### `link:get`

Get a specific link by ID.

**Parameters:**

- `id` (string, required): Link entity ID

**Returns:**
Complete link data including full content and metadata.

## Configuration

```typescript
{
  enableSummarization: true,  // Generate AI summaries for captured links
  autoTag: true              // Automatically generate tags from content
}
```

## Example Captured Link

When a link is captured, it's stored as a markdown file like this:

```markdown
# How to Build Modern Web Apps

## URL

https://example.com/modern-web-apps

## Description

A comprehensive guide to building scalable web applications with modern tools and practices.

## Summary

This article explores the current landscape of web development, focusing on the tools and methodologies that have become essential for building modern applications...

## Content

Modern web development has evolved significantly over the past decade...

## Tags

- web-development
- javascript
- architecture
- best-practices

## Domain

example.com

## Captured

2025-01-30T10:00:00Z
```

## Architecture

The plugin follows the established plugin pattern with clear separation of concerns:

- **LinkService**: Core business logic for link operations
- **LinkAdapter**: Entity adapter implementing the EntityAdapter interface
- **Tools**: Thin wrappers around service methods
- **Schemas**: Zod schemas for validation and type safety

## Usage

```typescript
import { createLinkPlugin } from "@brains/link";

// Create and register the plugin
const linkPlugin = createLinkPlugin({
  enableSummarization: true,
  autoTag: true,
});

// Use via tools API
await tools.execute("link:capture", {
  url: "https://example.com/article",
  tags: ["web", "development"],
});

const links = await tools.execute("link:list", { limit: 5 });
const searchResults = await tools.execute("link:search", {
  query: "javascript",
  limit: 10,
});
```

## Benefits

1. **Consistency**: Follows the same pattern as other plugins
2. **Human-readable**: Easy to read and edit manually
3. **AI-powered**: Leverages AI for intelligent content extraction
4. **Simple**: No complex metadata or HTML parsing needed
5. **Searchable**: All content is in the body, easily searchable
6. **Git-friendly**: Clean diffs for version control
