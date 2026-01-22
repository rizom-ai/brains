# Newsletter Integration into Professional-Brain

## Overview

Integrate the newsletter plugin into professional-brain with:

1. A new extensible API route system for plugins
2. A hybrid CTA slot system for UI placement
3. Newsletter as the first API-enabled plugin

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
      argMapping: { email: "email", name: "name" },
    },
  ];

  // ... rest of plugin
}
```

---

## Part 2: Webserver API Integration

### API Route Handler

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
      args = applyArgMapping(formData, definition.argMapping);
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

### Mount API Routes in Server

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

// In createPreviewApp() and createProductionApp():
private setupApiRoutes(app: Hono): void {
  if (!this.options.apiRouteRegistry || !this.options.toolInvoker) {
    return;
  }

  const routes = this.options.apiRouteRegistry.getAllRoutes();

  for (const route of routes) {
    const method = route.definition.method.toLowerCase();
    app[method](route.fullPath, async (c) => {
      return handleApiRoute(c, route, this.options.toolInvoker!, this.logger);
    });
  }

  this.logger.info(`Mounted ${routes.length} API routes`);
}
```

### Wire Up in WebserverInterface

**File**: `interfaces/webserver/src/webserver-interface.ts` (MODIFY)

```typescript
import { ApiRouteRegistry } from "@brains/plugins";

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

  // Create tool invoker
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

## Part 3: CTA Slot System

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

## Part 4: Professional-Brain Configuration

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

Pass CTA config through site-builder to layout:

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

### Add Thank-You Route

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

2. **Newsletter Plugin API Routes** (`plugins/newsletter/src/`)
   - Add static apiRoutes to NewsletterPlugin

3. **Webserver API Handler** (`interfaces/webserver/src/`)
   - Create route-handler.ts
   - Modify ServerManager to mount API routes
   - Wire up in WebserverInterface

4. **CTA System** (`shared/ui-library/src/`)
   - Add CTA types
   - Create CTASlot component
   - Export from index

5. **Footer Integration** (`shared/default-site-content/src/`)
   - Add cta prop to Footer

6. **Professional-Brain Config** (`apps/professional-brain/`)
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
| `interfaces/webserver/src/api/route-handler.ts`      | NEW              |
| `interfaces/webserver/src/server-manager.ts`         | MODIFY           |
| `interfaces/webserver/src/webserver-interface.ts`    | MODIFY           |
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
   - Mount routes from mock plugin
   - POST to /api/newsletter/subscribe
   - Verify tool invocation

3. **E2E test**:
   - Build professional-brain site
   - Start webserver
   - Submit newsletter form in footer
   - Verify redirect to thank-you page
   - Check Buttondown for subscriber
