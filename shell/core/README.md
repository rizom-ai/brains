# @brains/core

Core shell infrastructure for Personal Brain applications.

## Overview

The core shell provides the foundational infrastructure and plugin system for Brain applications. It manages plugin lifecycle, configuration, and provides base entity support.

## Features

- Plugin management with dependency resolution
- Shell configuration and initialization
- Base entity adapter for markdown storage
- Template system for queries and responses
- Database initialization and management
- Component standardization patterns

## Installation

```bash
bun add @brains/core
```

## Usage

```typescript
import { Shell } from "@brains/core";

// Create and initialize shell
const shell = await Shell.initialize({
  database: {
    url: process.env.DATABASE_URL || "file:./brain.db",
  },
  plugins: [
    // Your plugins here
  ],
});

// Access shell instance
const shell = Shell.getInstance();
```

## Architecture

### Shell Class

The main entry point that orchestrates all core services:

```typescript
class Shell {
  // Singleton instance management
  static getInstance(): Shell;
  static initialize(config: ShellConfig): Promise<Shell>;
  static resetInstance(): void;
  
  // Core services
  pluginManager: PluginManager;
  config: ShellConfig;
}
```

### Plugin Manager

Handles plugin registration and dependency resolution:

- Automatically resolves plugin dependencies
- Initializes plugins in correct order
- Provides plugin context with all shell services
- Handles plugin failures gracefully

### Base Entity Adapter

Provides markdown serialization for all entity types:

```typescript
class BaseEntityAdapter {
  // Convert entity to markdown with frontmatter
  toMarkdown(entity: BaseEntity): string;
  
  // Parse markdown to entity
  fromMarkdown(markdown: string, type: string): BaseEntity;
}
```

## Configuration

```typescript
interface ShellConfig {
  database: {
    url: string;
  };
  plugins?: Plugin[];
  // Additional config options
}
```

## Templates

Built-in templates for common operations:

- **knowledge-query**: Template for knowledge base queries
- **query-response**: Template for formatting query responses

## Testing

The package includes testing utilities:

```typescript
import { createMockShell } from "@brains/core/test";

const mockShell = createMockShell({
  // Test configuration
});
```

## API Reference

### Shell Methods

- `initialize(config)` - Initialize shell with configuration
- `getInstance()` - Get singleton instance
- `resetInstance()` - Reset for testing

### Exports

- `Shell` - Main shell class
- `BaseEntityAdapter` - Entity markdown adapter
- `baseEntitySchema` - Zod schema for base entity
- `shellConfigSchema` - Configuration schema
- Templates and utilities

## License

MIT