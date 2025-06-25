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

### Phase 4: Enable Shell to Register Its Own Templates

Allow the shell to register built-in templates (like dashboard) while keeping plugin-based registration for other templates.

1. **Shell registers its own templates during initialization**:

   ```typescript
   // In shell.ts initialization
   private async registerShellTemplates() {
     // Import shell's built-in templates
     const { dashboardTemplate } = await import("./site-templates/dashboard");

     // Register dashboard template
     this.viewRegistry.registerViewTemplate({
       name: dashboardTemplate.name,
       schema: dashboardTemplate.schema,
       renderers: { web: dashboardTemplate.component },
       interactive: dashboardTemplate.interactive,
     });

     // Register dashboard route
     this.viewRegistry.registerRoute({
       id: "dashboard",
       path: "/dashboard",
       title: "System Dashboard",
       description: "Monitor your Brain system statistics",
       sections: [{
         id: "main",
         template: "dashboard",
       }],
     });
   }
   ```

2. **Dashboard component location**:

   - `packages/shell/src/site-templates/dashboard/` - Dashboard component
   - Shell owns system-level templates

3. **Site-builder plugin continues to**:

   - Import and register default-site-content templates (hero, features, etc.)
   - Provide template registration via plugin context
   - Other plugins can still register their own templates

4. **Template sources**:
   - Shell: System templates (dashboard, future admin panels)
   - Site-builder plugin: Default site content (marketing pages)
   - Other plugins: Domain-specific templates (notes, tasks, etc.)

### Phase 5: Component Rendering & Styling

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

### Phase 6: Selective Hydration with Interactive Dashboard

#### Self-Hydration Architecture

Our selective hydration approach uses self-contained components that handle their own hydration:

**Key Design Decisions:**

1. **Static rendering unchanged**: Components work as regular functions for SSR
2. **Self-contained hydration**: Components include their own hydration logic inline
3. **No external bundles**: No separate JavaScript files or complex build processes
4. **Generalizable pattern**: Universal approach that works for any interactive component

**How It Works:**

1. **Build Phase**:

   - Site builder renders static HTML using component functions
   - Interactive components include inline hydration scripts during SSR
   - Hydration manager only adds Preact dependencies to HTML head

2. **Client Phase**:
   - Browser loads Preact dependencies
   - Component hydration scripts execute inline
   - Each component hydrates itself independently

**Self-Hydration Pattern:**

```typescript
// Universal pattern for any interactive component
export const InteractiveComponent = (data: ComponentData): VNode => {
  const isBrowser = typeof window !== 'undefined';

  if (!isBrowser) {
    // SSR: render static version with hydration script
    return (
      <div className="component-container" data-component="template-name">
        {/* Static content */}
        <ComponentContent {...data} />

        {/* Self-hydration script */}
        <script type="module" dangerouslySetInnerHTML={{
          __html: `
            import { hydrate } from 'https://esm.sh/preact@10';
            import { InteractiveComponent } from './compiled-component.js';

            const container = document.querySelector('[data-component="template-name"]');
            const data = ${JSON.stringify(data)};

            hydrate(<InteractiveComponent {...data} />, container);
          `
        }} />
      </div>
    );
  }

  // Browser: use hooks for interactivity
  const [state, setState] = useState(initialState);
  return <InteractiveComponentContent {...data} state={state} setState={setState} />;
};
```

**Generalizable Helper:**

```typescript
// Future enhancement: Universal hydration helper
function createSelfHydration(templateName: string, data: any) {
  return (
    <script type="module" dangerouslySetInnerHTML={{
      __html: `
        import { autoHydrate } from '/hydration-utils.js';
        autoHydrate('${templateName}', ${JSON.stringify(data)});
      `
    }} />
  );
}

// Usage in any component:
{createSelfHydration('shell:dashboard', data)}
```

**Benefits:**

