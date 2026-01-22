# Plugin API Routes System

## Overview

A reusable infrastructure that allows plugins to expose HTTP endpoints for their tools. Enables form submissions, webhooks, and API integrations without custom server code.

## Design Principles

- **Explicit over implicit**: Plugins declare which tools to expose as HTTP endpoints
- **Co-located**: Route definitions live with plugin code
- **Extensible**: Per-route middleware, auth, rate limiting
- **Form-friendly**: Support both JSON API and HTML form submissions

---

## 1. API Route Types

**File**: `shell/plugins/src/types/api-routes.ts` (NEW)

```typescript
import { z } from "zod";

export const apiRouteMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE"]);

export const apiRouteDefinitionSchema = z.object({
  /** Path suffix (prefixed with /api/{pluginId}) */
  path: z.string(),
  /** HTTP method */
  method: apiRouteMethodSchema.default("POST"),
  /** Tool to invoke */
  tool: z.string(),
  /** Allow unauthenticated access */
  public: z.boolean().default(false),
  /** Accept form data (multipart/urlencoded) in addition to JSON */
  formData: z.boolean().default(false),
  /** Redirect URL on success (for form submissions) */
  successRedirect: z.string().optional(),
  /** Redirect URL on error (for form submissions) */
  errorRedirect: z.string().optional(),
  /** Rate limit config */
  rateLimit: z
    .object({
      windowMs: z.number(),
      max: z.number(),
    })
    .optional(),
  /** Map form/query fields to tool args (if names differ) */
  argMapping: z.record(z.string()).optional(),
});

export type ApiRouteDefinition = z.infer<typeof apiRouteDefinitionSchema>;

export interface ApiRouteHandler {
  (request: ApiRequest): Promise<ApiResponse>;
}

export interface ApiRequest {
  method: string;
  path: string;
  body: unknown;
  query: Record<string, string>;
  headers: Record<string, string>;
  formData?: Record<string, unknown>;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
  redirect?: string;
  headers?: Record<string, string>;
}
```

---

## 2. API Route Registry

**File**: `shell/plugins/src/registries/api-route-registry.ts` (NEW)

```typescript
import type { ApiRouteDefinition } from "../types/api-routes";

export interface RegisteredApiRoute {
  pluginId: string;
  fullPath: string; // /api/{pluginId}{path}
  definition: ApiRouteDefinition;
}

export class ApiRouteRegistry {
  private routes: Map<string, RegisteredApiRoute> = new Map();

  register(pluginId: string, definition: ApiRouteDefinition): void {
    const fullPath = `/api/${pluginId}${definition.path}`;
    this.routes.set(fullPath, { pluginId, fullPath, definition });
  }

  unregister(pluginId: string, path?: string): void {
    if (path) {
      this.routes.delete(`/api/${pluginId}${path}`);
    } else {
      for (const key of this.routes.keys()) {
        if (key.startsWith(`/api/${pluginId}/`)) {
          this.routes.delete(key);
        }
      }
    }
  }

  getRoute(path: string): RegisteredApiRoute | undefined {
    return this.routes.get(path);
  }

  getAllRoutes(): RegisteredApiRoute[] {
    return Array.from(this.routes.values());
  }

  getRoutesForPlugin(pluginId: string): RegisteredApiRoute[] {
    return this.getAllRoutes().filter((r) => r.pluginId === pluginId);
  }
}
```

---

## 3. Plugin Base Class Extension

**File**: `shell/plugins/src/base/service-plugin.ts` (MODIFY)

Add static property for API routes:

```typescript
import type { ApiRouteDefinition } from "../types/api-routes";

export abstract class ServicePlugin<
  TConfig = unknown,
> extends CorePlugin<TConfig> {
  /** API routes this plugin exposes (override in subclass) */
  static readonly apiRoutes: ApiRouteDefinition[] = [];

  /** Get API routes for this plugin instance */
  getApiRoutes(): ApiRouteDefinition[] {
    return (this.constructor as typeof ServicePlugin).apiRoutes;
  }
}
```

---

## 4. Webserver API Route Handler

**File**: `interfaces/webserver/src/api/route-handler.ts` (NEW)

```typescript
import type { Context } from "hono";
import type { RegisteredApiRoute } from "@brains/plugins";
import type { Logger } from "@brains/utils";

export type ToolInvoker = (
  pluginId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export async function handleApiRoute(
  c: Context,
  route: RegisteredApiRoute,
  toolInvoker: ToolInvoker,
  logger: Logger,
): Promise<Response> {
  const { definition, pluginId } = route;

  try {
    // Parse input (JSON or form data)
    let args: Record<string, unknown>;
    if (definition.formData) {
      const formData = await c.req.parseBody();
      args = applyArgMapping(
        formData as Record<string, unknown>,
        definition.argMapping,
      );
    } else {
      args = await c.req.json();
    }

    // Invoke tool
    const result = await toolInvoker(pluginId, definition.tool, args);

    // Determine response type
    const acceptsJson = c.req.header("Accept")?.includes("application/json");
    const isFormSubmit = c.req.header("Content-Type")?.includes("form");

    if (result.success) {
      if (!acceptsJson && isFormSubmit && definition.successRedirect) {
        return c.redirect(definition.successRedirect);
      }
      return c.json({ success: true, data: result.data });
    } else {
      if (!acceptsJson && isFormSubmit && definition.errorRedirect) {
        const errorUrl = `${definition.errorRedirect}?error=${encodeURIComponent(result.error || "Unknown error")}`;
        return c.redirect(errorUrl);
      }
      return c.json({ success: false, error: result.error }, 400);
    }
  } catch (error) {
    logger.error("API route error", { path: route.fullPath, error });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
}

function applyArgMapping(
  data: Record<string, unknown>,
  mapping?: Record<string, string>,
): Record<string, unknown> {
  if (!mapping) return data;
  const result: Record<string, unknown> = {};
  for (const [formField, toolArg] of Object.entries(mapping)) {
    if (data[formField] !== undefined) {
      result[toolArg] = data[formField];
    }
  }
  // Include unmapped fields as-is
  for (const [key, value] of Object.entries(data)) {
    if (!mapping[key]) {
      result[key] = value;
    }
  }
  return result;
}
```

