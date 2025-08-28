# Route Registry Migration to Site-Builder Plugin

## Current Architecture Analysis

### Current State
- **RouteRegistry** lives in `shell/render-service` as a core shell component
- Routes are registered directly via `shell.registerRoutes()` 
- Plugins access routes through `context.listRoutes()` and `context.registerRoutes()`
- Site-builder plugin reads routes but doesn't own the registry
- Routes are tightly coupled to the shell layer

### Problems with Current Architecture
1. **Wrong ownership**: Routes are primarily for web UI, which is site-builder's responsibility
2. **Tight coupling**: Shell shouldn't know about web routes directly
3. **Limited flexibility**: Site-builder can't fully control route management
4. **Circular dependency risk**: Shell depends on render concepts

## Proposed Architecture (Clean Separation)

### Core Design
- Site-builder plugin **completely owns** route management
- All route operations go through message bus
- **No route methods in shell or plugin contexts**
- Plugins that need routes must send messages to site-builder
- Shell has zero knowledge of routes

### Message-Based Route Management

```typescript
// Message types for route management
'plugin:site-builder:route:register'    // Register routes
'plugin:site-builder:route:unregister'  // Unregister routes  
'plugin:site-builder:route:list'        // List all routes
'plugin:site-builder:route:get'         // Get specific route
'plugin:site-builder:route:list-by-plugin' // List routes by plugin
```

## Implementation Steps

### Step 1: Create Route Management in Site-Builder
- [ ] Create `plugins/site-builder/src/lib/route-registry.ts` with RouteRegistry class
- [ ] Move route-related types from render-service to site-builder
- [ ] Add message handlers for all route operations
- [ ] Initialize registry in plugin onRegister
- [ ] Export route types from site-builder package

### Step 2: Remove ALL Route Support from Shell & Context
- [ ] Remove `routeRegistry` from Shell class
- [ ] Remove `registerRoutes()` method from Shell
- [ ] Remove `registerRoutes` from ServicePluginContext interface
- [ ] Remove `listRoutes` from ServicePluginContext
- [ ] Remove all route imports and dependencies
- [ ] Clean up shell initialization

### Step 3: Update RenderService
- [ ] Remove dependency on RouteRegistry
- [ ] Remove route-related methods
- [ ] Focus purely on rendering templates
- [ ] Clean up types and imports

### Step 4: Update Site-Builder Internal Usage
- [ ] Site-builder uses internal registry directly
- [ ] Site-builder tools query internal registry
- [ ] Commands work with internal registry

### Step 5: Update Plugins That Use Routes
- [ ] Plugins must import route types from `@brains/site-builder-plugin`
- [ ] Plugins register routes via message bus
- [ ] Example plugins updated to show pattern

## Technical Details

### Clean Plugin Pattern

```typescript
// Plugin that wants to register routes
import type { RouteDefinition } from '@brains/site-builder-plugin';

class MyPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // Define routes
    const routes: RouteDefinition[] = [
      {
        path: '/my-route',
        sections: [...]
      }
    ];
    
    // Register via message bus
    const response = await context.messageBus.send(
      'plugin:site-builder:route:register',
      {
        routes,
        pluginId: this.metadata.id,
        environment: 'production'
      }
    );
    
    if (!response.success) {
      this.logger.error('Failed to register routes', { error: response.error });
    }
  }
}
```

### Message Schemas

```typescript
// Register Routes Message
interface RegisterRoutesMessage {
  type: 'plugin:site-builder:route:register';
  payload: {
    routes: RouteDefinition[];
    pluginId: string;
    environment?: string;
  };
}

// Unregister Routes Message  
interface UnregisterRoutesMessage {
  type: 'plugin:site-builder:route:unregister';
  payload: {
    paths?: string[];        // Specific paths to unregister
    pluginId?: string;       // Or all routes from a plugin
  };
}

// List Routes Message
interface ListRoutesMessage {
  type: 'plugin:site-builder:route:list';
  payload: {
    environment?: string;    // Optional filter
  };
}

// Get Route Message
interface GetRouteMessage {
  type: 'plugin:site-builder:route:get';
  payload: {
    path: string;
  };
}

// Response Types
interface RouteResponse {
  success: boolean;
  error?: string;
}

interface RouteListResponse extends RouteResponse {
  routes?: RouteDefinition[];
}

interface SingleRouteResponse extends RouteResponse {
  route?: RouteDefinition;
}
```

### Site-Builder Implementation

```typescript
// plugins/site-builder/src/lib/route-registry.ts
export class RouteRegistry {
  private routes = new Map<string, RouteDefinition>();
  
  register(route: RouteDefinition): void {
    if (this.routes.has(route.path)) {
      const existing = this.routes.get(route.path);
      throw new Error(
        `Route path "${route.path}" already registered by plugin "${existing?.pluginId}"`
      );
    }
    this.routes.set(route.path, route);
  }
  
  unregister(path: string): void {
    this.routes.delete(path);
  }
  
  unregisterByPlugin(pluginId: string): void {
    for (const [path, route] of this.routes.entries()) {
      if (route.pluginId === pluginId) {
        this.routes.delete(path);
      }
    }
  }
  
  get(path: string): RouteDefinition | undefined {
    return this.routes.get(path);
  }
  
  list(filter?: { pluginId?: string; environment?: string }): RouteDefinition[] {
    let routes = Array.from(this.routes.values());
    
    if (filter?.pluginId) {
      routes = routes.filter(r => r.pluginId === filter.pluginId);
    }
    
    if (filter?.environment) {
      routes = routes.filter(r => r.environment === filter.environment);
    }
    
    return routes;
  }
}
```

