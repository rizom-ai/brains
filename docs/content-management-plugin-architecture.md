# Content Management Plugin Architecture

## Executive Summary

This document outlines the architectural refactoring to create a general-purpose `content-management` plugin that serves as a coordination layer for content operations. Content providers are separate plugins that register with the content management system, enabling a truly extensible and decoupled architecture.

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

Create a plugin ecosystem where content-management acts as a coordination layer, and content providers are independent plugins:

```
                    ┌─────────────────────────────┐
                    │  content-management         │
                    │      (plugin)                │
                    │                              │
                    │  • Content coordination      │
                    │  • Provider registry         │
                    │  • Common operations         │
                    │  • Event orchestration       │
                    │  • Query aggregation         │
                    └──────────┬──────────────────┘
                               │
                    Registers with & coordinates
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
┌───▼──────────────┐  ┌────────▼─────────┐  ┌────────────▼─────┐
│ site-content     │  │ email-content    │  │ document-content │
│   (plugin)       │  │   (plugin)       │  │    (plugin)      │
│                  │  │                  │  │                  │
│ • Page content   │  │ • Email templates│  │ • Knowledge base │
│ • Components     │  │ • Campaigns      │  │ • Documentation  │
│ • Site workflow  │  │ • Newsletters    │  │ • Articles       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Core Plugin: content-management

#### Purpose
Act as a coordination layer that:
- Provides a unified interface for content operations
- Manages provider registration
- Orchestrates cross-provider operations
- Aggregates queries across providers
- Emits unified content events

#### Structure
```
plugins/content-management/
├── src/
│   ├── plugin.ts                 # Main plugin class
│   ├── core/
│   │   ├── provider-registry.ts # Manage content providers
│   │   ├── content-router.ts    # Route operations to providers
│   │   ├── query-aggregator.ts  # Aggregate queries across providers
│   │   └── event-orchestrator.ts # Coordinate events
│   ├── interfaces/
│   │   ├── provider.ts          # IContentProvider interface
│   │   ├── content.ts           # Universal content types
│   │   └── operations.ts        # Operation interfaces
│   ├── handlers/
│   │   └── coordination.ts      # Cross-provider operations
│   ├── commands/
│   │   ├── list-providers.ts    # Show registered providers
│   │   ├── query.ts             # Query across providers
│   │   └── generate.ts          # Route to appropriate provider
│   └── tools/
│       └── content-tools.ts     # Universal content tools
```

#### Key Interfaces

```typescript
// Interface that content provider plugins must implement
export interface IContentProvider {
  readonly id: string;           // Unique provider ID
  readonly name: string;          // Human-readable name
  readonly version: string;       // Provider version
  
  // Capabilities declaration
  readonly capabilities: {
    generate?: boolean;
    transform?: boolean;
    workflow?: boolean;
    versioning?: boolean;
    search?: boolean;
  };
  
  // Content type information
  getContentTypes(): ContentTypeDefinition[];
  
  // Operations (all optional based on capabilities)
  generate?(request: GenerateRequest): Promise<Content>;
  transform?(content: Content, format: string): Promise<Content>;
  query?(filter: QueryFilter): Promise<Content[]>;
  validate?(content: Content): Promise<ValidationResult>;
}

// Universal content representation
export interface Content {
  id: string;
  provider: string;          // Which provider owns this
  type: string;              // Provider-specific type
  data: unknown;             // Provider-specific data
  metadata: {
    created: string;
    updated: string;
    version?: string;
    [key: string]: unknown;  // Provider-specific metadata
  };
}
```

#### Provider Registration

```typescript
export class ContentManagementPlugin extends ServicePlugin {
  private providers = new Map<string, IContentProvider>();
  
  async onRegister(context: ServicePluginContext) {
    // Register self as a service that other plugins can discover
    context.registerService('content-management', {
      registerProvider: this.registerProvider.bind(this),
      generate: this.generate.bind(this),
      query: this.query.bind(this),
      transform: this.transform.bind(this)
    });
  }
  
  registerProvider(provider: IContentProvider) {
    this.providers.set(provider.id, provider);
    this.emit('provider:registered', { 
      id: provider.id, 
      capabilities: provider.capabilities 
    });
  }
  
  async generate(request: { provider: string; type: string; data: any }) {
    const provider = this.providers.get(request.provider);
    if (!provider?.capabilities.generate) {
      throw new Error(`Provider ${request.provider} doesn't support generation`);
    }
    return provider.generate(request);
  }
  