---

## 5. Server Manager Integration

**File**: `interfaces/webserver/src/server-manager.ts` (MODIFY)

```typescript
import type { ApiRouteRegistry, RegisteredApiRoute } from "@brains/plugins";
import { handleApiRoute, type ToolInvoker } from "./api/route-handler";

export interface ServerManagerOptions {
  logger: Logger;
  productionDistDir: string;
  productionPort: number;
  previewDistDir?: string;
  previewPort?: number;
  // NEW:
  apiRouteRegistry?: ApiRouteRegistry;
  toolInvoker?: ToolInvoker;
}

// Add method to set up API routes:
private setupApiRoutes(app: Hono): void {
  if (!this.options.apiRouteRegistry || !this.options.toolInvoker) {
    return;
  }

  const routes = this.options.apiRouteRegistry.getAllRoutes();

  for (const route of routes) {
    const method = route.definition.method.toLowerCase() as "get" | "post" | "put" | "delete";
    app[method](route.fullPath, async (c) => {
      return handleApiRoute(c, route, this.options.toolInvoker!, this.logger);
    });
  }

  this.logger.info(`Mounted ${routes.length} API routes`);
}

// Call in createPreviewApp() and createProductionApp():
// this.setupApiRoutes(app);
```

---

## 6. Webserver Interface Wiring

**File**: `interfaces/webserver/src/webserver-interface.ts` (MODIFY)

```typescript
import { ApiRouteRegistry } from "@brains/plugins";
import type { ToolInvoker } from "./api/route-handler";

protected override async onRegister(
  context: InterfacePluginContext,
): Promise<void> {
  // Collect API routes from all plugins
  const apiRouteRegistry = new ApiRouteRegistry();

  for (const plugin of context.plugins.getAll()) {
    if (typeof plugin.getApiRoutes === "function") {
      for (const route of plugin.getApiRoutes()) {
        apiRouteRegistry.register(plugin.id, route);
      }
    }
  }

  // Create tool invoker that calls tools via messaging
  const toolInvoker: ToolInvoker = async (pluginId, toolName, args) => {
    return context.messaging.send(`plugin:${pluginId}:tool:execute`, {
      toolName,
      args,
      interfaceType: "webserver",
      userId: "anonymous",
    });
  };

  this.serverManager = new ServerManager({
    logger: context.logger,
    productionDistDir: this.config.productionDistDir,
    productionPort: this.config.productionPort,
    apiRouteRegistry,
    toolInvoker,
  });
}
```

---

## Example: Plugin with API Routes

```typescript
import type { ApiRouteDefinition } from "@brains/plugins";

export class NewsletterPlugin extends ServicePlugin<NewsletterConfig> {
  static readonly apiRoutes: ApiRouteDefinition[] = [
    {
      path: "/subscribe",
      method: "POST",
      tool: "newsletter_subscribe",
      public: true,
      formData: true,
      successRedirect: "/subscribe/thanks",
      errorRedirect: "/subscribe/error",
      rateLimit: { windowMs: 60000, max: 5 },
      argMapping: { email: "email", name: "name" },
    },
    {
      path: "/unsubscribe",
      method: "POST",
      tool: "newsletter_unsubscribe",
      public: true,
      formData: true,
      successRedirect: "/unsubscribe/confirmed",
    },
  ];

  // ... rest of plugin
}
```

**Result**:

- `POST /api/newsletter/subscribe` → calls `newsletter_subscribe` tool
- `POST /api/newsletter/unsubscribe` → calls `newsletter_unsubscribe` tool

---

## Files Summary

| File                                                 | Action           |
| ---------------------------------------------------- | ---------------- |
| `shell/plugins/src/types/api-routes.ts`              | NEW              |
| `shell/plugins/src/registries/api-route-registry.ts` | NEW              |
| `shell/plugins/src/base/service-plugin.ts`           | MODIFY           |
| `shell/plugins/src/index.ts`                         | MODIFY (exports) |
| `interfaces/webserver/src/api/route-handler.ts`      | NEW              |
| `interfaces/webserver/src/server-manager.ts`         | MODIFY           |
| `interfaces/webserver/src/webserver-interface.ts`    | MODIFY           |

---

## Implementation Order

1. API Route Types (`shell/plugins/src/types/`)
2. API Route Registry (`shell/plugins/src/registries/`)
3. ServicePlugin Extension (`shell/plugins/src/base/`)
4. Route Handler (`interfaces/webserver/src/api/`)
5. Server Manager Integration (`interfaces/webserver/src/`)
6. Webserver Interface Wiring (`interfaces/webserver/src/`)

---

## Verification

1. **Unit tests**:
   - ApiRouteRegistry: register, unregister, get, list routes
   - handleApiRoute: JSON response, form redirect, error handling
   - argMapping: correctly maps form fields to tool args

2. **Integration test**:
   - Mount routes from mock plugin
   - POST JSON to /api/mock/action
   - Verify tool invocation and response

3. **E2E test**:
   - Start webserver with plugin that has API routes
   - Submit HTML form to API endpoint
   - Verify redirect to success page
