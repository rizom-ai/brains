# @brains/webserver-template

Default Astro template for Personal Brain websites.

## Overview

This package provides the default website template used by the webserver plugin. It includes:

- Astro-based static site generation
- Tailwind CSS v4 for styling
- Responsive landing page design
- Content collection for dynamic data

## Structure

```
src/
├── content/          # Astro content collections
│   └── config.ts     # Collection schemas
├── pages/            # Page components
│   └── index.astro   # Landing page
└── styles/           # Global styles
    └── global.css    # Tailwind imports
```

## Content Schema

The template expects content in the `landing` collection with the following structure:

```typescript
{
  title: string;
  description: string;
  stats: {
    noteCount: number;
    tagCount: number;
    lastUpdated: string;
  }
  recentNotes: Array<{
    id: string;
    title: string;
    created: string;
  }>;
}
```

## Customization

To create a custom template:

1. Fork this package
2. Modify the pages, styles, and components
3. Update the content schema if needed
4. Use your custom template with the webserver plugin

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build
```
