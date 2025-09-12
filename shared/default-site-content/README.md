# @brains/default-site-content

Minimal default site content for Personal Brain applications. This package provides a clean, content-focused template for displaying your brain's information.

## Features

- **Compact Intro Section**: A minimal introduction with title and description
- **AI-Generated Overview**: Automatically summarizes your brain's content using AI
- **Dark/Light Mode**: Built-in theme switching with localStorage persistence
- **Plugin Navigation**: Automatically includes navigation to plugin-registered pages
- **Minimal Footer**: Simple footer with copyright and attribution

## Templates

- `intro` - Compact introduction section
- `overview` - AI-generated brain content overview
- `navigation` - Site navigation with theme toggle
- `footer` - Minimal footer

## Usage

```typescript
import { templates, routes, DefaultLayout } from "@brains/default-site-content";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";

// In your brain config
plugins: [
  siteBuilderPlugin({
    templates,
    routes,
    layouts: {
      default: DefaultLayout,
    },
    themeCSS,
  }),
];
```

## Design Philosophy

This package focuses on:

- **Content First**: Emphasizes the actual content of your brain
- **Minimal Design**: Clean, distraction-free interface
- **AI Integration**: Leverages AI to summarize and present your brain's knowledge
- **Accessibility**: Dark/light mode support for user preference

## Comparison with product-site-content

While `@brains/product-site-content` provides marketing-oriented templates (hero sections, feature lists, CTAs), this package is designed for personal knowledge management with a focus on content presentation and discovery.
