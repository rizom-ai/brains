# @brains/view-registry

View template and rendering registry for Personal Brain shell.

## Overview

This package manages view templates, renderers, and presentation logic for the Brain shell. It provides a unified system for registering and rendering different view formats including terminal UI, HTML, Markdown, and JSON.

## Features

- Multiple view format support (terminal, HTML, MD, JSON)
- Template registration and management
- Context-aware rendering
- View composition and layouts
- Theming support
- Output streaming
- Responsive terminal UI components

## Installation

```bash
bun add @brains/view-registry
```

## Usage

```typescript
import { ViewRegistry } from "@brains/view-registry";

const registry = ViewRegistry.getInstance();

// Register a view
registry.register("entity-list", {
  format: "terminal",
  template: (data) => {
    return table(data.entities, {
      columns: ["id", "title", "type", "created"],
    });
  },
});

// Render a view
const output = await registry.render("entity-list", {
  entities: await entityService.list(),
});

console.log(output);
```

## View Definition

```typescript
interface ViewDefinition {
  name: string; // View name
  format: ViewFormat; // Output format
  template: ViewTemplate; // Render function
  layout?: string; // Parent layout
  styles?: ViewStyles; // Styling options
  validators?: ViewValidators; // Data validators
  metadata?: Record<string, any>;
}

type ViewFormat = "terminal" | "html" | "markdown" | "json" | "xml";

type ViewTemplate = (
  data: any,
  context: ViewContext,
) => string | Promise<string>;

interface ViewContext {
  format: ViewFormat;
  theme: Theme;
  width?: number; // Terminal width
  height?: number; // Terminal height
  locale: string;
  user?: User;
}
```

## Terminal Views

### Text Components

```typescript
import { text, bold, italic, color } from "@brains/view-registry/terminal";

registry.register("welcome", {
  format: "terminal",
  template: (data) => {
    return text([
      bold("Welcome to Brain!"),
      "",
      `Hello ${color.green(data.username)}`,
      italic("Your personal knowledge management system"),
    ]);
  },
});
```

### Tables

```typescript
registry.register("entity-table", {
  format: "terminal",
  template: (data) => {
    return table(data.entities, {
      columns: [
        { key: "id", width: 10 },
        { key: "title", width: 30 },
        { key: "type", width: 10 },
        { key: "tags", width: 20, format: (tags) => tags.join(", ") },
      ],
      border: "single", // "single" | "double" | "rounded" | "none"
      compact: false,
    });
  },
});
```

### Lists

```typescript
registry.register("menu", {
  format: "terminal",
  template: (data) => {
    return list(data.items, {
      style: "bullet", // "bullet" | "number" | "checkbox"
      indent: 2,
      marker: "•",
    });
  },
});
```

### Progress Bars

```typescript
registry.register("progress", {
  format: "terminal",
  template: (data) => {
    return progress(data.current, data.total, {
      width: 40,
      fillChar: "█",
      emptyChar: "░",
      showPercentage: true,
      showCount: true,
    });
  },
});
// Output: [████████░░░░░░░░] 45% (45/100)
```

## HTML Views

```typescript
registry.register("entity-card", {
  format: "html",
  template: (data) => {
    return html`
      <div class="entity-card">
        <h2>${data.title}</h2>
        <div class="meta">
          <span class="type">${data.type}</span>
          <time>${data.created}</time>
        </div>
        <div class="content">${data.content}</div>
        <div class="tags">
          ${data.tags
            .map((tag) => html` <span class="tag">${tag}</span> `)
            .join("")}
        </div>
      </div>
    `;
  },
  styles: {
    inline: `
      .entity-card {
        border: 1px solid #ddd;
        padding: 1rem;
        border-radius: 4px;
      }
    `,
  },
});
```

## Markdown Views

```typescript
registry.register("entity-doc", {
  format: "markdown",
  template: (data) => {
    return markdown`
# ${data.title}

**Type:** ${data.type}  
**Created:** ${data.created}  
**Tags:** ${data.tags.join(", ")}

