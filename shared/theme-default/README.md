# @brains/theme-default

Default theme for Personal Brain static sites.

## Overview

This package provides the default theme CSS for sites built with `@brains/site-builder-plugin`. It includes a purple/orange color scheme with full dark mode support, custom utility classes, and animations.

## Installation

```bash
bun add @brains/theme-default
```

## Usage

Import the theme in your `brain.config.ts`:

```typescript
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import defaultTheme from "@brains/theme-default";

export default {
  plugins: [
    siteBuilderPlugin({
      templates,
      routes,
      layouts,
      themeCSS: defaultTheme, // Apply the default theme
    }),
  ],
};
```

## Features

### Color Scheme

- **Primary**: Purple (`#6366f1`)
- **Accent**: Orange (`#ea580c`)
- **Full dark mode support** with adjusted colors

### Typography

- **Default font**: DM Sans (loaded from Google Fonts)
- **Monospace font**: System monospace stack
- **Serif font**: System serif stack

### CSS Variables

All theme properties are exposed as CSS variables that can be overridden:

#### Colors

- `--color-brand`: Primary brand color
- `--color-brand-dark`: Darker brand variant
- `--color-brand-light`: Lighter brand variant
- `--color-accent`: Accent color
- `--color-accent-dark`: Darker accent variant

#### Text Colors

- `--color-text`: Primary text color
- `--color-text-muted`: Muted text
- `--color-text-light`: Light text
- `--color-text-inverse`: Inverse text (for dark backgrounds)

#### Background Colors

- `--color-bg`: Main background
- `--color-bg-subtle`: Subtle background
- `--color-bg-muted`: Muted background
- `--color-bg-dark`: Dark background

#### Typography

- `--font-sans`: Sans-serif font stack
- `--font-serif`: Serif font stack
- `--font-mono`: Monospace font stack

### Utility Classes

The theme provides semantic utility classes that automatically adapt to dark mode:

- `.text-theme`, `.text-theme-muted`, `.text-theme-light`, `.text-theme-inverse`
- `.bg-theme`, `.bg-theme-subtle`, `.bg-theme-muted`, `.bg-theme-dark`
- `.text-brand`, `.text-accent`
- `.bg-brand`, `.bg-brand-dark`, `.bg-brand-light`
- `.border-theme`, `.border-brand`

### Components

- `.hero-bg-pattern`: Dot grid pattern for hero sections
- `.cta-bg-pattern`: Larger dot pattern for CTAs
- `.animate-blob`: Blob animation for decorative elements
- `.prose`: Typography styles for content

## Customization

You have several options for customizing the theme:

### Option 1: Extend the default theme

Use the `customizeTheme` helper to add your customizations:

```typescript
import defaultTheme, { customizeTheme } from "@brains/theme-default";
import overrides from "./my-overrides.css" with { type: "text" };

const theme = customizeTheme(defaultTheme, overrides);

export default {
  plugins: [
    siteBuilderPlugin({
      themeCSS: theme,
    }),
  ],
};
```

Where `my-overrides.css` contains your customizations:

```css
/* my-overrides.css */
/* Add custom fonts */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap");

/* Override theme variables */
:root {
  --color-brand: #10b981; /* Change to green */
  --color-accent: #14b8a6; /* Teal accent */
  --font-sans: "Inter", sans-serif;
}

/* Add custom styles */
.my-custom-class {
  /* ... */
}
```

### Option 2: Create a custom theme from scratch

Build your own theme without the defaults:

```typescript
import customTheme from "./custom-theme.css" with { type: "text" };

export default {
  plugins: [
    siteBuilderPlugin({
      themeCSS: customTheme,
    }),
  ],
};
```

### Option 3: Use no theme

For a minimal Tailwind-only setup:

```typescript
export default {
  plugins: [
    siteBuilderPlugin({
      themeCSS: "", // No theme, just base Tailwind
    }),
  ],
};
```

## License

MIT
