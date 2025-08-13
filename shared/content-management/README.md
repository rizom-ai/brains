# @brains/content-management

Shared content management utilities and helpers for Personal Brain applications.

## Overview

This package provides common content processing, transformation, and management utilities used across Brain applications. It includes markdown processing, content extraction, formatting helpers, and validation utilities.

## Features

- Markdown parsing and rendering
- Content extraction and summarization
- Text processing utilities
- Format conversion helpers
- Content validation
- Metadata extraction
- Link and reference management

## Installation

```bash
bun add @brains/content-management
```

## Usage

```typescript
import {
  parseMarkdown,
  extractMetadata,
  summarize,
  convertToHTML,
} from "@brains/content-management";

// Parse markdown with frontmatter
const { metadata, content, ast } = parseMarkdown(markdownText);

// Extract metadata from content
const extracted = extractMetadata(content, {
  extractTitle: true,
  extractLinks: true,
  extractImages: true,
});

// Generate summary
const summary = summarize(content, {
  maxLength: 200,
  preserveFormatting: false,
});

// Convert to HTML
const html = convertToHTML(markdown);
```

## Markdown Processing

### Parse Markdown

```typescript
import { parseMarkdown } from "@brains/content-management";

const result = parseMarkdown(`---
title: My Note
tags: [javascript, tutorial]
---

# Content

This is the content.
`);

// result = {
//   metadata: { title: "My Note", tags: ["javascript", "tutorial"] },
//   content: "# Content\n\nThis is the content.",
//   ast: { type: "root", children: [...] }
// }
```

### Render Markdown

```typescript
import { renderMarkdown } from "@brains/content-management";

const html = renderMarkdown(markdown, {
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
  linkify: true, // Auto-link URLs
  highlight: true, // Syntax highlighting
  sanitize: true, // Sanitize HTML
});
```

## Content Extraction

### Extract Title

```typescript
import { extractTitle } from "@brains/content-management";

const title = extractTitle(content);
// Extracts from frontmatter, first H1, or generates from content
```

### Extract Links

```typescript
import { extractLinks } from "@brains/content-management";

const links = extractLinks(markdown);
// Returns:
// [
//   { text: "Example", url: "https://example.com", type: "external" },
//   { text: "Internal", url: "/page", type: "internal" },
//   { text: "Reference", url: "#ref", type: "anchor" }
// ]
```

### Extract Images

```typescript
import { extractImages } from "@brains/content-management";

const images = extractImages(markdown);
// Returns:
// [
//   { alt: "Alt text", url: "/image.png", title: "Title" }
// ]
```

## Text Processing

### Summarization

```typescript
import { summarize } from "@brains/content-management";

// Simple truncation
const summary = summarize(longText, {
  maxLength: 200,
  suffix: "...",
});

// Sentence-aware summary
const summary = summarize(longText, {
  maxSentences: 3,
  preserveWords: true,
});

// Extract key sentences
const keySentences = extractKeySentences(longText, {
  count: 5,
  algorithm: "textrank",
});
```

### Text Cleaning

```typescript
import { cleanText } from "@brains/content-management";

const cleaned = cleanText(dirtyText, {
  removeHtml: true,
  removeMarkdown: true,
  normalizeWhitespace: true,
  removeEmojis: false,
  trim: true,
});
```

### Word Processing

```typescript
import {
  countWords,
  countCharacters,
  readingTime,
} from "@brains/content-management";

const wordCount = countWords(text);
const charCount = countCharacters(text, { includeSpaces: false });
const time = readingTime(text, { wordsPerMinute: 200 });
// Returns: { minutes: 5, seconds: 30, text: "5 min read" }
```

## Format Conversion

### HTML Conversion

```typescript
import { markdownToHTML, htmlToMarkdown } from "@brains/content-management";

// Markdown to HTML
const html = markdownToHTML(markdown, {
  headerIds: true,
  tableOfContents: true,
});

// HTML to Markdown
const markdown = htmlToMarkdown(html, {
  turndownOptions: {
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  },
});
```

### Plain Text

```typescript
import { toPlainText } from "@brains/content-management";

const plain = toPlainText(content, {
  preserveNewlines: true,
  preserveLinks: false,
});
```

## Metadata Management

### Frontmatter

```typescript
import {
  parseFrontmatter,
  stringifyFrontmatter,
  updateFrontmatter,
} from "@brains/content-management";

// Parse frontmatter
const { data, content } = parseFrontmatter(markdownWithFrontmatter);

// Update frontmatter
const updated = updateFrontmatter(markdown, {
  title: "New Title",
  updated: new Date(),
});

// Create with frontmatter
const withFrontmatter = stringifyFrontmatter(
  { title: "Title", tags: ["tag1"] },
  "Content here",
);
```

### Metadata Extraction

```typescript
import { extractMetadata } from "@brains/content-management";

const metadata = extractMetadata(content, {
  extractTitle: true,
  extractDescription: true,
  extractKeywords: true,
  extractDates: true,
  extractAuthors: true,
  extractReadingTime: true,
});
```

## Content Validation

### Schema Validation

```typescript
import { validateContent } from "@brains/content-management";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1),
  content: z.string().min(10),
  tags: z.array(z.string()),
});

const result = validateContent(data, schema);
if (!result.success) {
  console.error(result.errors);
}
```

### Link Checking

```typescript
import { checkLinks } from "@brains/content-management";

const results = await checkLinks(markdown, {
  checkExternal: true,
  timeout: 5000,
});

// Returns status for each link
results.forEach((link) => {
  if (!link.valid) {
    console.warn(`Broken link: ${link.url}`);
  }
});
```

## Table of Contents

```typescript
import { generateTOC } from "@brains/content-management";

const toc = generateTOC(markdown, {
  maxDepth: 3,
  minDepth: 1,
  format: "markdown", // or "html", "json"
});

// Returns:
// - [Introduction](#introduction)
//   - [Getting Started](#getting-started)
//   - [Installation](#installation)
```

## Content Transformation

### Transform Pipeline

```typescript
import { createPipeline } from "@brains/content-management";

const pipeline = createPipeline()
  .add(cleanText)
  .add(extractMetadata)
  .add(summarize)
  .add(validateContent);

const result = await pipeline.process(content);
```

### Custom Transformers

```typescript
import { registerTransformer } from "@brains/content-management";

registerTransformer("custom", async (content, options) => {
  // Custom transformation logic
  return transformedContent;
});
```

## Testing Utilities

```typescript
import {
  createMockContent,
  generateSampleMarkdown,
} from "@brains/content-management/test";

// Generate sample content
const sample = generateSampleMarkdown({
  paragraphs: 5,
  headings: 3,
  lists: 2,
  links: 5,
});

// Create mock content
const mock = createMockContent({
  title: "Test",
  content: "Test content",
});
```

## Exports

- Markdown processing functions
- Text processing utilities
- Format converters
- Metadata extractors
- Validation helpers
- Content transformers
- Testing utilities

## License

MIT
