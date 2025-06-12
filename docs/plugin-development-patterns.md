# Plugin Development Patterns

This document outlines the standardized patterns for developing plugins in the Personal Brain system.

## Table of Contents

1. [Plugin Configuration](#plugin-configuration)
2. [Direct Service Access](#direct-service-access)
3. [Testing Patterns](#testing-patterns)
4. [Common Plugin Patterns](#common-plugin-patterns)

## Plugin Configuration

### Using Zod for Configuration Validation

All plugins should use Zod schemas for configuration validation. This provides:
- Type safety
- Runtime validation
- Helpful error messages
- Auto-generated TypeScript types

```typescript
import { z } from "zod";
import { createPluginConfig, validatePluginConfig } from "@brains/utils";

// Define your plugin-specific configuration
const configSchema = createPluginConfig({
  apiKey: z.string().describe("API key for the service"),
  endpoint: z.string().url().optional().describe("API endpoint"),
  timeout: z.number().min(0).default(5000).describe("Request timeout in ms"),
});

// Extract the type
type PluginConfig = z.infer<typeof configSchema>;

// In your plugin class
class MyPlugin implements Plugin {
  private config: PluginConfig;

  constructor(config: unknown) {
    // Validate and parse configuration
    this.config = validatePluginConfig(
      configSchema,
      config,
      "my-plugin"
    );
  }
}
```

### Base Configuration Fields

All plugins automatically inherit these base configuration fields:
- `enabled`: Whether the plugin is enabled (default: true)
- `debug`: Enable debug logging for this plugin (default: false)

## Direct Service Access

### Accessing Services Through Context

Plugins should access services directly through the `PluginContext` rather than using registry lookups:

```typescript
class MyPlugin implements Plugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { 
      logger,
      entityService,
      contentTypeRegistry,
      formatters,
      messageBus
    } = context;

    // Use services directly
    const entities = await entityService.search({
      entityType: "note",
      query: "example"
    });

    // Register content types
    contentTypeRegistry.register(
      "my-plugin/custom-type",
      mySchema,
      myFormatter
    );

    return {
      tools: this.getTools(),
      resources: []
    };
  }
}
```

### Available Services

The following services are available through `PluginContext`:

- `entityService`: CRUD operations on entities
- `contentTypeRegistry`: Register and manage content types
- `formatters`: Access to formatting utilities
- `messageBus`: Publish/subscribe to system events
- `logger`: Logging with plugin-specific context

## Testing Patterns

### Using Plugin Test Utilities

The `@brains/plugin-test-utils` package provides comprehensive testing utilities:

```typescript
import { 
  PluginTester,
  ConfigTester,
  createMockPlugin,
  PluginTestHarness 
} from "@brains/plugin-test-utils";

describe("MyPlugin", () => {
  // Test plugin lifecycle
  it("should register successfully", async () => {
    const plugin = new MyPlugin({ apiKey: "test" });
    const tester = new PluginTester(plugin);
    
    await tester.testRegistration();
    await tester.testToolsStructure();
  });

  // Test configuration
  it("should validate configuration", () => {
    const tester = new ConfigTester(configSchema, "my-plugin");
    
    tester.testConfig({
      name: "valid config",
      config: { apiKey: "test-key" },
      shouldPass: true
    });
    
    tester.testConfig({
      name: "missing required field",
      config: {},
      shouldPass: false,
      expectedError: "Required"
    });
  });

  // Test with mock services
  it("should interact with entity service", async () => {
    const harness = new PluginTestHarness();
    const plugin = new MyPlugin({ apiKey: "test" });
    
    await harness.installPlugin(plugin);
    
    // Create test data
    await harness.createEntity({
      entityType: "note",
      content: "Test note"
    });
    
    // Test plugin functionality
    const tool = harness.getTool("my-tool");
    const result = await tool.handler({});
    
    expect(result).toBeDefined();
  });
});
```

### Testing Tool Validation

```typescript
it("should validate tool input", async () => {
  const tester = new PluginTester(plugin);
  
  // Test with valid input
  const result = await tester.testToolExecution("my-tool", {
    validParam: "value"
  });
  expect(result).toHaveProperty("success", true);
  
  // Test with invalid input
  await tester.testToolValidation("my-tool", {
    invalidParam: 123
  });
});
```

### Testing Progress Reporting

```typescript
it("should report progress", async () => {
  const plugin = createProgressPlugin();
  const tester = new PluginTester(plugin);
  
  await tester.testRegistration();
  
  let progressCount = 0;
  const sendProgress = async (): Promise<void> => {
    progressCount++;
  };
  
  const tool = tester.findTool("progress_tool");
  await tool.handler(
    { steps: 3 },
    { sendProgress }
  );
  
  expect(progressCount).toBe(3);
});
```

## Common Plugin Patterns

### Content Generation Plugin

Plugins that generate content should:
1. Define content schemas using Zod
2. Register content types with the registry
3. Provide appropriate formatters

```typescript
class ContentPlugin implements Plugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { contentTypeRegistry } = context;
    
    // Define schema
    const articleSchema = z.object({
      title: z.string(),
      summary: z.string(),
      sections: z.array(z.object({
        heading: z.string(),
        content: z.string()
      }))
    });
    
    // Register with formatter
    contentTypeRegistry.register(
      "content-plugin/article",
      articleSchema,
      new ArticleFormatter()
    );
    
    return {
      tools: [{
        name: "generate_article",
        description: "Generate an article",
        inputSchema: {
          topic: z.string(),
          style: z.enum(["technical", "casual"]).optional()
        },
        handler: async (input) => {
          // Implementation
        }
      }],
      resources: []
    };
  }
}
```

### Entity Processing Plugin

Plugins that process entities should:
1. Use EntityService for all entity operations
2. Handle entity types properly
3. Respect system conventions

```typescript
class ProcessorPlugin implements Plugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { entityService, logger } = context;
    
    return {
      tools: [{
        name: "process_entities",
        description: "Process entities of a specific type",
        inputSchema: {
          entityType: z.string(),
          filter: z.string().optional()
        },
        handler: async (input) => {
          const entities = await entityService.search({
            entityType: input.entityType,
            query: input.filter
          });
          
          for (const entity of entities) {
            logger.debug(`Processing entity ${entity.id}`);
            // Process entity
            
            // Update if needed
            await entityService.updateEntity(entity.id, {
              processed: true,
              processedAt: new Date().toISOString()
            });
          }
          
          return {
            processed: entities.length,
            message: `Processed ${entities.length} entities`
          };
        }
      }],
      resources: []
    };
  }
}
```

### Event-Driven Plugin

Plugins that respond to system events:

```typescript
class EventPlugin implements Plugin {
  private unsubscribe?: () => void;
  
  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { messageBus, logger } = context;
    
    // Subscribe to events
    this.unsubscribe = messageBus.subscribe(
      "entity:created",
      async (message) => {
        logger.info(`New entity created: ${message.payload.id}`);
        // Handle the event
      }
    );
    
    return {
      tools: [],
      resources: []
    };
  }
  
  async shutdown(): Promise<void> {
    // Clean up subscriptions
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
```

## Best Practices

1. **Configuration**: Always validate configuration with Zod schemas
2. **Error Handling**: Provide meaningful error messages for users
3. **Testing**: Use the plugin test utilities for comprehensive testing
4. **Logging**: Use the provided logger with appropriate log levels
5. **Cleanup**: Implement shutdown() to clean up resources
6. **Type Safety**: Leverage TypeScript's type system fully
7. **Documentation**: Document your plugin's configuration and tools

## Migration Guide

If you're updating an existing plugin to use these patterns:

1. **Configuration Migration**:
   ```typescript
   // Old
   interface Config {
     apiKey: string;
   }
   
   // New
   const configSchema = createPluginConfig({
     apiKey: z.string()
   });
   ```

2. **Service Access Migration**:
   ```typescript
   // Old
   const shell = this.registry.resolve<Shell>("shell");
   const entityService = shell.getEntityService();
   
   // New
   const { entityService } = context;
   ```

3. **Testing Migration**:
   ```typescript
   // Old - manual mocking
   const mockEntityService = {
     search: jest.fn(),
     // ...
   };
   
   // New - use test harness
   const harness = new PluginTestHarness();
   await harness.installPlugin(plugin);
   ```