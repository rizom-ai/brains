# Newsletter Integration into Professional-Brain

## Overview

Integrate the newsletter plugin into professional-brain with:

1. A new extensible API route system for plugins (in MCP interface)
2. Webserver proxies `/api/*` to MCP for same-origin form submissions
3. A hybrid CTA slot system for UI placement
4. Newsletter as the first API-enabled plugin

---

## Architecture Decision

**API routes live in MCP, webserver proxies to it.**

Rationale:

- MCP already has `/api/chat` endpoint with `agentService` access
- MCP is the "programmatic interface" - APIs fit there conceptually
- Webserver stays focused on static files
- Proxy ensures same-origin for HTML form POSTs (no CORS issues)
- Only explicitly declared tools are exposed (not all tools)

---

## Part 1: Plugin API Route System

### Design Principles

- **Explicit over implicit**: Plugins declare which tools to expose as HTTP endpoints
- **Co-located**: Route definitions live with plugin code
- **Extensible**: Per-route middleware, auth, rate limiting
- **Form-friendly**: Support both JSON API and HTML form submissions

### New Types

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
```

### Plugin Base Class Extension

**File**: `shell/plugins/src/base/service-plugin.ts` (MODIFY)

Add static property for API routes:

```typescript
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

### API Route Registry

**File**: `shell/plugins/src/registries/api-route-registry.ts` (NEW)

```typescript
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

### Newsletter Plugin API Routes

**File**: `plugins/newsletter/src/index.ts` (MODIFY)

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
    },
  ];

  // ... rest of plugin
}
```

---

## Part 2: MCP API Route Integration

### API Route Handler

**File**: `interfaces/mcp/src/api/route-handler.ts` (NEW)

```typescript
import type { Request, Response } from "express";
import type { RegisteredApiRoute } from "@brains/plugins";
import type { Logger } from "@brains/utils";

export type ToolInvoker = (
  pluginId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export async function handleApiRoute(
  req: Request,
  res: Response,
  route: RegisteredApiRoute,
  toolInvoker: ToolInvoker,
  logger: Logger,
): Promise<void> {
  const { definition, pluginId } = route;

  try {
    // Parse input (JSON or form data)
    const args = definition.formData ? req.body : req.body;

    // Invoke tool
    const result = await toolInvoker(pluginId, definition.tool, args);

    // Determine response type
    const acceptsJson = req.headers.accept?.includes("application/json");
    const isFormSubmit = req.headers["content-type"]?.includes("form");

    if (result.success) {
      if (!acceptsJson && isFormSubmit && definition.successRedirect) {
        res.redirect(definition.successRedirect);
        return;
      }
      res.json({ success: true, data: result.data });
    } else {
      if (!acceptsJson && isFormSubmit && definition.errorRedirect) {
        const errorUrl = `${definition.errorRedirect}?error=${encodeURIComponent(result.error || "Unknown error")}`;
        res.redirect(errorUrl);
        return;
      }
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error("API route error", { path: route.fullPath, error });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
```

### Mount Plugin Routes in MCP HTTP Server

**File**: `interfaces/mcp/src/transports/http-server.ts` (MODIFY)

Add after existing `/api/chat` route:

```typescript
import type { ApiRouteRegistry } from "@brains/plugins";
import { handleApiRoute, type ToolInvoker } from "../api/route-handler";

// Add to class properties:
private apiRouteRegistry: ApiRouteRegistry | null = null;
private toolInvoker: ToolInvoker | null = null;

// Add method to connect API routes:
public connectApiRoutes(
  registry: ApiRouteRegistry,
  toolInvoker: ToolInvoker,
): void {
  this.apiRouteRegistry = registry;
  this.toolInvoker = toolInvoker;

  // Mount all plugin-declared routes
  for (const route of registry.getAllRoutes()) {
    const method = route.definition.method.toLowerCase() as "get" | "post" | "put" | "delete";

    this.app[method](
      route.fullPath,
      asyncHandler(async (req, res) => {
        // Check auth if route is not public
        if (!route.definition.public) {
          // Use existing auth middleware logic
          const authHeader = req.headers.authorization;
          if (!authHeader || !this.validateToken(authHeader)) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }
        }

        await handleApiRoute(req, res, route, this.toolInvoker!, this.logger);
      }),
    );
  }

  this.logger.info(`Mounted ${registry.getAllRoutes().length} plugin API routes`);
}
```

