# Extensible Dashboard System

## Overview

Create a central dashboard where plugins contribute their own widgets. System data and analytics data display together in one unified view.

## Design Principles

- **Plugin-contributed widgets**: Each plugin registers dashboard sections
- **View concerns in view layer**: Widget registry and datasource live in site-builder
- **Message-based registration**: Plugins register widgets via messaging events
- **Type-safe rendering**: Generic widget types with typed data providers
- **Lean shell**: No dashboard infrastructure in shell/core

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dashboard UI (site-builder)                  │
│   Renders widgets by type: stats | list | chart | custom        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              DashboardDataSource (site-builder)                  │
│   Calls each registered widget's dataProvider()                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              DashboardWidgetRegistry (site-builder)              │
│   Stores registered widgets with metadata + dataProvider        │
└─────────────────────────────────────────────────────────────────┘
        ▲                       ▲                       ▲
        │ messaging             │ messaging             │ messaging
┌───────┴───────┐   ┌───────────┴───────────┐   ┌──────┴──────┐
│ System Plugin │   │   Analytics Plugin    │   │  Future...  │
│ - entity stats│   │ - website metrics     │   │             │
│ - job status  │   │ - social engagement   │   │             │
│ - identity    │   │                       │   │             │
└───────────────┘   └───────────────────────┘   └─────────────┘
```

---

## 1. Widget Registry

**File**: `plugins/site-builder/src/dashboard/widget-registry.ts` (NEW)

```typescript
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";

export type WidgetDataProvider = () => Promise<unknown>;

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number().default(50), // Lower = shows first
  section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
  type: z.enum(["stats", "list", "chart", "custom"]),
});

export type DashboardWidgetMeta = z.infer<typeof dashboardWidgetSchema>;

export interface RegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
}

export class DashboardWidgetRegistry {
  private widgets = new Map<string, RegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  register(widget: RegisteredWidget): void {
    const key = `${widget.pluginId}:${widget.id}`;
    this.widgets.set(key, widget);
    this.logger.debug("Dashboard widget registered", {
      key,
      title: widget.title,
    });
  }

  unregister(pluginId: string, widgetId?: string): void {
    if (widgetId) {
      this.widgets.delete(`${pluginId}:${widgetId}`);
    } else {
      for (const key of this.widgets.keys()) {
        if (key.startsWith(`${pluginId}:`)) {
          this.widgets.delete(key);
        }
      }
    }
  }

  list(section?: string): RegisteredWidget[] {
    return Array.from(this.widgets.values())
      .filter((w) => !section || w.section === section)
      .sort((a, b) => a.priority - b.priority);
  }

  async aggregateData(): Promise<
    Record<string, { widget: DashboardWidgetMeta; data: unknown }>
  > {
    const result: Record<
      string,
      { widget: DashboardWidgetMeta; data: unknown }
    > = {};

    for (const [key, widget] of this.widgets) {
      try {
        const data = await widget.dataProvider();
        result[key] = {
          widget: {
            id: widget.id,
            pluginId: widget.pluginId,
            title: widget.title,
            description: widget.description,
            type: widget.type,
            section: widget.section,
            priority: widget.priority,
          },
          data,
        };
      } catch (error) {
        this.logger.error(`Failed to fetch data for widget ${key}`, { error });
      }
    }

    return result;
  }

  get size(): number {
    return this.widgets.size;
  }
}
```

---

## 2. Dashboard DataSource

**File**: `plugins/site-builder/src/dashboard/dashboard-datasource.ts` (NEW)

```typescript
import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { DashboardWidgetRegistry } from "./widget-registry";
import { z } from "@brains/utils";
import { dashboardWidgetSchema } from "./widget-registry";

