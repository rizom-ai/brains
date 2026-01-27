# Newsletter Integration into Professional-Brain

## Overview

Integrate the newsletter plugin into professional-brain with:

1. Plugin-declared API routes (plugins own their routes)
2. Webserver mounts plugin routes and calls tools via agentService
3. NewsletterSignup component in footer
4. Thank-you/error redirect pages

---

## Architecture Decision

**Plugins declare routes, webserver mounts them.**

Rationale:

- Plugins own their API endpoints (co-located with tool definitions)
- Webserver already serves the site, natural place to handle form POSTs
- No proxy complexity (MCP stays focused on machine protocols)
- Simple: one static array on plugin, webserver iterates and mounts

---

## Part 1: Plugin API Route Support

### API Route Types

**File**: `shell/plugins/src/types/api-routes.ts` (NEW)

```typescript
import { z } from "@brains/utils";

export const apiRouteDefinitionSchema = z.object({
  /** Path suffix (prefixed with /api/{pluginId}) */
  path: z.string(),
  /** HTTP method */
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  /** Tool to invoke (without plugin prefix) */
  tool: z.string(),
  /** Allow unauthenticated access */
  public: z.boolean().default(false),
  /** Redirect URL on success (for form submissions) */
  successRedirect: z.string().optional(),
  /** Redirect URL on error (for form submissions) */
  errorRedirect: z.string().optional(),
});

export type ApiRouteDefinition = z.infer<typeof apiRouteDefinitionSchema>;
```

### ServicePlugin Base Class

**File**: `shell/plugins/src/base/service-plugin.ts` (MODIFY)

Add static property and getter:

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

---

## Part 2: Newsletter Plugin API Routes

**File**: `plugins/newsletter/src/index.ts` (MODIFY)

```typescript
import type { ApiRouteDefinition } from "@brains/plugins";

export class NewsletterPlugin extends ServicePlugin<NewsletterConfig> {
  static readonly apiRoutes: ApiRouteDefinition[] = [
    {
      path: "/subscribe",
      method: "POST",
      tool: "subscribe",
      public: true,
      successRedirect: "/subscribe/thanks",
      errorRedirect: "/subscribe/error",
    },
  ];

  // ... rest of plugin unchanged
}
```

---

## Part 3: Webserver API Route Mounting

**File**: `interfaces/webserver/src/server-manager.ts` (MODIFY)

Add method to mount plugin API routes:

```typescript
private mountPluginApiRoutes(app: Hono): void {
  // Get all plugins from context
  const plugins = this.context?.plugins?.getAll() ?? [];

  for (const plugin of plugins) {
    const routes = plugin.getApiRoutes?.() ?? [];

    for (const route of routes) {
      const fullPath = `/api/${plugin.id}${route.path}`;
      const method = route.method.toLowerCase() as "get" | "post" | "put" | "delete";

      app[method](fullPath, async (c) => {
        try {
          // Parse body (JSON or form data)
          const contentType = c.req.header("content-type") ?? "";
          let args: Record<string, unknown>;

          if (contentType.includes("application/json")) {
            args = await c.req.json();
          } else if (contentType.includes("form")) {
            const formData = await c.req.parseBody();
            args = formData as Record<string, unknown>;
          } else {
            args = {};
          }

          // Call tool via agentService
          const toolName = `${plugin.id}_${route.tool}`;
          const result = await this.agentService.executeTool(toolName, args);

          // Handle response
          const acceptsJson = c.req.header("accept")?.includes("application/json");

          if (result.success) {
            if (!acceptsJson && route.successRedirect) {
              return c.redirect(route.successRedirect);
            }
            return c.json({ success: true, data: result.data });
          } else {
            if (!acceptsJson && route.errorRedirect) {
              const errorUrl = `${route.errorRedirect}?error=${encodeURIComponent(result.error || "Unknown error")}`;
              return c.redirect(errorUrl);
            }
            return c.json({ success: false, error: result.error }, 400);
          }
        } catch (error) {
          this.logger.error("API route error", { path: fullPath, error });
          return c.json({ success: false, error: "Internal server error" }, 500);
        }
      });

      this.logger.info(`Mounted API route: ${method.toUpperCase()} ${fullPath}`);
    }
  }
}
```

