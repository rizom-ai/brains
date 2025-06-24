# Site Builder Architecture Refactoring Plan

## Overview

This plan outlines a simplified architecture using pure Preact server-side rendering, eliminating the need for Astro and complex import resolution.

## Final Architecture: Pure Preact Site Builder

### Core Principles

1. **Self-contained plugins** - Each plugin includes its own Preact components
2. **Direct component access** - Components are function references in ViewRegistry
3. **Server-side rendering** - All rendering happens in the shell process
4. **No build complexity** - Output is static HTML/CSS/JS files

### Component Registration

```typescript
// ViewTemplate interface - WebRenderer can be function or string
export interface ViewTemplate<T = unknown> {
  name: string;
  schema: z.ZodType<T>;
  description?: string;
  renderers: {
    web?: ComponentType<T> | string; // Function reference or path
  };
  interactive?: boolean; // Mark components that need client-side hydration
}
```

### How It Works

1. **Plugins register components as functions**:

   ```typescript
   import { NoteCard } from "./components/NoteCard";

   context.viewRegistry.registerViewTemplate({
     name: "note-card",
     schema: noteCardSchema,
     renderers: {
       web: NoteCard, // Direct function reference!
     },
     interactive: false, // Static by default
   });
   ```

2. **Site builder accesses components directly**:

   ```typescript
   const template = viewRegistry.getViewTemplate('note-card');
   const Component = template.renderers.web; // The actual function
   const html = renderToString(<Component {...props} />);
   ```

3. **No import/export complexity** - Everything runs in the shell process

### Package Structure

```
@brains/default-site-content/     # Pure content package (not a plugin)
├── src/
│   ├── hero/                     # Hero template
│   │   ├── layout.tsx           # Preact component
│   │   ├── schema.ts            # Zod schema
│   │   ├── formatter.ts         # Content formatter
│   │   ├── prompt.txt           # AI generation prompt
│   │   └── index.ts             # Exports heroTemplate
│   ├── features/                 # Features template
│   │   ├── layout.tsx
│   │   ├── schema.ts
│   │   ├── formatter.ts
│   │   ├── prompt.txt
│   │   └── index.ts             # Exports featuresTemplate
│   ├── products/                 # Products template
│   │   ├── layout.tsx
│   │   ├── schema.ts
│   │   ├── formatter.ts
│   │   ├── prompt.txt
│   │   └── index.ts             # Exports productsTemplate
│   ├── routes.ts                # Route definitions
│   ├── templates.ts             # Collects all templates
│   └── index.ts                 # Main exports
└── package.json                 # Dependencies: zod (Bun handles JSX)

@brains/site-builder-plugin/      # Site builder (is a plugin)
├── src/
│   ├── rendering/                # SSR logic
│   │   ├── page-renderer.ts     # Renders pages with Preact
│   │   ├── component-bundler.ts # Bundles interactive components
│   │   ├── style-processor.ts   # Tailwind CSS processing
│   │   └── html-generator.ts    # Generates final HTML
│   ├── tools/                    # Plugin tools
│   │   ├── promote-content.ts
│   │   ├── rollback-content.ts
│   │   └── regenerate-content.ts
│   ├── styles/                   # Tailwind setup
│   │   └── global.css           # Global styles with @tailwind directives
│   ├── plugin.ts                # Regular plugin extending BasePlugin
│   └── index.ts
└── package.json                 # Dependencies: preact, preact-render-to-string, tailwindcss, @brains/default-site-content

@brains/notes-plugin/            # Example plugin (with components)
├── src/
│   ├── components/              # Preact components
│   │   ├── NoteCard.tsx
│   │   └── NoteEditor.tsx       # Interactive component
│   ├── plugin.ts                # Registers components via ViewRegistry
│   └── index.ts
└── package.json
```

## Implementation Plan

### Phase 1: Update Type Definitions

1. Add `interactive` field to ViewTemplate interface:
   ```typescript
   export interface ViewTemplate<T = unknown> {
     name: string;
     schema: z.ZodType<T>;
     description?: string;
     renderers: {
       web?: ComponentType<T> | string; // Keep flexible
     };
     interactive?: boolean; // New field for hydration
   }
   ```

### Phase 2: Transform Default Site to Content Package