## Content

${data.content}

---
*Generated on ${new Date().toISOString()}*
    `;
  },
});
```

## JSON Views

```typescript
registry.register("api-response", {
  format: "json",
  template: (data) => {
    return {
      success: true,
      data: data.entities,
      meta: {
        count: data.entities.length,
        timestamp: Date.now(),
      },
    };
  },
});
```

## Layouts

### Define Layouts

```typescript
registry.registerLayout("main", {
  format: "terminal",
  template: (content, data) => {
    return `
${header(data.title)}
${divider()}
${content}
${divider()}
${footer(data.version)}
    `;
  },
});
```

### Use Layouts

```typescript
registry.register("page", {
  format: "terminal",
  layout: "main",
  template: (data) => {
    return data.content; // Will be wrapped in layout
  },
});
```

## Themes

### Register Theme

```typescript
registry.registerTheme("dark", {
  colors: {
    primary: "#00ff00",
    secondary: "#0088ff",
    error: "#ff0000",
    warning: "#ffaa00",
    success: "#00ff00",
  },
  terminal: {
    background: "black",
    foreground: "white",
  },
});
```

### Use Theme

```typescript
const output = await registry.render("view", data, {
  theme: "dark",
});
```

## View Composition

```typescript
// Compose multiple views
registry.register("dashboard", {
  format: "terminal",
  template: async (data, context) => {
    const stats = await registry.render("stats", data.stats, context);
    const recent = await registry.render("recent-items", data.recent, context);
    const activity = await registry.render("activity", data.activity, context);

    return column([stats, divider(), recent, divider(), activity]);
  },
});
```

## Responsive Views

```typescript
registry.register("responsive-list", {
  format: "terminal",
  template: (data, context) => {
    const { width = 80 } = context;

    if (width < 40) {
      // Compact view
      return list(data.items.map((i) => i.title));
    } else if (width < 80) {
      // Medium view
      return table(data.items, {
        columns: ["title", "type"],
      });
    } else {
      // Full view
      return table(data.items, {
        columns: ["id", "title", "type", "created", "tags"],
      });
    }
  },
});
```

## Streaming Views

```typescript
registry.register("stream", {
  format: "terminal",
  stream: true,
  template: async function* (data, context) {
    yield "Starting process...\n";

    for (const item of data.items) {
      await processItem(item);
      yield `✓ Processed ${item.name}\n`;
    }

    yield "Complete!\n";
  },
});

// Use streaming view
const stream = registry.renderStream("stream", data);
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## Format Conversion

```typescript
// Register multi-format view
registry.registerMultiFormat("entity", {
  terminal: (data) => terminalView(data),
  html: (data) => htmlView(data),
  markdown: (data) => markdownView(data),
  json: (data) => jsonView(data),
});

// Render in different formats
const terminal = await registry.render("entity", data, { format: "terminal" });
const html = await registry.render("entity", data, { format: "html" });
```

## Testing

```typescript
import { ViewRegistry } from "@brains/view-registry";
import { createMockContext } from "@brains/view-registry/test";

const registry = ViewRegistry.createFresh();

registry.register("test-view", {
  format: "terminal",
  template: (data) => `Hello ${data.name}`,
});

const output = await registry.render(
  "test-view",
  { name: "World" },
  createMockContext(),
);

expect(output).toBe("Hello World");
```

## Utilities

```typescript
import {
  box,
  divider,
  spinner,
  chart,
  tree,
} from "@brains/view-registry/components";

// Box with border
const boxed = box("Content", {
  padding: 1,
  borderStyle: "rounded",
});

// ASCII chart
const barChart = chart(data, {
  type: "bar",
  width: 40,
  height: 10,
});

// Tree view
const treeView = tree(hierarchicalData, {
  showLines: true,
  expanded: true,
});
```

## Exports

- `ViewRegistry` - Main registry class
- `ViewDefinition` - View definition interface
- Terminal components and utilities
- HTML/Markdown helpers
- Format converters
- Testing utilities

## License

MIT
