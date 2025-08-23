# Content Management Architecture

## Executive Summary

This document outlines the architectural refactoring to expand `shell/content-generator` into `shell/content-service` - a shell-level service that provides content coordination and common utilities. Plugins can implement the `IContentProvider` interface to register as content providers, with site-builder serving as both a content provider and static site builder.

## Current State Analysis (Updated 2025-01-23)

### What We Have Now

After completing Phase 2 of the refactoring, we have:

1. **Content-Service** (`shell/content-service/`)
   - A template-based content generation service
   - Manages templates with scoping (pluginId:templateName)
   - Provides AI-powered content generation via templates
   - Formats content using template formatters
   - **NOT a provider registry** - it's just a template engine

2. **Site-builder Plugin** (`plugins/site-builder/`)
   - Fully self-contained content management system
   - Owns site-content-preview and site-content-production entity types
   - Has SiteContentOperations for managing content lifecycle
   - Registers job handlers for content generation and derivation
   - Uses shell's content-service for AI generation via templates

3. **Topics Plugin** (`plugins/topics/`)
   - Uses content-service for AI-powered topic extraction
   - Example of a content consumer (but not provider)

### Core Architectural Issues

#### 1. Confused Identity of Content-Service
The content-service is caught between two paradigms:
- **What it is**: A template engine with AI generation capabilities
- **What we want**: A provider registry and coordinator
- **Result**: Neither fish nor fowl - it doesn't enable extensible content generation

#### 2. No Provider Pattern Implementation
The architecture document describes an IContentProvider interface, but:
- It was never implemented
- Content-service doesn't have provider registration
- Plugins can't extend content generation capabilities
- All content generation flows through site-builder's specific patterns

#### 3. Limited Content Type Support
Current system only supports:
- Site content (preview/production) - owned by site-builder
- Topics - extraction only, not generation
- No support for: emails, reports, documents, API specs, notifications, etc.

#### 4. Job Handler Confusion
- Job handlers moved to site-builder but they're still site-specific
- "content-generation" job type is misleading - it's really "site-content-generation"
- No generic content generation job that could route to different providers

#### 5. Tight Coupling Despite Refactoring
- Site-builder still owns ALL website content logic
- Content generation is hardcoded to site-builder's needs (routes, sections)
- No way for other plugins to provide different types of content generation
- Each plugin would need to duplicate all infrastructure

### Root Cause Analysis

The fundamental issue is that **we completed Phase 2 (moving handlers to site-builder) without completing Phase 1 (implementing provider registry)**. This created:

1. **A half-transformed architecture** where content-service is neither the old generator nor the new coordinator
2. **Site-builder as a monolith** that absorbed all content logic instead of becoming a provider
3. **No extension points** for other plugins to participate in content generation

## Proposed Architecture (Refined)

### Overview

Transform content-service from a template engine into a proper content coordination service with provider registry, enabling any plugin to provide content generation capabilities.

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
                    │  • Template engine (legacy)  │
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

### Key Architectural Changes

#### 1. Clear Provider Interface

```typescript
// Interface that content provider plugins must implement
export interface IContentProvider {
  readonly id: string; // Unique provider ID
  readonly name: string; // Human-readable name
  readonly version: string; // Provider version

  // Content type information
  getContentTypes(): ContentTypeDefinition[];
  
  // Core capabilities
  getCapabilities(): ContentCapabilities;

  // Core operation - content generation
  generate(request: GenerateRequest): Promise<GenerationResult>;

  // Optional operations
  transform?(content: Content, format: string): Promise<Content>;
  validate?(content: Content): Promise<ValidationResult>;
  compose?(contents: Content[]): Promise<Content>;
}

// Provider capabilities
export interface ContentCapabilities {
  supportsGeneration: boolean;
  supportsTransformation: boolean;
  supportsValidation: boolean;
  supportsComposition: boolean;
  supportedFormats: string[];
  supportedWorkflows?: string[]; // e.g., "preview-production"
}

// Content type definition
export interface ContentTypeDefinition {
  id: string;
  name: string;
  description: string;
  schema: z.ZodSchema; // Validation schema
  defaultTemplate?: string;
  supportedOperations: string[];
}
```

#### 2. Unified Content Model

