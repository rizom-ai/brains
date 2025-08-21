# Content Management Architecture

## Executive Summary

This document outlines the architectural refactoring to expand `shell/content-generator` into `shell/content-service` - a shell-level service that provides content coordination and common utilities. Plugins can implement the `IContentProvider` interface to register as content providers, with site-builder serving as both a content provider and static site builder.

## Current State Analysis

### Architecture Overview

The current content management system is distributed across multiple components:

1. **ContentManager** (`shared/content-management/`)
   - Shared package, not a plugin
   - Currently focused on site-specific content (preview/production)
   - Tightly coupled to website concepts (routes, sections)

2. **Site-builder Plugin** (`plugins/site-builder/`)
   - Owns site-content-preview and site-content-production entity types
   - Uses ContentManager for content operations
   - Handles static site generation, templates, and builds
   - 568 lines in main plugin file (needs refactoring)

3. **Content-generator Service** (`shell/content-generator/`)
   - Shell service with job handlers
   - ContentGenerationJobHandler
   - ContentDerivationJobHandler
   - Registered directly in Shell initialization

### Identified Issues

#### 1. Limited Scope

- Current ContentManager only handles website content
- No support for other content types (documents, emails, reports, API responses, etc.)
- Assumes preview/production workflow which doesn't apply to all content

#### 2. Tight Coupling

- ContentManager is tightly coupled to site-specific concepts
- Site-builder plugin has dual responsibilities: content management AND site building
- Direct dependencies between components make testing and reuse difficult

#### 3. Ownership Confusion

- Entity types owned by site-builder but used for general content
- Job handlers in shell instead of plugin ownership
- Shared package creates unclear boundaries

## Proposed Architecture

### Overview

Expand shell/content-generator into shell/content-service that coordinates content providers. Plugins can be content providers, content consumers, or both:

```
                    ┌─────────────────────────────┐
                    │  shell/content-service      │
                    │     (shell service)          │
                    │                              │
                    │  • Provider registry         │
                    │  • Content coordination      │
                    │  • Common utilities          │
                    │  • Event orchestration       │
                    │  • Query routing             │
                    └──────────┬──────────────────┘
                               │
                    Plugins register as providers
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
┌───▼──────────────┐  ┌────────▼─────────┐  ┌────────────▼─────┐
│ site-builder     │  │ email-plugin     │  │ docs-plugin      │
│                  │  │                  │  │                  │
│ Provider:        │  │ Provider:        │  │ Provider:        │
│ • Site content   │  │ • Email content  │  │ • Documentation  │
│ • Preview/prod   │  │ • Templates      │  │ • Articles       │
│                  │  │                  │  │                  │
│ Consumer:        │  │ Consumer:        │  │ Consumer:        │
│ • Builds sites   │  │ • Sends emails   │  │ • Generates docs │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

Note: Plugins can be providers only, consumers only, or both (like site-builder).

### Shell Service: content-service

#### Purpose

Evolve shell/content-generator into a comprehensive content coordination service that:

- Manages provider registration from plugins
- Routes content operations to appropriate providers
- Provides common utilities (template processing, markdown parsing)
- Emits unified content events
- Handles content queries through entity service

#### Structure

```
shell/content-service/  (renamed from content-generator)
├── src/
│   ├── content-service.ts       # Main service class
│   ├── core/
│   │   ├── provider-registry.ts # Manage content providers
│   │   ├── content-router.ts    # Route operations to providers
│   │   └── event-orchestrator.ts # Coordinate events
│   ├── interfaces/
│   │   └── provider.ts          # IContentProvider interface
│   ├── utilities/
│   │   ├── template-engine.ts   # Common template processing
│   │   ├── markdown-utils.ts    # Markdown parsing/generation
│   │   └── format-converter.ts  # Format transformations
│   └── index.ts                 # Public API exports
```

#### Key Interfaces

```typescript
// Interface that content provider plugins must implement
export interface IContentProvider {
  readonly id: string; // Unique provider ID
  readonly name: string; // Human-readable name
  readonly version: string; // Provider version

  // Content type information
  getContentTypes(): ContentTypeDefinition[];

  // Core operation - content generation
  generate(request: GenerateRequest): Promise<Content>;
  
  // Optional operations (to be added as needed)
  // transform?(content: Content, format: string): Promise<Content>;
}