export const dashboardDataSchema = z.object({
  widgets: z.record(
    z.object({
      widget: dashboardWidgetSchema,
      data: z.unknown(),
    }),
  ),
  buildInfo: z.object({
    timestamp: z.string(),
    version: z.string(),
  }),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;

export class DashboardDataSource implements DataSource {
  readonly id = "dashboard";
  readonly name = "Dashboard DataSource";
  readonly description = "Aggregates dashboard widgets from all plugins";

  constructor(private widgetRegistry: DashboardWidgetRegistry) {}

  async fetch<T>(
    _query: unknown,
    _outputSchema?: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    const widgets = await this.widgetRegistry.aggregateData();

    const data: DashboardData = {
      widgets,
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    return dashboardDataSchema.parse(data) as T;
  }
}
```

---

## 3. Site-Builder Plugin Integration

**File**: `plugins/site-builder/src/plugin.ts` (MODIFY)

Site-builder creates the registry and subscribes to widget registration events:

```typescript
import { DashboardWidgetRegistry } from "./dashboard/widget-registry";
import { DashboardDataSource } from "./dashboard/dashboard-datasource";

export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private widgetRegistry?: DashboardWidgetRegistry;

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Create widget registry
    this.widgetRegistry = new DashboardWidgetRegistry(context.logger);

    // Register datasource
    const dashboardDataSource = new DashboardDataSource(this.widgetRegistry);
    context.entities.registerDataSource(dashboardDataSource);

    // Subscribe to widget registration events from other plugins
    context.messaging.subscribe(
      "site-builder:register-widget",
      async (payload) => {
        const { pluginId, widget } = payload;
        this.widgetRegistry?.register({
          ...widget,
          pluginId,
          priority: widget.priority ?? 50,
          section: widget.section ?? "primary",
        });
        return { success: true };
      },
    );

    context.messaging.subscribe(
      "site-builder:unregister-widget",
      async (payload) => {
        const { pluginId, widgetId } = payload;
        this.widgetRegistry?.unregister(pluginId, widgetId);
        return { success: true };
      },
    );
  }
}
```

---

## 4. System Plugin Widgets

**File**: `plugins/system/src/plugin.ts` (MODIFY)

System plugin registers widgets via messaging:

```typescript
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  // Entity stats widget
  await context.messaging.send("site-builder:register-widget", {
    pluginId: this.id,
    widget: {
      id: "entity-stats",
      title: "Entity Statistics",
      type: "stats",
      section: "primary",
      priority: 10,
      dataProvider: async () => {
        const counts = await this.getEntityCounts(context);
        return counts;
      },
    },
  });

  // Job status widget
  await context.messaging.send("site-builder:register-widget", {
    pluginId: this.id,
    widget: {
      id: "job-status",
      title: "Active Jobs",
      type: "list",
      section: "secondary",
      priority: 20,
      dataProvider: async () => {
        const status = await context.jobs.getStatus();
        return { items: status.activeJobs };
      },
    },
  });

  // Identity widget
  await context.messaging.send("site-builder:register-widget", {
    pluginId: this.id,
    widget: {
      id: "identity",
      title: "Brain Identity",
      type: "custom",
      section: "sidebar",
      priority: 5,
      dataProvider: async () => ({
        identity: context.identity.get(),
        profile: context.identity.getProfile(),
      }),
    },
  });
}
```

---

## 5. Analytics Plugin Widgets

**File**: `plugins/analytics/src/index.ts` (MODIFY)

```typescript
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  // ... existing registration ...

  // Website metrics widget
  await context.messaging.send("site-builder:register-widget", {
    pluginId: this.id,
    widget: {
      id: "website-metrics",
      title: "Website Analytics",
      type: "stats",
      section: "primary",
      priority: 30,
      dataProvider: async () => {
        const metrics = await context.entityService.listEntities("website-metrics", {
          limit: 1,
          sortFields: [{ field: "created", direction: "desc" }],
        });
        const latest = metrics[0]?.metadata;
        return {
          pageviews: latest?.pageviews ?? 0,
          visitors: latest?.visitors ?? 0,
          bounceRate: latest?.bounceRate ?? 0,
          avgTimeOnPage: latest?.avgTimeOnPage ?? 0,
        };
      },
    },
  });

  // Social engagement widget
  await context.messaging.send("site-builder:register-widget", {
    pluginId: this.id,
    widget: {
      id: "social-engagement",
      title: "Social Engagement",
      type: "stats",
      section: "primary",
      priority: 40,
      dataProvider: async () => {
        const metrics = await context.entityService.listEntities("social-metrics", {
          limit: 20,
          sortFields: [{ field: "updated", direction: "desc" }],
        });
        return metrics.reduce(
          (acc, m) => ({
            impressions: acc.impressions + (m.metadata?.impressions ?? 0),
            likes: acc.likes + (m.metadata?.likes ?? 0),
            comments: acc.comments + (m.metadata?.comments ?? 0),
            shares: acc.shares + (m.metadata?.shares ?? 0),
          }),
          { impressions: 0, likes: 0, comments: 0, shares: 0 },
        );
      },
    },
  });
}
```

---

## 6. Dashboard UI Template

**File**: `plugins/site-builder/src/templates/dashboard/layout.tsx` (MODIFY)

```tsx
interface DashboardProps {
  widgets: Record<string, { widget: WidgetMeta; data: unknown }>;
  buildInfo: { timestamp: string; version: string };
}

