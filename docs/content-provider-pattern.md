# Content Provider Pattern - Simple Implementation Plan

## Executive Summary

Add a minimal provider pattern to content-service without moving view-registry. This enables plugins to provide content generation capabilities while keeping the architecture simple and maintaining working code.

## Core Principle

**Keep it simple**: Add providers to content-service, leave view-registry alone.

## What We Gain

1. **Extensible Content Generation**: Any plugin can provide content
2. **Clear Separation**: content-service handles content, view-registry handles views
3. **No Breaking Changes**: Existing code continues to work
4. **Incremental Enhancement**: Add capabilities without disruption

## Architecture

### Provider Interface

```typescript
// content-service/src/providers/types.ts
export interface IContentProvider {
  id: string;
  name: string;

  // Implement only what you need
  generate?: (request: any) => Promise<any>;
  fetch?: (query: any) => Promise<any>;
  transform?: (content: any, format: string) => Promise<any>;
}
```

### Content Service Enhancement

```typescript
// content-service adds provider coordination
class ContentService {
  // Keep all existing functionality
  private templates = new Map<string, Template>();

  // Add provider management
  private providers = new Map<string, IContentProvider>();

  // New provider methods
  registerProvider(provider: IContentProvider): void {
    this.providers.set(provider.id, provider);
  }

  async generateFromProvider(providerId: string, request: any) {
    const provider = this.providers.get(providerId);
    if (!provider?.generate) {
      throw new Error(`Provider ${providerId} doesn't support generation`);
    }
    return provider.generate(request);
  }

  async fetchFromProvider(providerId: string, query: any) {
    const provider = this.providers.get(providerId);
    if (!provider?.fetch) {
      throw new Error(`Provider ${providerId} doesn't support fetching`);
    }
    return provider.fetch(query);
  }
}
```

### How It Works With View-Registry

View-registry stays where it is and can reference providers:

```typescript
// Site-builder creates a route that uses a provider
viewRegistry.registerRoute({
  id: "dashboard",
  path: "/dashboard",
  title: "Dashboard",
  sections: [
    {
      id: "main",
      template: "dashboard",
      // New: specify data provider
      providerId: "dashboard-provider",
    },
  ],
});

// Dashboard provider supplies the data
contentService.registerProvider({
  id: "dashboard-provider",
  name: "Dashboard Data Provider",
  async fetch() {
    return { entityStats, recentEntities };
  },
});
```

## Implementation Plan

### Phase 1: Add Provider Pattern (Day 1)

1. Create provider types

   ```typescript
   // content-service/src/providers/types.ts
   export interface IContentProvider { ... }
   ```

2. Add provider registry to ContentService

   ```typescript
   // content-service/src/content-service.ts
   private providers = new Map<string, IContentProvider>();
   registerProvider(provider: IContentProvider) { ... }
   ```

3. Add provider methods
   - `generateFromProvider()`
   - `fetchFromProvider()`
   - `transformWithProvider()`

4. Write tests for provider functionality

### Phase 2: Create First Provider (Day 2)

1. Create DashboardProvider in site-builder

   ```typescript
   class DashboardProvider implements IContentProvider {
     id = "dashboard";
     async fetch() {
       const stats = await this.getEntityStats();
       return { entityStats: stats, recentEntities };
     }
   }
   ```

2. Register provider on plugin init
3. Update dashboard template to use provider data
4. Test dashboard still works

### Phase 3: Enable Provider Discovery (Day 3)

1. Add provider info methods

   ```typescript
   getProviderInfo(id: string): ProviderInfo
   listProviders(): ProviderInfo[]
   ```

2. Create provider capabilities discovery

   ```typescript
   interface ProviderInfo {
     id: string;
     name: string;
     capabilities: {
       canGenerate: boolean;
       canFetch: boolean;
       canTransform: boolean;
     };
   }
   ```

3. Add provider documentation

### Phase 4: Transform Site-Builder (Week 2)

1. Create SiteContentProvider

   ```typescript
   class SiteContentProvider implements IContentProvider {
     id = "site-content";

     async generate(request: GenerateRequest) {
       // Move existing generation logic here
       return this.generateContent(request);
     }
   }
   ```

2. Refactor site-builder to use provider
3. Keep backward compatibility
4. Test all site generation

## Examples

### Example 1: Dashboard Provider

```typescript
// In site-builder plugin
class DashboardProvider implements IContentProvider {
  id = "dashboard";
  name = "Dashboard Data Provider";

  constructor(private entityService: EntityService) {}

  async fetch(): Promise<DashboardData> {
    const stats = await this.entityService.getStats();
    const recent = await this.entityService.getRecent(10);
    return { entityStats: stats, recentEntities: recent };
  }
}

// Register on plugin init
plugin.onInitialize = async (context) => {
  const provider = new DashboardProvider(context.entityService);
  context.contentService.registerProvider(provider);
};
```

### Example 2: Email Provider (Future)

```typescript
class EmailProvider implements IContentProvider {
  id = "email";
  name = "Email Content Provider";

  async generate(request: EmailRequest): Promise<EmailContent> {
    return {
      subject: request.subject,
      body: await this.generateBody(request),
      recipients: request.recipients,
    };
  }

  async transform(content: EmailContent, format: string) {
    if (format === "html") {
      return this.renderAsHtml(content);
    }
    return content;
  }
}
```

### Example 3: Using Providers

```typescript
// Generate content
const emailContent = await contentService.generateFromProvider("email", {
  subject: "Welcome",
  template: "welcome",
});

// Fetch data
const dashboardData = await contentService.fetchFromProvider("dashboard", {
  timeRange: "last-7-days",
});

// Transform content
const htmlEmail = await contentService.transformWithProvider(
  "email",
  emailContent,
  "html",
);
```

## What We're NOT Doing

1. **NOT moving view-registry** - It stays where it is
2. **NOT breaking existing code** - Pure addition
3. **NOT forcing provider adoption** - Gradual migration
4. **NOT adding complex abstractions** - Simple Map-based registry
5. **NOT requiring all methods** - Providers implement what they need

## Success Criteria

### Phase 1 Success

- [ ] Provider interface defined
- [ ] Provider registry working
- [ ] Tests passing
- [ ] No breaking changes

### Phase 2 Success

- [ ] Dashboard using provider
- [ ] Provider discovery working
- [ ] Documentation complete

### Phase 3 Success

- [ ] Site-builder using provider pattern
- [ ] Multiple providers registered
- [ ] Clean separation of concerns

## Benefits of This Approach

1. **Minimal Risk**: No moving/breaking existing code
2. **Incremental**: Can be done step by step
3. **Clear Boundaries**: Each service has one job
4. **Easy to Test**: Provider pattern in isolation
5. **Easy to Understand**: Simple addition, not restructuring

## File Structure

```
shell/content-service/
├── src/
│   ├── content-service.ts     # Enhanced with providers
│   ├── providers/
│   │   ├── types.ts           # IContentProvider interface
│   │   └── registry.ts        # Provider registry (if needed)
│   └── [existing files...]
└── test/
    ├── providers.test.ts       # New provider tests
    └── [existing tests...]
```

## Migration Path

1. **Now**: Add provider pattern
2. **Next Sprint**: Migrate dashboard to provider
3. **Future**: Migrate site-builder generation
4. **Later**: Add new providers (email, reports, etc.)

## Next Steps

1. Implement Phase 1 (provider pattern)
2. Write comprehensive tests
3. Create dashboard provider
4. Document provider creation guide
5. Gradually migrate existing functionality