- **Simpler architecture**: No complex bundle collection system
- **Self-contained**: Each component manages its own hydration
- **Scalable**: Pattern works for unlimited number of components
- **Maintainable**: Hydration logic co-located with component code
- **Generalizable**: Same pattern works for any interactive component

#### Proof of Concept: Interactive Dashboard Component

Create a dashboard that demonstrates selective hydration:

1. **Dashboard Component** (`packages/shell/src/site-templates/dashboard/`)

   ```typescript
   // Static data embedded at build time
   interface DashboardData {
     entityStats: { type: string; count: number }[];
     recentEntities: { id: string; type: string; title: string; created: string }[];
     buildInfo: { timestamp: string; version: string };
   }

   export const DashboardWidget = ({ data }: { data: DashboardData }) => {
     const [sortBy, setSortBy] = useState<'type' | 'count'>('count');
     const [showDetails, setShowDetails] = useState(false);
     const [filter, setFilter] = useState('');

     // Client-side sorting and filtering of static data
     const sortedStats = useMemo(() => {
       return [...data.entityStats]
         .filter(s => s.type.toLowerCase().includes(filter.toLowerCase()))
         .sort((a, b) =>
           sortBy === 'count' ? b.count - a.count : a.type.localeCompare(b.type)
         );
     }, [data.entityStats, sortBy, filter]);

     return (
       <div className="dashboard-widget p-6 bg-theme-subtle rounded-lg">
         <h2 className="text-2xl font-bold mb-4">System Dashboard</h2>

         {/* Interactive controls */}
         <div className="mb-4 flex gap-4">
           <input
             type="text"
             placeholder="Filter types..."
             value={filter}
             onChange={(e) => setFilter(e.target.value)}
             className="px-3 py-2 border rounded"
           />
           <button
             onClick={() => setSortBy(sortBy === 'count' ? 'type' : 'count')}
             className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-dark"
           >
             Sort by {sortBy === 'count' ? 'Type' : 'Count'}
           </button>
           <button
             onClick={() => setShowDetails(!showDetails)}
             className="px-4 py-2 bg-theme rounded border hover:bg-theme-subtle"
           >
             {showDetails ? 'Hide' : 'Show'} Details
           </button>
         </div>

         {/* Entity statistics */}
         <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
           {sortedStats.map(stat => (
             <div key={stat.type} className="bg-theme p-4 rounded">
               <h3 className="font-semibold">{stat.type}</h3>
               <p className="text-2xl font-bold text-brand">{stat.count}</p>
             </div>
           ))}
         </div>

         {/* Recent entities (shown when details enabled) */}
         {showDetails && (
           <div className="mt-6">
             <h3 className="text-lg font-semibold mb-3">Recent Entities</h3>
             <ul className="space-y-2">
               {data.recentEntities.map(entity => (
                 <li key={entity.id} className="bg-theme p-3 rounded">
                   <span className="font-medium">{entity.title}</span>
                   <span className="text-sm text-theme-muted ml-2">({entity.type})</span>
                 </li>
               ))}
             </ul>
           </div>
         )}

         <div className="mt-6 text-sm text-theme-muted">
           Built: {new Date(data.buildInfo.timestamp).toLocaleString()}
         </div>
       </div>
     );
   };
   ```

2. **Dashboard Formatter** (generates static data at build time)

   ```typescript
   export class DashboardFormatter {
     async format(context: FormatterContext): Promise<DashboardData> {
       const entityService = context.shell.getEntityService();

       // Get current counts (at build time)
       const types = await entityService.listEntityTypes();
       const entityStats = await Promise.all(
         types.map(async (type) => ({
           type,
           count: await entityService.countByType(type),
         })),
       );

       return {
         entityStats,
         recentEntities: await entityService.list({ limit: 10 }),
         buildInfo: {
           timestamp: new Date().toISOString(),
           version: "1.0.0",
         },
       };
     }
   }
   ```