Call in server setup (before static file middleware):

```typescript
// In createPreviewApp() and createProductionApp()
this.mountPluginApiRoutes(app);
```

---

## Part 4: Footer Integration

**File**: `plugins/professional-site/src/templates/footer.tsx` (MODIFY)

Add NewsletterSignup to footer:

```typescript
import { NewsletterSignup } from "@brains/ui-library";

// In footer template, add section above footer links:
<div className="mb-8 pb-8 border-b border-theme-muted">
  <NewsletterSignup
    title="Stay Updated"
    description="Get my latest essays delivered to your inbox."
    buttonText="Subscribe"
  />
</div>
```

---

## Part 5: Thank-You/Error Pages

**File**: `plugins/professional-site/src/routes.ts` (MODIFY)

Add routes:

```typescript
{
  id: "subscribe-thanks",
  path: "/subscribe/thanks",
  title: "Thanks for Subscribing",
  layout: "minimal",
  navigation: { show: false },
  sections: [
    {
      id: "message",
      template: "professional-site:message",
      dataQuery: {
        heading: "Thanks for subscribing!",
        message: "Check your inbox to confirm your subscription.",
      },
    },
  ],
},
{
  id: "subscribe-error",
  path: "/subscribe/error",
  title: "Subscription Error",
  layout: "minimal",
  navigation: { show: false },
  sections: [
    {
      id: "message",
      template: "professional-site:message",
      dataQuery: {
        heading: "Something went wrong",
        message: "Please try again or contact me directly.",
      },
    },
  ],
},
```

---

## Part 6: Professional-Brain Configuration

**File**: `apps/professional-brain/brain.config.ts` (MODIFY)

Add newsletter plugin:

```typescript
import { NewsletterPlugin } from "@brains/newsletter";

// Add to plugins array:
new NewsletterPlugin({
  buttondown: {
    apiKey: process.env["BUTTONDOWN_API_KEY"] || "",
  },
}),
```

---

## Implementation Order

1. **API Route Types** - Create `shell/plugins/src/types/api-routes.ts`
2. **ServicePlugin** - Add `getApiRoutes()` method
3. **Export** - Export types from `@brains/plugins`
4. **Newsletter Plugin** - Add `apiRoutes` static property
5. **Webserver** - Add `mountPluginApiRoutes()` method
6. **Footer** - Add NewsletterSignup component
7. **Routes** - Add thank-you/error pages
8. **Config** - Add NewsletterPlugin to brain.config.ts

---

## Files Summary

| File                                                 | Action |
| ---------------------------------------------------- | ------ |
| `shell/plugins/src/types/api-routes.ts`              | NEW    |
| `shell/plugins/src/base/service-plugin.ts`           | MODIFY |
| `shell/plugins/src/index.ts`                         | MODIFY |
| `plugins/newsletter/src/index.ts`                    | MODIFY |
| `interfaces/webserver/src/server-manager.ts`         | MODIFY |
| `plugins/professional-site/src/templates/footer.tsx` | MODIFY |
| `plugins/professional-site/src/routes.ts`            | MODIFY |
| `apps/professional-brain/brain.config.ts`            | MODIFY |

---

## Verification

1. **Unit tests**:
   - ServicePlugin.getApiRoutes() returns declared routes
   - Webserver mounts routes correctly

2. **Integration test**:
   - POST /api/newsletter/subscribe with email
   - Verify tool invocation
   - Verify redirect to thank-you page

3. **E2E test**:
   - Build site with footer
   - Submit form
   - Check Buttondown for subscriber