### Wire Up in MCP Interface

**File**: `interfaces/mcp/src/mcp-interface.ts` (MODIFY)

```typescript
import { ApiRouteRegistry } from "@brains/plugins";

// In onRegister, after connecting agent service:
// Collect and mount plugin API routes
const apiRouteRegistry = new ApiRouteRegistry();

for (const plugin of context.plugins.getAll()) {
  if (typeof plugin.getApiRoutes === "function") {
    for (const route of plugin.getApiRoutes()) {
      apiRouteRegistry.register(plugin.id, route);
    }
  }
}

const toolInvoker: ToolInvoker = async (pluginId, toolName, args) => {
  // Use tool registry to invoke directly
  const tool = context.tools.get(`${pluginId}_${toolName}`);
  if (!tool) {
    return { success: false, error: `Tool ${toolName} not found` };
  }
  return tool.handler(args, { interfaceType: "mcp-http", userId: "anonymous" });
};

httpServer.connectApiRoutes(apiRouteRegistry, toolInvoker);
```

---

## Part 3: Webserver Proxy to MCP

### Add Proxy Middleware

**File**: `interfaces/webserver/src/server-manager.ts` (MODIFY)

```typescript
// Add proxy for /api/* routes to MCP
private setupApiProxy(app: Hono, mcpPort: number): void {
  app.all("/api/*", async (c) => {
    const targetUrl = `http://localhost:${mcpPort}${c.req.path}`;

    try {
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.header(),
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      });

      // Forward response
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      this.logger.error("API proxy error", { path: c.req.path, error });
      return c.json({ success: false, error: "API unavailable" }, 502);
    }
  });
}

// Call in createPreviewApp() and createProductionApp() BEFORE static middleware:
this.setupApiProxy(app, this.options.mcpPort ?? 3333);
```

### Update Webserver Config

**File**: `interfaces/webserver/src/config.ts` (MODIFY)

```typescript
export const webserverConfigSchema = z.object({
  // existing fields...
  mcpPort: z.number().default(3333), // Port where MCP HTTP server runs
});
```

---

## Part 4: CTA Slot System

### CTA Types

**File**: `shared/ui-library/src/types/cta.ts` (NEW)

```typescript
export type CTAConfig =
  | {
      type: "link";
      label: string;
      href: string;
      variant?: "primary" | "secondary";
    }
  | {
      type: "newsletter";
      title?: string;
      description?: string;
      buttonText?: string;
      action?: string;
    };
```

### CTASlot Component

**File**: `shared/ui-library/src/CTASlot.tsx` (NEW)

```typescript
import type { JSX } from "preact";
import type { CTAConfig } from "./types/cta";
import { LinkButton } from "./LinkButton";
import { NewsletterSignup } from "./NewsletterSignup";

export interface CTASlotProps {
  config: CTAConfig;
  className?: string;
}

export function CTASlot({ config, className = "" }: CTASlotProps): JSX.Element {
  if (config.type === "link") {
    return (
      <LinkButton
        href={config.href}
        variant={config.variant || "primary"}
        className={className}
      >
        {config.label}
      </LinkButton>
    );
  }

  if (config.type === "newsletter") {
    return (
      <NewsletterSignup
        title={config.title}
        description={config.description}
        buttonText={config.buttonText}
        action={config.action || "/api/newsletter/subscribe"}
        className={className}
      />
    );
  }

  return <></>;
}
```

### Footer Integration

**File**: `shared/default-site-content/src/footer.tsx` (MODIFY)

Add optional `cta` prop:

```typescript
import { CTASlot, type CTAConfig } from "@brains/ui-library";

export interface FooterProps {
  // existing props...
  cta?: CTAConfig;
}

export function Footer({ cta, ...props }: FooterProps): JSX.Element {
  return (
    <footer className="py-8 bg-footer">
      <div className="container mx-auto px-4 max-w-6xl">
        {cta && (
          <div className="mb-8 pb-8 border-b border-theme-muted">
            <CTASlot config={cta} />
          </div>
        )}
        <FooterContent {...props} />
      </div>
    </footer>
  );
}
```

---

## Part 5: Professional-Brain Configuration

### Add Newsletter Plugin

**File**: `apps/professional-brain/brain.config.ts` (MODIFY)

```typescript
import { NewsletterPlugin } from "@brains/newsletter";