3. **Dashboard Template Registration**

   ```typescript
   export const dashboardTemplate: TemplateDefinition = {
     name: "dashboard",
     description: "Interactive system dashboard",
     schema: DashboardDataSchema,
     component: DashboardWidget,
     formatter: new DashboardFormatter(),
     prompt: "", // Not AI generated
     interactive: true, // KEY: Marks for hydration
   };
   ```

4. **Simplified Hydration Manager** (in site-builder-plugin)

   ```typescript
   export class HydrationManager {
     private viewRegistry: ViewRegistry;
     private outputDir: string;

     async processRoutes(routes: RouteDefinition[]): Promise<string[]> {
       // Find all interactive components
       const interactiveComponents = new Set<string>();

       for (const route of routes) {
         for (const section of route.sections) {
           const template = this.viewRegistry.getViewTemplate(section.template);
           if (template?.interactive) {
             interactiveComponents.add(section.template);
           }
         }
       }

       return Array.from(interactiveComponents);
     }

     async updateHTMLFiles(routes: RouteDefinition[]): Promise<void> {
       for (const route of routes) {
         const hasInteractive = route.sections.some((section) => {
           const template = this.viewRegistry.getViewTemplate(section.template);
           return template?.interactive;
         });

         if (!hasInteractive) continue;

         const htmlPath =
           route.path === "/"
             ? join(this.outputDir, "index.html")
             : join(this.outputDir, route.path, "index.html");

         // Only add Preact dependencies if not already present
         let html = await fs.readFile(htmlPath, "utf8");

         if (!html.includes("preact.min.js")) {
           const preactScripts = `
   <script src="https://unpkg.com/preact@10/dist/preact.min.js"></script>
   <script src="https://unpkg.com/preact@10/hooks/dist/hooks.umd.js"></script>
   <script>
    window.preact = {
      h: preact.h,
      hydrate: preact.hydrate,
      useState: preactHooks.useState,
      useMemo: preactHooks.useMemo
    };
   </script>`;
           html = html.replace("</head>", `${preactScripts}</head>`);
           await fs.writeFile(htmlPath, html, "utf8");
         }
       }
     }
   }
   ```

#### Success Criteria

1. ✅ Dashboard renders with static data at build time
2. 🔄 Interactive features work after self-hydration (sorting, filtering, toggling)
3. ✅ Other components remain static (no unnecessary JavaScript)
4. ✅ Hydration is selective - only marked components
5. ✅ Performance optimized - no external bundle files
6. ✅ Works outside monorepo context (no path dependencies)
7. ✅ Components are self-contained and manage own hydration
8. ✅ Static rendering flow remains unchanged
9. 🔄 Pattern is generalizable to any interactive component

### Phase 7: Content Management Tools

Implement comprehensive content management workflow with refined entity architecture and CLI tools.

#### Entity Architecture Refinements

**Deterministic Entity IDs:**

```typescript
// Replace random IDs with predictable structure
id: `${entityType}:${page}:${section}`;
// Example: "site-content-preview:landing:hero"
```

**Separate Entity Types:**

```typescript
// Split environments into distinct entity types
entityType: "site-content-preview"; // For draft content
entityType: "site-content-production"; // For live content

// Benefits:
// - Clean file system separation (/entities/site-content-preview/, /entities/site-content-production/)
// - Simple queries without environment filtering
// - Clear conceptual separation of draft vs published content
```

**Simplified Schemas:**

```typescript
// Remove environment field, simplify to core fields
export const siteContentPreviewSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content-preview"),
  page: z.string(),
  section: z.string(),
});

export const siteContentProductionSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content-production"),
  page: z.string(),
  section: z.string(),
  promotionMetadata: z
    .object({
      promotedAt: z.string(),
      promotedBy: z.string().optional(),
      promotedFrom: z.string(), // Preview entity ID
    })
    .optional(),
});
```

