# @brains/site-builder

Static site generation plugin for Personal Brain applications.

## Overview

This plugin generates static websites from Brain entities, enabling you to publish your knowledge base as a browsable website. It supports themes, custom templates, and various output formats.

## Features

- Static site generation from entities
- Multiple theme support
- Custom templates (Handlebars)
- Markdown to HTML conversion
- Syntax highlighting
- RSS/Atom feeds
- Sitemap generation
- Search index creation
- Asset optimization

## Installation

```bash
bun add @brains/site-builder
```

## Usage

```typescript
import { SiteBuilderPlugin } from "@brains/site-builder";

const plugin = new SiteBuilderPlugin({
  outputDir: "./dist",
  baseUrl: "https://yourbrain.com",
  theme: "default",
  entities: {
    types: ["note", "article"],
    published: true,
  },
});

// Register with shell
await shell.registerPlugin(plugin);

// Build site
await shell.execute("site:build");
```

## Configuration

```typescript
interface SiteBuilderConfig {
  outputDir: string;          // Output directory
  baseUrl: string;            // Site base URL
  theme?: string;             // Theme name
  title?: string;             // Site title
  description?: string;       // Site description
  entities?: EntityFilter;    // Entities to include
  templates?: string;         // Custom templates dir
  assets?: string;            // Assets directory
  buildOptions?: BuildOptions;
}

interface EntityFilter {
  types?: string[];           // Entity types to include
  tags?: string[];            // Required tags
  published?: boolean;        // Only published entities
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}
```

## Themes

### Built-in Themes

```typescript
// Minimal theme
const plugin = new SiteBuilderPlugin({
  theme: "minimal",
});

// Blog theme
const plugin = new SiteBuilderPlugin({
  theme: "blog",
});

// Documentation theme
const plugin = new SiteBuilderPlugin({
  theme: "docs",
});
```

### Custom Theme

Create custom themes:

```
themes/my-theme/
├── templates/
│   ├── layouts/
│   │   └── default.hbs
│   ├── partials/
│   │   ├── header.hbs
│   │   └── footer.hbs
│   ├── index.hbs
│   ├── entity.hbs
│   └── archive.hbs
├── assets/
│   ├── css/
│   ├── js/
│   └── images/
└── theme.json
```

## Templates

### Handlebars Templates

```handlebars
{{!-- layouts/default.hbs --}}
<!DOCTYPE html>
<html>
<head>
  <title>{{title}} - {{site.title}}</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  {{> header}}
  <main>
    {{{content}}}
  </main>
  {{> footer}}
</body>
</html>
```

### Template Variables

Available in templates:

```handlebars
{{site.title}}           {{!-- Site title --}}
{{site.description}}     {{!-- Site description --}}
{{site.baseUrl}}         {{!-- Base URL --}}

{{entity.id}}            {{!-- Entity ID --}}
{{entity.title}}         {{!-- Entity title --}}
{{entity.content}}       {{!-- Rendered content --}}
{{entity.tags}}          {{!-- Entity tags --}}
{{entity.created}}       {{!-- Creation date --}}
{{entity.updated}}       {{!-- Update date --}}

{{#each entities}}       {{!-- Entity list --}}
  {{this.title}}
{{/each}}
```

## Build Process

### Commands

```typescript
// Build site
await shell.execute("site:build");

// Build with watch mode
await shell.execute("site:build", { watch: true });

// Clean build
await shell.execute("site:clean");

// Preview site
await shell.execute("site:preview", { port: 8080 });
```

### Build Options

```typescript
const plugin = new SiteBuilderPlugin({
  buildOptions: {
    minify: true,           // Minify HTML/CSS/JS
    optimizeImages: true,   // Optimize images
    generateSitemap: true,  // Create sitemap.xml
    generateRSS: true,      // Create RSS feed
    generateSearch: true,   // Create search index
  },
});
```

## Content Processing

### Markdown Rendering

```typescript
const plugin = new SiteBuilderPlugin({
  markdown: {
    gfm: true,              // GitHub Flavored Markdown
    breaks: true,           // Convert \n to <br>
    highlight: true,        // Syntax highlighting
    linkify: true,          // Auto-link URLs
  },
});
```

### Syntax Highlighting

```typescript
const plugin = new SiteBuilderPlugin({
  highlight: {
    theme: "github-dark",
    languages: ["js", "ts", "python", "rust"],
  },
});
```

## RSS/Atom Feeds

Automatic feed generation:

```xml
<!-- /feed.xml -->
<rss version="2.0">
  <channel>
    <title>Your Brain</title>
    <link>https://yourbrain.com</link>
    <description>Personal Knowledge Base</description>
    <item>
      <title>Article Title</title>
      <link>https://yourbrain.com/article-slug</link>
      <pubDate>Wed, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
```

## Search

Client-side search with Lunr.js:

```javascript
// Generated search index
const searchIndex = {
  documents: [...],
  index: {...}
};

// Search implementation
const results = searchIndex.search("query");
```

## Asset Pipeline

### CSS Processing

```typescript
const plugin = new SiteBuilderPlugin({
  css: {
    postcss: true,
    tailwind: true,
    purge: true,  // Remove unused CSS
  },
});
```

### Image Optimization

```typescript
const plugin = new SiteBuilderPlugin({
  images: {
    formats: ["webp", "avif"],
    sizes: [640, 1280, 1920],
    lazy: true,
  },
});
```

## Deployment

### Static Hosting

Deploy to various platforms:

```bash
# Netlify
netlify deploy --dir=dist

# Vercel
vercel --prod dist

# GitHub Pages
gh-pages -d dist

# S3
aws s3 sync dist/ s3://your-bucket
```

### Build Hooks

```typescript
plugin.on("build:start", () => {
  console.log("Building site...");
});

plugin.on("build:complete", (stats) => {
  console.log(`Built ${stats.pages} pages in ${stats.time}ms`);
});
```

## Testing

```typescript
import { SiteBuilderPlugin } from "@brains/site-builder";
import { createTestSite } from "@brains/site-builder/test";

const site = await createTestSite({
  entities: [
    { title: "Page 1", content: "Content 1" },
    { title: "Page 2", content: "Content 2" },
  ],
});

const plugin = new SiteBuilderPlugin({
  outputDir: site.outputDir,
});

await plugin.build();

// Verify output
expect(site.exists("index.html")).toBe(true);
```

## Exports

- `SiteBuilderPlugin` - Main plugin class
- `TemplateEngine` - Handlebars wrapper
- `MarkdownRenderer` - Markdown processor
- `AssetPipeline` - Asset optimization
- Theme and template utilities

## License

MIT