// Universal content representation
export interface Content {
  id: string;
  provider: string; // Which provider owns this
  type: string; // Provider-specific type
  data: unknown; // Provider-specific data
  metadata: {
    created: string;
    updated: string;
    version?: string;
    [key: string]: unknown; // Provider-specific metadata
  };
}
```

#### Service Implementation

```typescript
export class ContentService implements IContentService {
  private providers = new Map<string, IContentProvider>();

  constructor(
    private entityService: IEntityService,
    private messageBus: IMessageBus,
    private logger: Logger
  ) {}

  // Provider registration
  registerProvider(provider: IContentProvider): void {
    this.providers.set(provider.id, provider);
    this.messageBus.emit("content:provider:registered", {
      id: provider.id,
      name: provider.name,
    });
    this.logger.info(`Content provider registered: ${provider.id}`);
  }

  // Content generation - routes to appropriate provider
  async generate(request: { provider: string; type: string; data: any }): Promise<Content> {
    const provider = this.providers.get(request.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${request.provider}`);
    }
    
    const content = await provider.generate(request);
    
    // Emit unified event
    this.messageBus.emit("content:generated", {
      provider: request.provider,
      content
    });
    
    return content;
  }

  // Query using entity service (content is stored as entities)
  async query(filter: ContentQueryFilter): Promise<Content[]> {
    // Use entity service for queries since content is stored as entities
    const entities = await this.entityService.searchEntities(filter);
    return entities.map(e => this.entityToContent(e));
  }
  
  // Common utilities available to all providers
  getUtilities(): ContentUtilities {
    return {
      templateEngine: this.templateEngine,
      markdownUtils: this.markdownUtils,
      formatConverter: this.formatConverter
    };
  }
}
```

### Plugin: site-builder (Provider + Consumer)

Site-builder acts as both a content provider (for site content) AND a consumer (for building static sites):

#### Structure

```
plugins/site-builder/
├── src/
│   ├── plugin.ts                # Main plugin class
│   ├── entities/
│   │   ├── site-content-preview.ts
│   │   └── site-content-production.ts
│   ├── providers/
│   │   └── site-content-provider.ts  # Implements IContentProvider
│   ├── handlers/
│   │   ├── content-generation.ts     # Handle content generation jobs
│   │   ├── content-derivation.ts     # Preview/production workflow
│   │   └── site-build.ts             # Site building jobs
│   ├── lib/
│   │   ├── site-builder.ts          # Static site generation
│   │   ├── route-manager.ts         # Route-specific logic
│   │   └── section-manager.ts       # Section handling
│   └── commands/
│       ├── generate.ts              # Generate content
│       ├── promote.ts               # Preview→Production
│       └── build.ts                 # Build static site
```

#### Implementation

```typescript
export class SiteBuilderPlugin extends ServicePlugin {
  private provider: SiteContentProvider;
  private builder: SiteBuilder;

  async onRegister(context: ServicePluginContext) {
    // Register entity types
    context.registerEntityType('site-content-preview', ...);
    context.registerEntityType('site-content-production', ...);

    // Register job handlers (moved from shell)
    context.registerJobHandler('site:generate', new ContentGenerationHandler());
    context.registerJobHandler('site:derive', new ContentDerivationHandler());
    context.registerJobHandler('site:build', new SiteBuildHandler());

    // Create and register provider
    this.provider = new SiteContentProvider(context);
    const contentService = context.getService('content-service');
    contentService.registerProvider(this.provider);

    // Listen for content events to trigger builds
    contentService.on('content:generated', async (event) => {
      if (event.provider === 'site') {
        await this.queueBuild(event.content);
      }
    });

    // Register commands
    context.registerCommand({
      name: 'generate',
      handler: this.generateContent.bind(this)
    });
    context.registerCommand({
      name: 'build',
      handler: this.buildSite.bind(this)
    });
  }
}

class SiteContentProvider implements IContentProvider {
  id = 'site';
  name = 'Website Content';
  version = '1.0.0';

  getContentTypes() {
    return [
      { id: 'page', name: 'Web Page', schema: pageSchema },
      { id: 'component', name: 'Page Component', schema: componentSchema }
    ];
  }

  async generate(request: GenerateRequest): Promise<Content> {
    // Site-specific generation logic
    // Routes, sections, templates, etc.
  }
}
```

### Example: Email Plugin (Future)

An example of a plugin that's both provider and consumer (like site-builder):

```typescript
export class EmailPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // Register email-specific entity types
    context.registerEntityType('email-template', ...);
    context.registerEntityType('email-campaign', ...);

    // Register as content provider
    const contentService = context.getService('content-service');
    contentService.registerProvider(new EmailContentProvider());

    // Also consume content (send emails)
    context.registerCommand({
      name: 'send-campaign',
      handler: this.sendCampaign.bind(this)
    });
  }
}

class EmailContentProvider implements IContentProvider {
  id = 'email';
  name = 'Email Content';
  version = '1.0.0';

  getContentTypes() {
    return [
      { id: 'template', name: 'Email Template', schema: templateSchema },
      { id: 'campaign', name: 'Email Campaign', schema: campaignSchema }
    ];
  }

  async generate(request: GenerateRequest): Promise<Content> {
    // Email-specific generation
    // Templates, personalization, etc.
  }
}
```

## Plugin Interactions

### Registration Flow

```
1. Shell initializes content-service
2. site-builder plugin loads
3. site-builder registers as 'site' content provider with content-service
4. site-builder registers job handlers for site-specific operations
5. site-builder subscribes to content events for rebuild triggers
```

### Content Generation Flow

```
1. User: /generate type=page
2. site-builder command handler receives request
3. site-builder queues 'site:generate' job
4. ContentGenerationHandler processes job
5. Handler uses content-service utilities and provider
6. content-service emits 'content:generated' event
7. site-builder receives event, queues 'site:build' job
```

### Cross-Provider Query

```
1. User: /search term="dashboard"
2. Command routes to content-service
3. content-service uses entity service to search all content entities
4. Entity service returns results from all content types
5. content-service formats and returns aggregated results
```

Note: Since content is stored as entities, queries leverage the existing entity service rather than querying providers directly.

## Benefits

### Architectural Benefits

1. **True Decoupling**
   - Content providers are independent plugins
   - No hard dependencies between providers
   - Content-management is just coordination

2. **Plugin Ecosystem**
   - Anyone can create content provider plugins
   - Providers can be added/removed independently
   - Mix and match providers as needed

3. **Clear Boundaries**
   - Each plugin has single responsibility
   - Provider plugins own their domain
   - content-management just orchestrates

### Development Benefits

1. **Independent Development**
   - Teams can own provider plugins
   - No coordination needed between providers
   - Parallel development possible

2. **Easy Testing**
   - Test providers in isolation
   - Mock content-management interface
   - Simple provider interface to implement

3. **Gradual Migration**
   - Start with site-content provider
   - Add more providers over time
   - No big-bang migration needed

## Implementation Plan

### Phase 1: Refactor shell/content-generator → shell/content-service

1. Rename content-generator to content-service
2. Add provider registry functionality
3. Extract common utilities (template engine, markdown utils)
4. Implement IContentProvider interface
5. Add event orchestration through message bus

### Phase 2: Refactor site-builder Plugin

1. Move job handlers from shell to site-builder
   - ContentGenerationJobHandler → site-builder/handlers
   - ContentDerivationJobHandler → site-builder/handlers
2. Implement SiteContentProvider class
3. Register provider with content-service
4. Keep existing entity types and build functionality
5. Update commands to use new architecture

### Phase 3: Update Shell Initialization

1. Initialize content-service instead of content-generator
2. Remove job handler registrations (moved to site-builder)
3. Ensure content-service is available before plugins load
4. Update service dependencies

### Phase 4: Testing & Validation

1. Test provider registration
2. Verify job handler migration
3. Test content generation flow
4. Validate event emissions
5. Ensure backward compatibility

## Future Provider Plugins

Plugins can implement IContentProvider to add new content types:

- **documentation-plugin**: Knowledge base, technical docs (provider + viewer)
- **email-plugin**: Templates, campaigns (provider + sender)
- **report-plugin**: Analytics, business reports (provider + exporter)
- **api-plugin**: API documentation, schemas (provider + generator)
- **notification-plugin**: Alerts, notifications (provider + dispatcher)
- **form-plugin**: Dynamic forms, surveys (provider + handler)

## Open Questions

1. **Provider Dependencies**: Can one provider depend on another?
2. **Provider Discovery**: Should we have a provider marketplace/registry?
3. **Content Migration**: How to migrate content between providers?
4. **Provider Composition**: Can providers compose/extend each other?
5. **Performance**: How to optimize cross-provider queries?