### Site-Builder Message Handlers

```typescript
// In SiteBuilderPlugin
private setupRouteHandlers(context: ServicePluginContext): void {
  // Initialize registry
  this.routeRegistry = new RouteRegistry();
  
  // Register handler for route registration
  context.messageBus.register('plugin:site-builder:route:register', async (message) => {
    const { routes, pluginId, environment } = message.payload;
    
    try {
      routes.forEach(route => {
        const processedRoute = {
          ...route,
          pluginId,
          environment,
          // Add template scoping
          sections: route.sections.map(section => ({
            ...section,
            template: section.template && `${pluginId}:${section.template}`
          }))
        };
        this.routeRegistry.register(processedRoute);
      });
      
      this.logger.debug(`Registered ${routes.length} routes for ${pluginId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to register routes', { error, pluginId });
      return { success: false, error: error.message };
    }
  });
  
  // Handler for listing routes
  context.messageBus.register('plugin:site-builder:route:list', async (message) => {
    try {
      const routes = this.routeRegistry.list(message.payload);
      return { success: true, routes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // Handler for getting specific route
  context.messageBus.register('plugin:site-builder:route:get', async (message) => {
    try {
      const route = this.routeRegistry.get(message.payload.path);
      return { success: true, route };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // Handler for unregistering routes
  context.messageBus.register('plugin:site-builder:route:unregister', async (message) => {
    try {
      const { paths, pluginId } = message.payload;
      
      if (paths) {
        paths.forEach(path => this.routeRegistry.unregister(path));
      } else if (pluginId) {
        this.routeRegistry.unregisterByPlugin(pluginId);
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
```

## Benefits

1. **Clean separation**: No coupling between shell and routes
2. **Proper ownership**: Site-builder owns all route concepts
3. **Explicit dependencies**: Plugins must explicitly depend on site-builder for routes
4. **Message-based**: Consistent with plugin communication patterns
5. **No hidden magic**: Clear, explicit route registration

## Migration Checklist

### Files to Create
- [ ] `plugins/site-builder/src/lib/route-registry.ts`
- [ ] `plugins/site-builder/src/types/routes.ts` (move types here)
- [ ] `plugins/site-builder/src/handlers/route-handlers.ts`

### Files to Update
- [ ] `plugins/site-builder/src/plugin.ts` - Add message handlers
- [ ] `plugins/site-builder/src/index.ts` - Export route types
- [ ] Any plugin using routes - Update to use messages

### Files to Remove/Clean
- [ ] `shell/render-service/src/route-registry.ts` - Delete file
- [ ] `shell/render-service/src/types.ts` - Remove route types
- [ ] `shell/core/src/shell.ts` - Remove ALL route code
- [ ] `shell/plugins/src/service/context.ts` - Remove route methods
- [ ] `shell/plugins/src/interfaces.ts` - Remove route method signatures
- [ ] `shell/core/test/mock-shell.ts` - Remove route mock methods

### Testing Updates
- [ ] Move route registry tests to site-builder
- [ ] Add message handler tests
- [ ] Test route registration via messages
- [ ] Test route querying via messages

## Example Migration

### Before (Direct Context Method)
```typescript
class MyPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // Old way - tight coupling
    context.registerRoutes([
      { path: '/my-route', sections: [...] }
    ]);
    
    const routes = context.listRoutes();
  }
}
```

### After (Message Bus)
```typescript
import type { RouteDefinition } from '@brains/site-builder-plugin';

class MyPlugin extends ServicePlugin {
  async onRegister(context: ServicePluginContext) {
    // New way - explicit dependency on site-builder
    const response = await context.messageBus.send(
      'plugin:site-builder:route:register',
      {
        routes: [{ path: '/my-route', sections: [...] }],
        pluginId: this.metadata.id
      }
    );
    
    // Query routes if needed
    const listResponse = await context.messageBus.send(
      'plugin:site-builder:route:list',
      {}
    );
  }
}
```

## Risks and Mitigation

**Risk**: Plugins break due to removed methods
**Mitigation**: Clear error messages, TypeScript will catch at compile time

**Risk**: Site-builder not loaded = no routes work
**Mitigation**: Document that site-builder is required for web UI

**Risk**: More verbose route registration
**Mitigation**: This is good - makes dependencies explicit

## Success Criteria

1. Shell has ZERO knowledge of routes
2. Plugin context has NO route methods
3. Site-builder owns all route code
4. Routes work via message bus
5. Clean dependency graph
6. All tests passing