1. Convert `default-site-plugin` to `default-site-content` (not a plugin)
2. Organize templates by feature with unified export structure:

   ```typescript
   // src/hero/index.ts
   import { HeroLayout } from "./layout";
   import { LandingHeroDataSchema } from "./schema";
   import { HeroSectionFormatter } from "./formatter";
   // Read prompt.txt and include as string

   export const heroTemplate = {
     name: "hero",
     description: "Hero section with headline and call-to-action",
     schema: LandingHeroDataSchema,
     component: HeroLayout,
     formatter: new HeroSectionFormatter(),
     prompt: `Generate a hero section...`,
     interactive: false,
   };

   // src/templates.ts - Collect all templates
   import { heroTemplate } from "./hero";
   import { featuresTemplate } from "./features";
   import { productsTemplate } from "./products";

   export const templates = {
     hero: heroTemplate,
     features: featuresTemplate,
     products: productsTemplate,
   };

   // src/routes.ts - Simplified route structure
   export const routes: RouteDefinition[] = [
     {
       id: "landing", // Used for page in contentEntity query
       path: "/",
       title: "Home",
       description: "Welcome to your Personal Brain",
       sections: [
         { id: "hero", template: "hero" },
         { id: "features", template: "features" },
         { id: "products", template: "products" },
         { id: "cta", template: "cta" },
       ],
     },
   ];
   ```

3. Each template directory contains:

   - `layout.tsx` - Preact component for rendering
   - `schema.ts` - Zod schema for validation
   - `formatter.ts` - Markdown/structured data conversion
   - `prompt.txt` - AI generation prompt
   - `index.ts` - Exports unified template object

4. Site builder imports and transforms to ViewTemplates as needed
5. Ensure all components use Tailwind classes

### Phase 3: Transform Site Builder Plugin

1. Remove Astro dependencies
2. Update plugin to accept templates and routes as configuration:

   ```typescript
   // Plugin configuration schema
   const siteBuilderConfigSchema = z.object({
     outputDir: z.string(),
     workingDir: z.string().optional(),
     siteConfig: z.object({...}).optional(),
     templates: z.record(z.any()).optional(),        // Template definitions
     routes: z.array(RouteDefinitionSchema).optional(), // Route definitions
   });

   class SiteBuilderPlugin extends BasePlugin {
     async onRegister(context: PluginContext) {
       // Register templates if provided in config
       if (this.config.templates) {
         Object.values(this.config.templates).forEach((template) => {
           // Register with ContentRegistry (for AI generation)
           context.contentRegistry.registerTemplate(template.name, {
             template: {
               name: template.name,
               description: template.description,
               schema: template.schema,
               basePrompt: template.prompt,
               formatter: template.formatter,
             },
             formatter: template.formatter,
             schema: template.schema,
           });

           // Register with ViewRegistry (for rendering)
           if (template.component) {
             context.viewRegistry.registerViewTemplate({
               name: template.name,
               schema: template.schema,
               description: template.description,
               renderers: { web: template.component },
               interactive: template.interactive,
             });
           }
         });
       }

       // Register routes if provided in config
       if (this.config.routes) {
         this.config.routes.forEach((route) => {
           // Add convention-based contentEntity
           context.viewRegistry.registerRoute({
             ...route,
             sections: route.sections.map((section) => ({
               ...section,
               contentEntity: {
                 entityType: "site-content",
                 query: {
                   page: route.id || "landing",
                   section: section.id,
                   environment: this.config.environment || "preview",
                 },
               },
             })),
           });
         });
       }
     }

     async buildSite(options: BuildOptions) {
       // Get all routes (default + any from other plugins)
       const allRoutes = this.context.viewRegistry.listRoutes();

       for (const route of allRoutes) {
         const html = await this.renderPage(route);
         await this.writePage(route.path, html);
       }

       // Bundle interactive components if any
       if (this.hasInteractiveComponents()) {
         await this.bundleClientCode();
       }
     }

     async renderPage(route: RouteDefinition): Promise<string> {
       const sections = await this.renderSections(route.sections);

       return `<!DOCTYPE html>
         <html>
           <head>
             <meta charset="UTF-8">
             <meta name="viewport" content="width=device-width, initial-scale=1.0">
             <title>${route.title}</title>
             <link rel="stylesheet" href="/styles.css">
           </head>
           <body>
             ${sections.join("\n")}
             ${this.hasInteractiveComponents() ? '<script src="/client.js"></script>' : ""}
           </body>
         </html>`;
     }
   }
   ```