#### SiteContent Management Module

**Module Structure within Site-Builder Plugin:**

```
packages/site-builder-plugin/src/
├── content-management/
│   ├── index.ts                    # Export all content management APIs
│   ├── manager.ts                  # SiteContentManager class
│   ├── types.ts                    # SiteContent union type and interfaces
│   ├── operations/                 # Individual operations
│   │   ├── promote.ts             # Promotion logic
│   │   ├── rollback.ts            # Rollback logic
│   │   └── regenerate.ts          # Regeneration logic
│   └── utils/                     # Helper utilities
│       ├── id-generator.ts        # Deterministic ID generation
│       └── comparator.ts          # Content comparison
```

**SiteContent Union Type:**

```typescript
// Unified type for both preview and production
export type SiteContent = SiteContentPreview | SiteContentProduction;

// Type guards for safe discrimination
export function isPreviewContent(
  content: SiteContent,
): content is SiteContentPreview;
export function isProductionContent(
  content: SiteContent,
): content is SiteContentProduction;
```

**SiteContentManager Class:**

```typescript
export class SiteContentManager {
  constructor(private entityService: EntityService, private logger?: Logger)

  // Content lifecycle operations
  async promote(options: PromoteOptions): Promise<PromoteResult>
  async rollback(options: RollbackOptions): Promise<RollbackResult>
  async regenerate(options: RegenerateOptions): Promise<RegenerateResult>

  // Utility operations
  async compare(page: string, section: string): Promise<ContentComparison>
  async exists(page: string, section: string, type: 'preview' | 'production'): Promise<boolean>
  generateId(type: SiteContentEntityType, page: string, section: string): string
}
```

#### Content Management Tools

**1. promote-content Tool**

Promotes preview content to production environment via entity copying.

```typescript
// Input schema
{
  page?: string,        // Optional: specific page filter
  section?: string,     // Optional: specific section filter
  sections?: string[]   // Optional: batch promote multiple sections
  dryRun?: boolean     // Optional: preview changes without executing
}

// Operation: Simple entity copy with ID transformation
// From: "site-content-preview:landing:hero"
// To:   "site-content-production:landing:hero"
```

**Logic:**

- Query preview entities matching filters
- For each preview entity, create corresponding production entity
- Add promotion metadata (timestamp, source entity ID)
- Return summary of promoted content
- Support dry-run mode for safety

**2. rollback-content Tool**

Removes production content, reverting to preview-only state.

```typescript
// Input schema
{
  page?: string,        // Optional: specific page filter
  section?: string,     // Optional: specific section filter
  sections?: string[]   // Optional: batch rollback multiple sections
  dryRun?: boolean     // Optional: preview changes without executing
}

// Operation: Delete production entities
// Result: Only preview content remains (unpublished state)
```

**Logic:**

- Query production entities matching filters
- Delete matching production entities
- Preview content remains untouched
- Return summary of rolled back content
- Support dry-run mode for safety

**3. regenerate-content Tool**

Generates fresh content with three operational modes.

```typescript
// Input schema
{
  page: string,                                    // Required: target page
  section?: string,                               // Optional: specific section
  environment?: "preview" | "production" | "both" // Optional: target environment (default: preview)
  mode: "leave" | "new" | "with-current"         // Required: regeneration mode
  dryRun?: boolean                               // Optional: preview changes without executing
}

// Three modes:
// 1. "leave" - No regeneration, preserve existing content
// 2. "new" - Fresh AI generation, ignore current content
// 3. "with-current" - Use existing content as context for AI generation
```

**Logic:**

- Mode "leave": No-op, return current content status
- Mode "new": Delete existing content, generate fresh using AI templates
- Mode "with-current": Pass existing content to AI as context, generate improved version
- Support targeting specific environments or both
- Return summary of regenerated content

#### Implementation Approach

**Module-Based Architecture:**

