# @brains/datasource

DataSource registry for dynamic content fetching in the Brains architecture.

## Overview

DataSources provide data for templates through three main operations:

- **fetch**: Retrieve existing data (dashboards, API data, system stats)
- **generate**: Create new content (AI-generated content, reports)
- **transform**: Convert content between formats (markdown to HTML, data formatting)

Templates reference DataSources via their `dataSourceId` property, enabling dynamic content that's fetched at build time rather than stored as static entities.

## Core Concepts

### DataSource Interface

```typescript
interface IDataSource {
  id: string; // Unique identifier
  name: string; // Human-readable name
  description?: string; // Optional description

  // Implement the methods you need
  fetch?: (query?: unknown) => Promise<unknown>;
  generate?: (request: unknown) => Promise<unknown>;
  transform?: (content: unknown, format: string) => Promise<unknown>;
}
```

### DataSource Registry

Central registry for all DataSources in the system:

```typescript
import { DataSourceRegistry } from "@brains/datasource";

const registry = DataSourceRegistry.getInstance();

// Register a data source
registry.register(myDataSource);

// Get a data source
const dataSource = registry.get("my-datasource-id");

// List all data sources with fetch capability
const fetchDataSources = registry.getByCapability("canFetch");
```

## Usage Examples

### 1. Fetch DataSource (Dashboard Stats)

```typescript
import { FetchDataSource } from "@brains/datasource";

class SystemStatsDataSource extends FetchDataSource {
  readonly id = "system-stats";
  readonly name = "System Statistics";
  readonly description = "Provides real-time system statistics";

  async fetch(query?: unknown) {
    // Fetch live data from entity service
    const entityStats = await this.getEntityStats();
    const recentEntities = await this.getRecentEntities();

    return {
      entityStats,
      recentEntities,
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };
  }
}
```

### 2. Generate DataSource (AI Content)

```typescript
import { GenerateDataSource } from "@brains/datasource";

class AIContentDataSource extends GenerateDataSource {
  readonly id = "ai-content";
  readonly name = "AI Content Generator";

  async generate(request: { prompt: string; schema: object }) {
    // Use AI service to generate content
    return await this.aiService.generateContent(request.prompt, request.schema);
  }
}
```

### 3. Transform DataSource (Format Converter)

```typescript
import { TransformDataSource } from "@brains/datasource";

class MarkdownTransformDataSource extends TransformDataSource {
  readonly id = "markdown-transform";
  readonly name = "Markdown Transformer";

  async transform(content: string, format: "html" | "pdf") {
    if (format === "html") {
      return this.markdownToHtml(content);
    } else if (format === "pdf") {
      return this.markdownToPdf(content);
    }
    throw new Error(`Unsupported format: ${format}`);
  }
}
```

### 4. Multi-Capability DataSource

```typescript
import { BaseDataSource } from "@brains/datasource";

class ContentAPIDataSource extends BaseDataSource {
  readonly id = "content-api";
  readonly name = "Content API DataSource";

  async fetch(query: { endpoint: string }) {
    return await this.apiClient.get(query.endpoint);
  }

  async generate(request: { template: string; data: object }) {
    return await this.templateEngine.render(request.template, request.data);
  }

  async transform(content: object, format: string) {
    return await this.formatConverter.convert(content, format);
  }
}
```

## Integration with Templates

Templates reference DataSources via `dataSourceId`:

```typescript
import { createTemplate } from "@brains/templates";

const dashboardTemplate = createTemplate({
  name: "dashboard",
  description: "System dashboard with live stats",
  schema: DashboardSchema,
  dataSourceId: "system-stats", // References the DataSource
  layout: {
    component: DashboardComponent,
    interactive: true,
  },
});
```

At build time, the RenderService will:

1. Check if template has `dataSourceId`
2. Get the DataSource from registry
3. Call `dataSource.fetch()` to get fresh data
4. Render the template with live data

## Base Classes

The package provides several base classes to reduce boilerplate:

- **`BaseDataSource`**: Full-featured base class with all capabilities
- **`FetchDataSource`**: For read-only data sources (dashboards, APIs)
- **`GenerateDataSource`**: For content creation (AI, reports)
- **`TransformDataSource`**: For format conversion (markdown, data formatting)

Choose the appropriate base class based on your needs.

## Registry Operations

### Registration

```typescript
// Register individual data source
registry.register(myDataSource);

// Bulk registration
const dataSources = [dataSource1, dataSource2, dataSource3];
dataSources.forEach((ds) => registry.register(ds));
```

### Discovery

```typescript
// Get all data sources
const all = registry.list();

// Get by capability
const fetchDataSources = registry.getByCapability("canFetch");
const generateDataSources = registry.getByCapability("canGenerate");

// Custom search
const apiDataSources = registry.find((ds) => ds.id.includes("api"));

// Get statistics
const stats = registry.getStats();
console.log(`Total: ${stats.total}, Fetch: ${stats.byCapability.canFetch}`);
```

### Management

```typescript
// Check existence
if (registry.has("my-datasource")) {
  // Data source exists
}

// Remove data source
registry.unregister("old-datasource");

// Clear all (testing)
registry.clear();
```

## Architecture Benefits

1. **Separation of Concerns**: DataSources handle data, templates handle presentation
2. **Dynamic Content**: Fresh data at build time vs stale stored entities
3. **Reusability**: DataSources can be used by multiple templates
4. **Extensibility**: Easy to add new data sources and capabilities
5. **Type Safety**: Full TypeScript support with runtime validation
6. **Testing**: Easy to mock and test individual components

## vs Entity Pattern

| Aspect         | DataSource Pattern             | Entity Pattern             |
| -------------- | ------------------------------ | -------------------------- |
| Data Freshness | Live at build time             | Stored/cached              |
| Use Case       | Dashboards, APIs, system stats | Articles, static content   |
| Storage        | None (fetched)                 | Database entities          |
| Performance    | Fresh but slower               | Fast but potentially stale |
| AI Generation  | On-demand                      | Pre-generated              |

Use DataSources for dynamic data that changes frequently, and Entities for static content that doesn't change often.