  async query(filter: QueryFilter) {
    // Aggregate queries across providers
    const results = [];
    for (const provider of this.providers.values()) {
      if (provider.capabilities.search) {
        const providerResults = await provider.query(filter);
        results.push(...providerResults);
      }
    }
    return results;
  }
}
```

### Content Provider Plugin: site-content

This becomes a separate plugin that provides website content capabilities:

#### Structure
```
plugins/site-content/
├── src/
│   ├── plugin.ts                # Main plugin class
│   ├── entities/
│   │   ├── site-content-preview.ts
│   │   └── site-content-production.ts
│   ├── handlers/
│   │   ├── generation.ts       # Site content generation
│   │   ├── derivation.ts       # Preview/production workflow
│   │   └── promotion.ts        # Promotion operations
│   ├── lib/
│   │   ├── site-provider.ts    # Implements IContentProvider
│   │   ├── route-manager.ts    # Route-specific logic
│   │   └── section-manager.ts  # Section handling
│   └── commands/
│       ├── generate-page.ts    # Site-specific generation
│       └── promote.ts          # Preview→Production
```

#### Implementation

```typescript
export class SiteContentPlugin extends ServicePlugin {
  private provider: SiteContentProvider;
  
  async onRegister(context: ServicePluginContext) {
    // Register entity types
    context.registerEntityType('site-content-preview', ...);
    context.registerEntityType('site-content-production', ...);
    
    // Create provider
    this.provider = new SiteContentProvider(context);
    
    // Register with content-management
    const contentService = context.getService('content-management');
    if (contentService) {
      contentService.registerProvider(this.provider);
    }
    
    // Register site-specific commands
    context.registerCommand({
      name: 'generate-page',
      handler: this.generatePage.bind(this)
    });
  }
}

class SiteContentProvider implements IContentProvider {
  id = 'site';
  name = 'Website Content';
  version = '1.0.0';
  
  capabilities = {
    generate: true,
    transform: true,
    workflow: true,    // Preview/production workflow
    versioning: false,
    search: true
  };
  
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

### Content Provider Plugin: email-content (Future Example)

```typescript
export class EmailContentPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // Register email-specific entity types
    context.registerEntityType('email-template', ...);
    context.registerEntityType('email-campaign', ...);
    
    // Register with content-management
    const contentService = context.getService('content-management');
    if (contentService) {
      contentService.registerProvider(new EmailContentProvider(context));
    }
  }
}

class EmailContentProvider implements IContentProvider {
  id = 'email';
  name = 'Email Content';
  version = '1.0.0';
  
  capabilities = {
    generate: true,
    transform: true,    // HTML/text versions
    workflow: true,     // Draft/scheduled/sent
    versioning: true,   // A/B testing
    search: true
  };
  
  async generate(request: GenerateRequest): Promise<Content> {
    // Email-specific generation
    // Templates, personalization, etc.
  }
}
```

### Refactored: site-builder

Becomes purely focused on building static sites:

```typescript
export class SiteBuilderPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // Subscribe to site content events
    const contentService = context.getService('content-management');
    
    contentService.on('content:generated', async (event) => {
      if (event.provider === 'site') {
        await this.queueBuild(event.content);
      }
    });
    
    // Register build command
    context.registerCommand({
      name: 'build',
      handler: this.buildSite.bind(this)
    });
  }
  
  async buildSite() {
    // Query site content
    const contentService = this.context.getService('content-management');
    const pages = await contentService.query({
      provider: 'site',
      type: 'page'
    });
    
    // Build static site
    await this.performBuild(pages);
  }
}
```

## Plugin Interactions

### Registration Flow
```
1. content-management plugin loads
2. site-content plugin loads
3. site-content registers its provider with content-management
4. site-builder plugin loads
5. site-builder subscribes to content events
```

### Content Generation Flow
```
1. User: /generate type=page
2. content-management: Routes to 'site' provider
3. site-content: Generates page content
4. content-management: Emits 'content:generated' event
5. site-builder: Receives event, queues build
```

### Cross-Provider Query
```
1. User: /search term="dashboard"
2. content-management: Queries all providers
3. site-content: Returns matching pages
4. email-content: Returns matching templates
5. document-content: Returns matching docs
6. content-management: Aggregates and returns results
```

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

### Phase 1: Core content-management Plugin
1. Create plugin structure
2. Implement provider registry
3. Build content router
4. Create query aggregator
5. Setup event orchestration

### Phase 2: site-content Provider Plugin
1. Extract from current site-builder
2. Implement IContentProvider interface
3. Move entity types and handlers
4. Register with content-management

### Phase 3: Refactor site-builder
1. Remove content responsibilities
2. Focus on build operations only
3. Integrate with content-management service

### Phase 4: Shell Updates
1. Remove content-generator service
2. Update plugin loading order
3. Verify plugin interactions

## Future Provider Plugins

Each of these would be a separate plugin:

- **document-content**: Knowledge base, documentation
- **email-content**: Email templates, campaigns
- **report-content**: Analytics, business reports
- **api-content**: API documentation, schemas
- **notification-content**: System alerts, user notifications
- **chat-content**: Conversation templates, responses
- **form-content**: Dynamic forms, surveys

## Open Questions

1. **Provider Dependencies**: Can one provider depend on another?
2. **Provider Discovery**: Should we have a provider marketplace/registry?
3. **Content Migration**: How to migrate content between providers?
4. **Provider Composition**: Can providers compose/extend each other?
5. **Performance**: How to optimize cross-provider queries?