// Add to plugins array:
new NewsletterPlugin({
  buttondown: {
    apiKey: process.env["BUTTONDOWN_API_KEY"] || "",
    doubleOptIn: true,
  },
  autoSendOnPublish: false,
}),
```

### Configure Footer CTA

```typescript
siteBuilderPlugin({
  // existing config...
  footerCta: {
    type: "newsletter",
    title: "Stay Updated",
    description: "Get my latest essays delivered to your inbox.",
    buttonText: "Subscribe",
  },
}),
```

### Add Thank-You Routes

**File**: `plugins/professional-site/src/routes.ts` (MODIFY)

```typescript
{
  id: "subscribe-thanks",
  path: "/subscribe/thanks",
  title: "Thanks for Subscribing",
  layout: "minimal",
  navigation: { show: false },
  sections: [
    { id: "thanks", template: "professional-site:message", dataQuery: {
      heading: "Thanks for subscribing!",
      message: "Check your inbox to confirm your subscription.",
    }},
  ],
},
{
  id: "subscribe-error",
  path: "/subscribe/error",
  title: "Subscription Error",
  layout: "minimal",
  navigation: { show: false },
  sections: [
    { id: "error", template: "professional-site:message", dataQuery: {
      heading: "Something went wrong",
      message: "Please try again or contact me directly.",
    }},
  ],
},
```

---

## Implementation Order

1. **API Route Types & Registry** (`shell/plugins/src/`)
   - Add types for ApiRouteDefinition
   - Create ApiRouteRegistry
   - Extend ServicePlugin base class
   - Export from index

2. **Newsletter Plugin API Routes** (`plugins/newsletter/src/`)
   - Add static apiRoutes to NewsletterPlugin

3. **MCP API Route Handler** (`interfaces/mcp/src/`)
   - Create api/route-handler.ts
   - Modify http-server.ts to mount plugin routes
   - Wire up in mcp-interface.ts

4. **Webserver Proxy** (`interfaces/webserver/src/`)
   - Add mcpPort to config
   - Add proxy middleware for /api/\*

5. **CTA System** (`shared/ui-library/src/`)
   - Add CTA types
   - Create CTASlot component
   - Export from index

6. **Footer Integration** (`shared/default-site-content/src/`)
   - Add cta prop to Footer

7. **Professional-Brain Config** (`apps/professional-brain/`)
   - Add newsletter plugin
   - Configure footer CTA
   - Add thank-you/error routes

---

## Files Summary

| File                                                 | Action           |
| ---------------------------------------------------- | ---------------- |
| `shell/plugins/src/types/api-routes.ts`              | NEW              |
| `shell/plugins/src/registries/api-route-registry.ts` | NEW              |
| `shell/plugins/src/base/service-plugin.ts`           | MODIFY           |
| `shell/plugins/src/index.ts`                         | MODIFY (exports) |
| `plugins/newsletter/src/index.ts`                    | MODIFY           |
| `interfaces/mcp/src/api/route-handler.ts`            | NEW              |
| `interfaces/mcp/src/transports/http-server.ts`       | MODIFY           |
| `interfaces/mcp/src/mcp-interface.ts`                | MODIFY           |
| `interfaces/webserver/src/config.ts`                 | MODIFY           |
| `interfaces/webserver/src/server-manager.ts`         | MODIFY           |
| `shared/ui-library/src/types/cta.ts`                 | NEW              |
| `shared/ui-library/src/CTASlot.tsx`                  | NEW              |
| `shared/ui-library/src/index.ts`                     | MODIFY (exports) |
| `shared/default-site-content/src/footer.tsx`         | MODIFY           |
| `apps/professional-brain/brain.config.ts`            | MODIFY           |
| `plugins/professional-site/src/routes.ts`            | MODIFY           |

---

## Verification

1. **Unit tests**:
   - ApiRouteRegistry: register, get, list routes
   - handleApiRoute: JSON response, form redirect, error handling
   - CTASlot: renders link vs newsletter correctly

2. **Integration test**:
   - Start MCP with newsletter plugin
   - POST to /api/newsletter/subscribe
   - Verify tool invocation and response

3. **E2E test**:
   - Start both MCP and webserver
   - Build professional-brain site
   - Submit newsletter form in footer
   - Verify proxy forwards to MCP
   - Verify redirect to thank-you page
   - Check Buttondown for subscriber