- **Clean separation within plugin**: Content management operations grouped in dedicated module
- **SiteContentManager handles lifecycle**: Promote, rollback, regenerate operations encapsulated
- **Plugin tools as thin wrappers**: Tools delegate to SiteContentManager methods
- **Unified SiteContent type**: Single type works with both preview and production entities

**Tool Design Principles:**

- **CLI-first**: Efficient tools for technical users
- **Section-level granularity**: Operations work on complete sections (no partial updates)
- **One-click operations**: Direct execution with optional dry-run safety
- **Separation of concerns**: Tools focus on content, deployment is separate layer
- **Infrequent update optimization**: Prioritize thoroughness over speed

**Plugin Integration:**

```typescript
// In SiteBuilderPlugin
import { SiteContentManager } from './content-management';

export class SiteBuilderPlugin {
  private siteContentManager: SiteContentManager;

  async onRegister(context: PluginContext) {
    this.siteContentManager = new SiteContentManager(
      context.entityService,
      this.logger?.child('SiteContentManager')
    );
  }

  // Tools delegate to manager
  createTool('promote-content', ..., async (input) => {
    return this.siteContentManager.promote(input);
  })
}
```

**Entity Service Integration:**

```typescript
// Promotion example
const previewEntity = await entityService.getEntity(
  "site-content-preview:landing:hero",
);
const productionEntity = {
  ...previewEntity,
  id: "site-content-production:landing:hero",
  entityType: "site-content-production",
  promotionMetadata: {
    promotedAt: new Date().toISOString(),
    promotedFrom: previewEntity.id,
  },
};
await entityService.createEntity(productionEntity);
```

**File System Results:**

```
/entities/
  site-content-preview/
    landing-hero.md         # Draft content
    landing-features.md     # Draft content
  site-content-production/
    landing-hero.md         # Published content (promoted from preview)
```

#### Benefits

1. **Predictable Entity Structure**

   - Deterministic IDs enable direct entity access
   - No complex relationship tracking needed
   - Simple tooling and debugging

2. **Clean Separation**

   - Preview and production content physically separated
   - Clear conceptual model (draft vs published)
   - Independent entity lifecycles

3. **Simple Operations**

   - Promotion is entity copy operation
   - Rollback is entity deletion
   - No complex state management

4. **Flexible Content Generation**

   - Three regeneration modes support different workflows
   - Preserve user edits unless explicitly requested
   - AI can build on existing content for improvements

5. **Extensible Architecture**

   - Web UI can easily layer on top of CLI tools
   - Each tool has clean, focused responsibility
   - Good design naturally supports future enhancements

6. **Cohesive Plugin Architecture**
   - Content management operations grouped in dedicated module
   - Clear separation between site building and content lifecycle
   - Easy to test content operations independently
   - Future extraction to separate package remains simple

### Phase 8: Build Process & Output

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

### Phase 9: Cleanup

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
- [x] Phase 1: Update Type Definitions
- [x] Phase 2: Transform Default Site to Content Package
- [x] Phase 3: Transform Site Builder Plugin
- [x] Phase 4: Enable Shell to Register Its Own Templates
- [x] Phase 5: Component Rendering & Styling
- [x] **Phase 6: Selective Hydration with Interactive Dashboard**
  - [x] External hydration bundle system removed
  - [x] Self-hydration architecture implemented
  - [x] Simplified HydrationManager (Preact scripts only)
  - [x] Dashboard component with SSR/browser wrapper pattern
  - [x] Proof of concept: JSX self-hydration (completed)
- [ ] **Phase 7: Content Management Tools** (planned, ready to implement)
  - [x] Entity architecture design (deterministic IDs, separate entity types)
  - [x] Tool specifications documented (promote/rollback/regenerate with three modes)
  - [ ] Update entity schemas (site-content-preview, site-content-production)
  - [ ] Implement promote-content tool (copy preview to production)
  - [ ] Implement rollback-content tool (delete production content)
  - [ ] Implement regenerate-content tool (leave/new/with-current modes)
  - [ ] Update existing site-builder plugin to use new entity types
  - [ ] Test content management workflow