### Phase 3: Implement Component Rendering & Styling

1. Direct component access from ViewRegistry:

   ```typescript
   async renderSection(section: SectionDefinition): Promise<string> {
     const template = this.context.viewRegistry.getViewTemplate(section.template);
     const Component = template.renderers.web as ComponentType;

     // Get content (from entities or static)
     const content = await this.getContent(section);

     // Render with Preact
     const html = render(<Component {...content} />);

     // Wrap interactive components for hydration
     if (template.interactive) {
       return `<div data-hydrate="${template.name}" data-props='${JSON.stringify(content)}'>${html}</div>`;
     }

     return html;
   }
   ```

2. Process Tailwind CSS:

   ```typescript
   import { createProcessor } from 'tailwindcss/lib/cli';

   async processStyles(): Promise<string> {
     // Read global.css with Tailwind directives
     const input = await readFile('./styles/global.css', 'utf8');

     // Process with Tailwind (v4 API)
     const processor = await createProcessor({
       content: ['./dist/**/*.html'], // Scan generated HTML
     });

     const result = await processor.process(input);
     return result.css;
   }
   ```

### Phase 4: Optional Client-Side Hydration

1. Bundle interactive components only:

   ```typescript
   async bundleClientCode() {
     const interactive = this.getInteractiveTemplates();

     // Generate hydration script
     const clientCode = `
       import { hydrate } from 'preact';
       ${interactive.map(t => `import { ${t.name} } from '${t.source}';`).join('\n')}

       // Hydrate marked elements
       document.querySelectorAll('[data-hydrate]').forEach(el => {
         const Component = { ${interactive.map(t => t.name).join(', ')} }[el.dataset.hydrate];
         const props = JSON.parse(el.dataset.props);
         hydrate(<Component {...props} />, el);
       });
     `;

     // Bundle with esbuild/rollup
     await this.bundle(clientCode);
   }
   ```

### Phase 5: Content Management Tools

Implement as plugin tools in site-builder-plugin.

### Phase 6: Build Process & Output

1. Complete build flow:

   ```typescript
   async build(options: BuildOptions) {
     // 1. Render all pages
     const pages = await this.renderAllPages();

     // 2. Process Tailwind CSS
     const styles = await this.processStyles();
     await writeFile(`${outputDir}/styles.css`, styles);

     // 3. Bundle interactive components (if any)
     if (this.hasInteractiveComponents()) {
       const clientBundle = await this.bundleClientCode();
       await writeFile(`${outputDir}/client.js`, clientBundle);
     }

     // 4. Write HTML files
     for (const { path, html } of pages) {
       await writeFile(`${outputDir}${path}/index.html`, html);
     }
   }
   ```

### Phase 7: Cleanup

1. Remove `packages/webserver-template/` (Astro template)
2. Remove Astro dependencies
3. Update documentation
4. Simplify build process

## Benefits

1. **Extreme Simplicity**

   - No Astro complexity
   - No import/export gymnastics
   - Direct component access via function references
   - Everything runs in one process

2. **Unified Template Structure**

   - Each template exports all necessary data in one object
   - Includes component, schema, formatter, and AI prompt
   - Site-builder transforms to ViewTemplate format as needed
   - Clear separation between content definition and registration

3. **No Deployment Issues**

   - Output is just HTML/CSS/JS files
   - No workspace dependencies
   - Can be served from anywhere
   - No npm packages to manage

4. **True Plugin Independence**

   - Plugins are self-contained
   - Components stay with their plugins
   - No separate content packages

5. **Modern Styling with Tailwind**

   - Use Tailwind v4 with just a global.css file
   - No config file needed
   - Automatic purging of unused styles
   - Components use Tailwind classes

6. **Flexibility**

   - Optional client-side hydration
   - Progressive enhancement
   - Full control over output

7. **Clean App Configuration**

   - Apps control which templates to use
   - Site-builder plugin remains generic
   - Easy to swap different template sets
   - No need for separate registration logic

## Example Usage

### Plugin Registration