// Widget renderers by type
const StatsWidget = ({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) => (
  <div className="stats-widget bg-surface rounded-lg p-6 border border-theme">
    <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
    <div className="grid grid-cols-2 gap-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="text-center">
          <span className="text-2xl font-bold text-brand">
            {value.toLocaleString()}
          </span>
          <span className="block text-sm text-theme-muted capitalize">
            {key}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const ListWidget = ({
  title,
  data,
}: {
  title: string;
  data: { items: unknown[] };
}) => (
  <div className="list-widget bg-surface rounded-lg p-6 border border-theme">
    <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
    <ul className="space-y-2">
      {data.items?.map((item, i) => (
        <li key={i} className="text-sm text-theme">
          {JSON.stringify(item)}
        </li>
      ))}
    </ul>
  </div>
);

const CustomWidget = ({ title, data }: { title: string; data: unknown }) => (
  <div className="custom-widget bg-surface rounded-lg p-6 border border-theme">
    <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
    <pre className="text-xs text-theme-muted overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

const WidgetRenderer = ({
  widget,
  data,
}: {
  widget: WidgetMeta;
  data: unknown;
}) => {
  switch (widget.type) {
    case "stats":
      return (
        <StatsWidget
          title={widget.title}
          data={data as Record<string, number>}
        />
      );
    case "list":
      return (
        <ListWidget title={widget.title} data={data as { items: unknown[] }} />
      );
    default:
      return <CustomWidget title={widget.title} data={data} />;
  }
};

export const DashboardLayout = ({ widgets, buildInfo }: DashboardProps) => {
  const widgetArray = Object.values(widgets);
  const bySection = (s: string) =>
    widgetArray
      .filter((w) => w.widget.section === s)
      .sort((a, b) => a.widget.priority - b.widget.priority);

  return (
    <div className="dashboard min-h-screen bg-theme p-8">
      <h1 className="text-3xl font-bold text-heading mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <main className="lg:col-span-2 space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bySection("primary").map(({ widget, data }) => (
              <WidgetRenderer
                key={`${widget.pluginId}:${widget.id}`}
                widget={widget}
                data={data}
              />
            ))}
          </section>

          <section className="space-y-6">
            {bySection("secondary").map(({ widget, data }) => (
              <WidgetRenderer
                key={`${widget.pluginId}:${widget.id}`}
                widget={widget}
                data={data}
              />
            ))}
          </section>
        </main>

        <aside className="space-y-6">
          {bySection("sidebar").map(({ widget, data }) => (
            <WidgetRenderer
              key={`${widget.pluginId}:${widget.id}`}
              widget={widget}
              data={data}
            />
          ))}
        </aside>
      </div>

      <footer className="mt-8 text-sm text-theme-muted">
        Built at {new Date(buildInfo.timestamp).toLocaleString()} • v
        {buildInfo.version}
      </footer>
    </div>
  );
};
```

---

## Files Summary

| File                                                         | Action |
| ------------------------------------------------------------ | ------ |
| `plugins/site-builder/src/dashboard/widget-registry.ts`      | NEW    |
| `plugins/site-builder/src/dashboard/dashboard-datasource.ts` | NEW    |
| `plugins/site-builder/src/dashboard/index.ts`                | NEW    |
| `plugins/site-builder/src/plugin.ts`                         | MODIFY |
| `plugins/system/src/plugin.ts`                               | MODIFY |
| `plugins/analytics/src/index.ts`                             | MODIFY |
| `plugins/site-builder/src/templates/dashboard/layout.tsx`    | MODIFY |
| `plugins/site-builder/src/templates/dashboard/schema.ts`     | MODIFY |

---

## Implementation Order

1. Widget Registry (`plugins/site-builder/src/dashboard/`)
2. Dashboard DataSource (`plugins/site-builder/src/dashboard/`)
3. Site-Builder Plugin Integration (messaging subscriptions)
4. System Plugin Widgets (messaging registration)
5. Analytics Plugin Widgets (messaging registration)
6. Dashboard Template Update

---

## Verification

1. **Unit tests**:
   - DashboardWidgetRegistry: register, unregister, list, aggregateData
   - DashboardDataSource: fetch aggregates all widgets correctly

2. **Integration test**:
   - Site-builder subscribes to events
   - Other plugins send registration messages
   - Verify widgets appear in registry

3. **E2E test**:
   - Start shell with site-builder + system + analytics plugins
   - Navigate to /dashboard
   - Verify entity stats, website metrics, social engagement all display