```typescript
// Universal content representation
export interface Content {
  id: string;
  provider: string; // Which provider owns this
  type: string; // Provider-specific type
  format: string; // Current format (markdown, html, json, etc.)
  data: unknown; // Provider-specific data
  metadata: ContentMetadata;
}

export interface ContentMetadata {
  created: string;
  updated: string;
  version?: string;
  author?: string;
  tags?: string[];
  workflow?: {
    stage: string; // e.g., "draft", "preview", "production"
    history: WorkflowTransition[];
  };
  [key: string]: unknown; // Provider-specific metadata
}
```

#### 3. Provider Registry Implementation

```typescript
export class ProviderRegistry {
  private providers = new Map<string, IContentProvider>();
  private typeToProvider = new Map<string, string>(); // content type -> provider ID
  
  register(provider: IContentProvider): void {
    // Validate provider
    this.validateProvider(provider);
    
    // Register provider
    this.providers.set(provider.id, provider);
    
    // Register content types
    for (const type of provider.getContentTypes()) {
      this.typeToProvider.set(type.id, provider.id);
    }
    
    // Emit registration event
    this.emit('provider:registered', { provider });
  }
  
  getProviderForType(contentType: string): IContentProvider | null {
    const providerId = this.typeToProvider.get(contentType);
    return providerId ? this.providers.get(providerId) || null : null;
  }
  
  discoverCapabilities(): Map<string, ContentCapabilities> {
    const capabilities = new Map();
    for (const [id, provider] of this.providers) {
      capabilities.set(id, provider.getCapabilities());
    }
    return capabilities;
  }
}
```

#### 4. Content Router

```typescript
export class ContentRouter {
  constructor(
    private registry: ProviderRegistry,
    private eventBus: IMessageBus
  ) {}
  
  async generate(request: {
    type: string;
    provider?: string; // Optional: specify provider directly
    data: unknown;
    options?: GenerationOptions;
  }): Promise<Content> {
    // Find appropriate provider
    const provider = request.provider 
      ? this.registry.getProvider(request.provider)
      : this.registry.getProviderForType(request.type);
    
    if (!provider) {
      throw new Error(`No provider found for content type: ${request.type}`);
    }
    
    // Generate content
    const result = await provider.generate({
      type: request.type,
      data: request.data,
      options: request.options
    });
    
    // Emit unified event
    this.eventBus.emit('content:generated', {
      provider: provider.id,
      type: request.type,
      content: result.content
    });
    
    return result.content;
  }
  
  async query(filter: ContentQuery): Promise<Content[]> {
    // Query across all providers
    const results: Content[] = [];
    
    for (const provider of this.registry.getAllProviders()) {
      if (provider.query) {
        const providerResults = await provider.query(filter);
        results.push(...providerResults);
      }
    }
    
    return results;
  }
}
```

### Migration Path

#### Phase 1: Define Core Interfaces
1. Create provider interface definitions
2. Create unified content model
3. Define generation request/result types
4. Define provider capabilities

#### Phase 2: Implement Provider Infrastructure
1. Create provider registry
2. Create content router
3. Add provider discovery
4. Keep template engine for backward compatibility

#### Phase 3: Transform Site-Builder into Provider
1. Create SiteContentProvider class
2. Implement IContentProvider interface
3. Move generation logic to provider
4. Register with content-service on plugin init

#### Phase 4: Create Generic Job Handlers
1. Generic content-generation handler that routes to providers
2. Generic content-transformation handler
3. Keep site-specific handlers for compatibility

#### Phase 5: Enable Cross-Provider Operations
1. Unified content queries
2. Content transformation pipeline
3. Provider composition
4. Content validation

### Benefits of This Architecture

#### For Plugin Developers
- Clear interface to implement
- No need to understand entire system
- Can focus on domain-specific logic
- Automatic integration with content ecosystem

#### For System Extensibility
- Any plugin can provide content
- New content types without core changes
- Provider marketplace possible
- Composable content generation

#### For Users
- Unified content interface
- Cross-provider search
- Consistent operations across content types
- Rich ecosystem of content providers

## Implementation Plan (Updated)

### Phase 0: Architecture Alignment (NEW - Do First!)
1. Document clear separation between:
   - Template Engine (current content-service functionality)
   - Provider Registry (new functionality)
   - Content Router (new functionality)
2. Decide on backward compatibility strategy
3. Plan migration path for existing code

### Phase 1: Core Interfaces & Models
**Location**: `/shell/content-service/src/interfaces/`

1. `provider.ts` - IContentProvider interface and related types
2. `content.ts` - Unified Content model and metadata
3. `capabilities.ts` - Provider capabilities and discovery
4. `operations.ts` - Generation, transformation, validation interfaces