```typescript
// In notes-plugin
import { NoteCard, NotesListing, NoteEditor } from "./components";

// Static component
context.viewRegistry.registerViewTemplate({
  name: "note-card",
  schema: noteCardSchema,
  renderers: {
    web: NoteCard, // Function reference!
  },
  interactive: false,
});

// Interactive component
context.viewRegistry.registerViewTemplate({
  name: "note-editor",
  schema: noteEditorSchema,
  renderers: {
    web: NoteEditor,
  },
  interactive: true, // Will be hydrated on client
});

// Register a route
context.viewRegistry.registerRoute({
  path: "/notes",
  title: "My Notes",
  sections: [
    {
      id: "notes-list",
      template: "notes-listing",
      contentEntity: { entityType: "note" },
    },
  ],
});
```

### Site Builder Usage

```typescript
// Direct access to components
const template = viewRegistry.getViewTemplate('note-card');
const Component = template.renderers.web;  // The actual function!

// Render it
const html = render(<Component {...props} />);

// Output: <div class="note-card">...</div>
```

### App Configuration

```typescript
// In test-brain or other apps
import { templates, routes } from "@brains/default-site-content";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";

// Configure the app with plugins
const app = App.create({
  name: "test-brain",
  plugins: [
    // Site builder with default content
    siteBuilderPlugin({
      outputDir: process.env["WEBSITE_OUTPUT_DIR"],
      workingDir: process.env["WEBSITE_WORKING_DIR"],
      templates, // Pass templates from default-site-content
      routes, // Pass routes from default-site-content
    }),
    // No longer need DefaultSitePlugin!
  ],
});
```

## File Operations

### Create

1. `packages/default-site-content/` - New content package (from default-site-plugin)

### Update

1. `packages/types/src/views.ts` - Add `interactive` field to ViewTemplate
2. `packages/site-builder-plugin/` - Replace Astro with Preact SSR

### Transform

1. `packages/default-site-plugin/` → `packages/default-site-content/` (convert to pure content package)

### Delete

1. `packages/webserver-template/` - No longer needed (was Astro template)
2. Astro-related dependencies from package.json files

### Archive

1. All Astro-related documentation → `docs/archive/`

## Success Criteria

- [ ] Site builder uses Preact SSR directly
- [ ] Components are registered as function references
- [ ] Static HTML/CSS/JS output works
- [ ] No deployment dependencies
- [ ] Optional hydration for interactive components
- [ ] All tests pass
- [ ] Documentation updated

## Current Status

- [x] Plan created and approved
- [x] Architecture evolved through discussion
- [x] Final approach: Pure Preact SSR (no Astro)
- [x] Tailwind CSS integration added
- [x] Default site as content package (not plugin)
- [ ] Phase 1: Update Type Definitions
- [ ] Phase 2: Transform Default Site to Content Package
- [ ] Phase 3: Transform Site Builder Plugin
- [ ] Phase 4: Implement Component Rendering & Styling
- [ ] Phase 5: Content Management Tools
- [ ] Phase 6: Build Process & Output
- [ ] Phase 7: Cleanup

## Key Insights from Discussion

1. **Deployment killed the import approach** - Can't use workspace imports on server
2. **Astro adds unnecessary complexity** - We can do SSR ourselves
3. **Function references are the simplest** - Direct access, no imports
4. **Hydration can be added later** - Start with pure SSR
5. **Convention-based queries** - Reduce boilerplate by inferring contentEntity structure

This final architecture is the simplest possible solution that meets all requirements.

## Future Improvements

### TODO: Move Template Registration to Shell

Currently, the site-builder plugin handles registration of default templates. This functionality should eventually move to the shell itself:

- Shell could auto-discover and register templates from known packages
- Reduce boilerplate in plugins
- Make default templates available to all plugins

This refactoring should be done after the current site-builder implementation is complete and working.

### TODO: Support Default Content in Routes

Add support for optional default content directly in route definitions:

```typescript
{
  id: "hero",
  template: "hero",
  content: {  // Optional default content
    headline: "Build Your Second Brain",
    subheadline: "Capture, organize, and connect your knowledge",
    ctaText: "Get Started",
    ctaLink: "#features"
  }
}
```

This would allow static sites to embed content directly in routes while still supporting dynamic content from the database when needed.
