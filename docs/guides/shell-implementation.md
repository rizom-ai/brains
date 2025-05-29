# Shell Implementation Guide

This guide explains the shell package architecture. The shell is **already implemented** and provides the core infrastructure for the Personal Brain application.

## Current Implementation

The shell package includes:

1. **Registry system** - Component registration with singleton pattern
2. **Plugin framework** - Plugin lifecycle management
3. **Entity model** - Base types and registry for entities
4. **Database infrastructure** - SQLite with Drizzle ORM and vector support
5. **Messaging system** - Pub/sub message bus
6. **Query processor** - Natural language query handling
7. **AI services** - FastEmbed for embeddings, Anthropic for chat
8. **MCP integration** - Tool and resource adapters

## Shell Status

✅ **COMPLETE** - The shell package is fully implemented with all core components

## Starting a New Project (If Needed)

If creating a new monorepo with Bun:

```bash
# Create the monorepo
bun create turbo@latest
cd personal-brain

# Create the shell package
mkdir -p packages/shell
cd packages/shell

# Initialize the package
bun init
```

## Directory Structure

Set up the shell package with the following structure:

```
shell/
├── src/
│   ├── registry/       # Component registry
│   ├── plugins/        # Plugin system
│   ├── entity/         # Entity model
│   ├── db/             # Database infrastructure
│   ├── messaging/      # Messaging system
│   ├── server/         # MCP server
│   ├── ai/             # AI services
│   │   ├── embedding/  # Embedding services
│   │   └── tagging/    # Tagging services
│   └── utils/          # Utilities
├── drizzle.config.ts   # Drizzle configuration
└── package.json        # Package configuration
```

## Implementation Steps

### 1. Set Up Registry System

The registry system provides a centralized way to manage components:

1. Create `src/registry/registry.ts` with the Registry class
2. Implement register/resolve/has methods
3. Add support for singleton components
4. Add lifecycle management (initialize, etc.)

```typescript
// Example Registry implementation
export class Registry {
  private components: Map<string, any> = new Map();
  private factories: Map<string, (...args: any[]) => any> = new Map();

  public register<T>(id: string, factory: (...args: any[]) => T): void {
    this.factories.set(id, factory);
  }

  public resolve<T>(id: string): T {
    // Implementation here
  }
}
```

### 2. Implement Plugin System

The plugin system enables extension of the application:

1. Create `src/plugins/pluginManager.ts` with the PluginManager class
2. Define plugin interfaces
3. Implement registration, initialization, and lifecycle management
4. Add dependency resolution

```typescript
// Example Plugin interface
export interface Plugin {
  id: string;
  version: string;
  dependencies?: string[];
  register(context: PluginContext): PluginLifecycle;
}

// Example PluginManager implementation
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  public registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  public async initializePlugins(): Promise<void> {
    // Implementation here
  }
}
```

### 3. Set Up Entity Model

The entity model provides a unified way to handle different types of content:

1. Create `src/entity/entityRegistry.ts` with the EntityRegistry class
2. Define base entity interfaces and Zod schemas
3. Implement adapter interfaces for entity types
4. Create markdown-centric conversion utilities

Key design principles:

- Use markdown as the primary storage format
- Leverage frontmatter for metadata
- Keep entity schemas extensible

```typescript
// Example EntityRegistry implementation
export class EntityRegistry {
  private entitySchemas: Map<string, z.ZodType<any>> = new Map();
  private entityAdapters: Map<string, EntityAdapter<any>> = new Map();

  public registerEntityType<T extends BaseEntity>(
    type: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ): void {
    this.entitySchemas.set(type, schema);
    this.entityAdapters.set(type, adapter);
  }
}
```

### 4. Implement Database Infrastructure

Set up the database using Drizzle ORM:

1. Create `src/db/schema.ts` with entity table definitions
2. Set up `drizzle.config.ts` for migrations
3. Create database migration utilities
4. Implement database connection management

```typescript
// Example schema
export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  created: text("created").notNull(),
  updated: text("updated").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().default("[]"),
  markdown: text("markdown").notNull(),
});
```

### 5. Create Entity Service

Implement the EntityService that handles entity operations:

1. Create `src/entity/entityService.ts`
2. Implement CRUD operations for entities
3. Add search capabilities (by tags and semantic)
4. Integrate with embedding and tagging services

```typescript
// Example EntityService implementation
export class EntityService {
  constructor(
    private entityRegistry: EntityRegistry,
    private db: DrizzleDB,
    private embeddingService: EmbeddingService,
    private taggingService: TaggingService,
    private logger: Logger,
  ) {}

  async saveEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T> {
    // Implementation here
  }
}
```

### 6. Implement Messaging System

Create a messaging system for cross-component communication:

1. Create `src/messaging/messageBus.ts`
2. Define message schemas with Zod
3. Implement publish/subscribe mechanisms
4. Add message validation

```typescript
// Example MessageBus implementation
export class MessageBus {
  private handlers: Map<string, Set<MessageHandler>> = new Map();

  public registerHandler(messageType: string, handler: MessageHandler): void {
    // Implementation here
  }

  public async publish(message: Message): Promise<void> {
    // Implementation here
  }
}
```

### 7. Set Up MCP Server

Implement the MCP server for external communication:

1. Create `src/server/mcpServer.ts`
2. Implement HTTP and stdio interfaces
3. Set up message handling
4. Add tool registration

```typescript
// Example MCPServer implementation
export class MCPServer {
  constructor(
    private registry: Registry,
    private pluginManager: PluginManager,
    private logger: Logger,
  ) {}

  public async start(): Promise<void> {
    // Implementation here
  }
}
```

### 8. AI Services

Implement embeddings and tagging services:

1. Create `src/ai/embedding/embeddingService.ts`
2. Create `src/ai/tagging/taggingService.ts`
3. Integrate with third-party AI providers
4. Add utilities for vector operations

```typescript
// Example EmbeddingService implementation
export class EmbeddingService {
  constructor(
    private config: EmbeddingConfig,
    private logger: Logger,
  ) {}

  async embed(text: string): Promise<number[]> {
    // Implementation here
  }

  async calculateSimilarity(a: number[], b: number[]): Promise<number> {
    // Implementation here
  }
}
```

## Integration Testing

After implementing the skeleton, test the core functionality:

1. Create a simple plugin
2. Register an entity type
3. Perform CRUD operations
4. Test the messaging system
5. Verify plugin lifecycle

## Next Steps

Once the shell is implemented, you can:

1. Implement the first context (Note) as a separate package
2. Create CLI and Matrix interfaces
3. Build the main application that uses the shell
4. Add more contexts over time
