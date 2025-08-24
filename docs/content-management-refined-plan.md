# Content Management Architecture - Simplified Implementation Plan

## Executive Summary

Transform content-service into a unified coordination platform by merging view-registry and implementing a minimal provider pattern. This enables any plugin to provide content while keeping the architecture simple and practical.

## Core Concept

Content-service coordinates three things:
1. **Templates** - How to render content (from view-registry)
2. **Providers** - What supplies content/data (new pattern)
3. **Routes** - Where content appears on web (simple mappings)

## What We Gain

### 1. **Extensible Content Generation**
Any plugin can provide content by implementing a simple interface:
```typescript
class EmailProvider {
  generate(request) { return emailContent; }
}
// Emails are now part of the content system
```

### 2. **Unified Template Management**
All templates register centrally and can be shared:
```typescript
// Email provider uses site-builder's header
emailProvider.useTemplate('site-builder:header');
```

### 3. **Single Coordination Point**
Everything goes through content-service:
```typescript
contentService.generate('email', data);
contentService.generate('webpage', data);
contentService.generate('report', data);
```

### 4. **Separation of Concerns**
Providers handle WHAT (data/logic), templates handle HOW (rendering), routes handle WHERE (URLs).

## Simplified Architecture

### Provider Interface (Minimal)
```typescript
interface IContentProvider {
  id: string;
  name: string;
  
  // Implement only what you need
  generate?: (request: any) => Promise<any>;
  fetch?: (query: any) => Promise<any>;
  transform?: (content: any, format: string) => Promise<any>;
}
```

Key decisions:
- **No mandatory methods** - providers implement what makes sense
- **Direct return types** - no wrapper objects, providers return their specific types
- **No provider dependencies** - providers are independent

### Template System (From View-Registry)
```typescript
interface Template<T = unknown> {
  name: string;
  pluginId: string;
  schema: z.ZodType<T>;  // Zod validation
  render: (data: T) => VNode;  // Start with web only
}
```

Key decisions:
- **Web-only initially** - add other formats when needed
- **No permission system** - all templates shareable for now
- **Keep existing view-registry structure** - proven to work

### Route System (Simplified)
```typescript
interface Route {
  path: string;
  templateId: string;
  providerId?: string;  // Optional data source
}
```

Key decisions:
- **Simple mappings** - URL → template + optional provider
- **No sections** - complexity lives in templates/providers
- **Web-specific** - routes are inherently about URLs

### Content Service Structure
```typescript
class ContentService {
  // Simple Maps, not complex registries
  private templates = new Map<string, Template>();
  private providers = new Map<string, IContentProvider>();
  private routes = new Map<string, Route>();
  
  // Direct methods, no abstraction layers
  registerTemplate(template: Template) { }
  registerProvider(provider: IContentProvider) { }
  registerRoute(route: Route) { }
  
  // Core operations
  async renderRoute(path: string) {
    const route = this.routes.get(path);
    const provider = route.providerId ? 
      this.providers.get(route.providerId) : null;
    const data = provider ? await provider.fetch() : {};
    const template = this.templates.get(route.templateId);
    return template.render(data);
  }
}
```

## Implementation Plan (Simplified)

### Phase 1: Merge and Restructure (Week 1)
1. **Move view-registry into content-service**
   - Keep all existing functionality
   - Organize into templates/, providers/, routes/ folders
   - No legacy folder needed - clean break

2. **Create provider interface**
   ```typescript
   // providers/types.ts
   export interface IContentProvider {
     id: string;
     name: string;
     generate?: (request: any) => Promise<any>;
     fetch?: (query: any) => Promise<any>;
     transform?: (content: any, format: string) => Promise<any>;
   }
   ```

3. **Simplify route structure**
   - Remove sections array
   - Just path → template + optional provider

### Phase 2: Implement Core (Week 2)
1. **ContentService class**
   - Three Maps for templates, providers, routes
   - Simple registration methods
   - Basic renderRoute operation

2. **Transform existing dashboard**
   ```typescript
   class DashboardProvider implements IContentProvider {
     id = 'dashboard';
     async fetch() {
       return { entityStats, recentEntities };
     }
   }
   ```

3. **Update site-builder**
   - Register as provider
   - Move content generation to provider.generate()
   - Keep route management

### Phase 3: Test and Validate (Week 3)
1. **Ensure backward compatibility**
   - Existing templates work
   - Site-builder functions unchanged
   - No breaking changes

2. **Create simple second provider**
   - Proves pattern works
   - Could be markdown-to-html transformer
   - Or simple report generator

## What We're NOT Doing

1. **No phased migration** - clean break, simpler
2. **No caching layer** - add when needed
3. **No permission system** - add when needed
4. **No provider dependencies** - keep independent
5. **No generic Collection abstraction** - providers own their domain
6. **No complex registries** - just Maps
7. **No multiple output formats initially** - start with web
8. **No mandatory provider methods** - flexibility first

## Example: Dashboard Implementation

```typescript
// Dashboard as both provider and route
class DashboardProvider implements IContentProvider {
  id = 'dashboard';
  name = 'Dashboard Data Provider';
  
  async fetch(): Promise<DashboardData> {
    // Get entity statistics
    const stats = await this.getEntityStats();
    const recent = await this.getRecentEntities();
    return { entityStats: stats, recentEntities: recent };
  }
}

// Site-builder registers the route
siteBuilder.registerRoute({
  path: '/dashboard',
  templateId: 'dashboard-template',
  providerId: 'dashboard'
});

// Content-service coordinates
async function renderDashboard() {
  const route = routes.get('/dashboard');
  const provider = providers.get('dashboard');
  const data = await provider.fetch();
  const template = templates.get('dashboard-template');
  return template.render(data);
}
```

## Success Criteria

### Minimum Viable Success
- [ ] View-registry merged into content-service
- [ ] Provider pattern implemented (minimal)
- [ ] Dashboard works as provider
- [ ] Site-builder works as provider
- [ ] No breaking changes

### Next Level Success
- [ ] Second provider implemented
- [ ] Templates shared between providers
- [ ] Clean separation of concerns
- [ ] Simplified codebase

## File Structure (Final)

```
shell/content-service/
├── src/
│   ├── index.ts                 # Main exports
│   ├── content-service.ts       # Main coordination class
│   │
│   ├── templates/               # Template management
│   │   ├── types.ts            # Template interfaces
│   │   └── registry.ts         # Template storage (Map)
│   │
│   ├── providers/              # Provider management
│   │   ├── types.ts           # IContentProvider interface
│   │   └── registry.ts        # Provider storage (Map)
│   │
│   └── routes/                 # Route management
│       ├── types.ts           # Route interface
│       └── registry.ts        # Route storage (Map)
│
└── tests/
    ├── providers.test.ts
    ├── templates.test.ts
    └── routes.test.ts
```

## Key Principles

1. **Start Simple** - Minimal viable pattern
2. **Add When Needed** - No premature abstraction
3. **Clear Separation** - Templates, providers, routes have distinct roles
4. **Direct Types** - No unnecessary wrappers
5. **Backward Compatible** - Don't break existing code

## Next Steps

1. Review and approve this simplified plan
2. Begin Phase 1 implementation
3. Test with dashboard and site-builder
4. Iterate based on real usage