- [ ] Phase 8: Build Process & Output
- [ ] Phase 9: Cleanup

## Key Insights from Discussion

1. **Deployment killed the import approach** - Can't use workspace imports on server
2. **Astro adds unnecessary complexity** - We can do SSR ourselves
3. **Function references are the simplest** - Direct access, no imports
4. **Hydration can be added later** - Start with pure SSR
5. **Convention-based queries** - Reduce boilerplate by inferring contentEntity structure

This final architecture is the simplest possible solution that meets all requirements.

## Completed Improvements

### Plugin Resolution System ✅

**Status: COMPLETED** - The plugin resolution system has been fully refactored to eliminate brittle string manipulation and hardcoded assumptions:

1. **✅ Added packageName to plugin metadata**:

   ```typescript
   export const pluginMetadataSchema = z.object({
     id: z.string(),
     version: z.string(),
     description: z.string().optional(),
     dependencies: z.array(z.string()).optional(),
     packageName: z.string(), // Package name for import resolution
   });
   ```

2. **✅ Made pluginId required in ViewTemplate**:

   ```typescript
   export interface ViewTemplate<T = unknown> {
     name: string;
     schema: z.ZodType<T>;
     description?: string;
     pluginId: string; // ID of the plugin that registered this template
     renderers: {
       web?: WebRenderer<T>;
     };
     interactive: boolean;
   }
   ```

3. **✅ Updated HydrationManager with proper lookup**:

   ```typescript
   // No more brittle string manipulation:
   // const packageName = `@brains/${templateName.split(':')[0]}-plugin`;

   // Now uses proper plugin resolution:
   const plugin = this.pluginContext.getPlugin(template.pluginId);
   const packageName = plugin?.packageName;
   ```

4. **✅ Sourced metadata from package.json**:

   ```typescript
   // BasePlugin constructor now accepts package.json object
   constructor(
     id: string,
     packageJson: { name: string; version: string; description?: string },
     config: unknown,
     configSchema?: z.ZodType<TConfig>,
   )
   ```

5. **✅ CSS Processing Dependency Injection**:
   - Created `CSSProcessor` interface and `TailwindCSSProcessor` implementation
   - Added `MockCSSProcessor` for testing without external dependencies
   - Updated `StaticSiteBuilderOptions` to include optional `cssProcessor` field
   - All tests now use mock implementation for reliable testing

**Benefits Achieved**:

- ✅ No hardcoded package naming assumptions
- ✅ Supports any package naming convention
- ✅ Cleaner separation of concerns
- ✅ More maintainable and extensible
- ✅ Better testability with dependency injection
- ✅ Eliminated external tool dependencies in tests

## Future Improvements

### ✅ Template Registration in Shell - COMPLETED

**Status: COMPLETED** - Shell now properly registers its own templates as implemented in Phase 4:

```typescript
// Shell registers built-in templates during initialization
private async registerShellTemplates() {
  const { dashboardTemplate } = await import("./site-templates/dashboard");

  this.viewRegistry.registerViewTemplate({
    name: dashboardTemplate.name,
    schema: dashboardTemplate.schema,
    renderers: { web: dashboardTemplate.component },
    interactive: dashboardTemplate.interactive,
  });
}
```

**Architecture Benefits**:

- ✅ Shell owns system-level templates (dashboard, admin panels)
- ✅ Site-builder plugin handles content templates (hero, features, etc.)
- ✅ Other plugins register domain-specific templates
- ✅ Clean separation of responsibilities
- ✅ Flexible hybrid approach allows plugins to register their own templates

**Future enhancements could include**:

- Shell auto-discovering templates from configured packages
- Centralized template management
- Template marketplace/registry

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