### Phase 2: Provider Infrastructure
**Location**: `/shell/content-service/src/core/`

1. `provider-registry.ts` - Provider registration and management
2. `content-router.ts` - Route operations to providers
3. `event-coordinator.ts` - Unified content events
4. `provider-validator.ts` - Validate provider implementations

### Phase 3: Transform Site-Builder
**Location**: `/plugins/site-builder/src/providers/`

1. `site-content-provider.ts` - Implement IContentProvider
2. Move generation logic from operations to provider
3. Define site-specific content types
4. Register on plugin initialization

### Phase 4: Generic Job Handlers
**Location**: `/shell/content-service/src/handlers/`

1. `generic-content-generation.ts` - Routes to appropriate provider
2. `generic-content-transformation.ts` - Cross-provider transformations
3. Update existing handlers to use provider pattern

### Phase 5: Testing & Migration
1. Create test provider plugin
2. Migrate existing code gradually
3. Ensure backward compatibility
4. Document migration guide

### Phase 6: Advanced Features
1. Provider composition
2. Content transformation pipeline
3. Cross-provider queries
4. Provider marketplace

## Success Criteria

### Must Have
- [ ] Any plugin can register as content provider
- [ ] Unified content model across all providers
- [ ] Provider discovery and capability query
- [ ] Backward compatibility with existing code
- [ ] Clear separation of concerns

### Should Have
- [ ] Cross-provider content queries
- [ ] Content transformation between formats
- [ ] Provider composition capabilities
- [ ] Rich provider capability discovery

### Could Have
- [ ] Provider marketplace/registry
- [ ] Content migration tools
- [ ] Provider dependency management
- [ ] Performance optimizations

## Migration Guide

### For Site-Builder Plugin
```typescript
// Before: Direct generation
const content = await this.context.generateContent({
  templateName: 'hero',
  data: { ... }
});

// After: Through provider
const content = await this.contentProvider.generate({
  type: 'site-section',
  data: { 
    template: 'hero',
    ...
  }
});
```

### For New Provider Plugins
```typescript
export class EmailContentProvider implements IContentProvider {
  id = 'email';
  name = 'Email Content Provider';
  version = '1.0.0';
  
  getContentTypes() {
    return [
      {
        id: 'email-template',
        name: 'Email Template',
        schema: emailTemplateSchema,
        supportedOperations: ['generate', 'transform', 'send']
      },
      {
        id: 'email-campaign',
        name: 'Email Campaign',
        schema: emailCampaignSchema,
        supportedOperations: ['generate', 'schedule', 'track']
      }
    ];
  }
  
  async generate(request: GenerateRequest): Promise<GenerationResult> {
    // Email-specific generation logic
    switch (request.type) {
      case 'email-template':
        return this.generateTemplate(request);
      case 'email-campaign':
        return this.generateCampaign(request);
      default:
        throw new Error(`Unknown content type: ${request.type}`);
    }
  }
}
```

## Open Questions

1. **Provider Dependencies**: Should providers be able to depend on other providers?
   - Use case: Blog provider depends on Markdown provider
   - Solution: Dependency injection through content-service

2. **Provider Discovery**: How do users discover available providers?
   - In-system discovery via capability query
   - External marketplace/registry
   - Documentation and examples

3. **Content Migration**: How to migrate content between providers?
   - Transformation pipeline through common formats
   - Provider-specific migration tools
   - Export/import capabilities

4. **Provider Composition**: Can providers compose/extend each other?
   - Inheritance model vs composition model
   - Provider chains for complex workflows
   - Middleware pattern for transformations

5. **Performance**: How to optimize cross-provider operations?
   - Lazy loading of providers
   - Caching of provider capabilities
   - Parallel query execution
   - Stream processing for large content

## Next Steps

1. **Immediate**: Align on architecture and migration strategy
2. **Short-term**: Implement core interfaces and provider registry
3. **Medium-term**: Transform site-builder into provider model
4. **Long-term**: Build provider ecosystem

## Appendix: Example Providers

### Documentation Provider
```typescript
class DocProvider implements IContentProvider {
  // API documentation, technical guides, knowledge base
}
```

### Report Provider
```typescript
class ReportProvider implements IContentProvider {
  // Analytics reports, business intelligence, dashboards
}
```

### Notification Provider
```typescript
class NotificationProvider implements IContentProvider {
  // Alerts, system messages, user notifications
}
```

### Form Provider
```typescript
class FormProvider implements IContentProvider {
  // Dynamic forms, surveys, questionnaires
}
```