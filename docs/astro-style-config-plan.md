# Astro-Style Configuration Pattern for Brain Apps

## Overview

This document outlines the design and implementation of an Astro-style configuration pattern for Brain applications. The goal is to eliminate the need for separate `index.ts` files and YAML configuration by making `brain.config.ts` the single entry point for apps.

## Motivation

### Current Pain Points

1. **Multiple Files for Simple Apps**:
   - `index.ts` contains app initialization logic
   - Potential config files (YAML) for deployment settings
   - Migration scripts duplicate configuration logic

2. **Indirection Without Value**:
   - YAML config requires parsing and lacks type safety
   - Separate index.ts file is mostly boilerplate
   - No support for conditional logic in configuration

3. **Developer Experience Issues**:
   - No autocomplete or type checking in YAML
   - Hard to debug configuration issues
   - Unfamiliar pattern compared to modern tools

### Inspiration: Modern Config Patterns

Tools like Astro, Vite, and Next.js use TypeScript configuration files as entry points:

```typescript
// astro.config.ts
export default defineConfig({
  integrations: [react(), tailwind()],
  build: { format: "file" },
});
```

This provides:

- ✅ Type safety and autocomplete
- ✅ Conditional logic support
- ✅ Single source of truth
- ✅ Familiar developer experience

## Design Goals

### Primary Goals

1. **Single File Entry Point**: `brain.config.ts` contains both configuration and app startup logic
2. **Type Safety**: Full TypeScript support with autocomplete and error checking
3. **Conditional Logic**: Support environment-based configuration
4. **Familiar DX**: Follow patterns from popular tools (Astro, Vite)
5. **CLI Integration**: Handle migration, development flags seamlessly

### Secondary Goals

1. **Plugin Ecosystem**: Works seamlessly with existing plugin patterns
2. **Development Tools**: Support for watch mode, hot reload
3. **Future-Proof**: Easy to extend with additional features

## Technical Design

### Core Architecture

#### defineConfig() Helper

```typescript
// shell/app/src/config.ts
export function defineConfig(config: AppConfig): AppConfig {
  // Auto-run if this is the main module
  if (import.meta.main) {
    handleCLI(config);
  }
  return config;
}

function handleCLI(config: AppConfig): void {
  const args = process.argv.slice(2);

  if (args.includes("--migrate")) {
    App.migrate();
  } else if (args.includes("--help")) {
    showHelp(config);
  } else {
    App.run(config);
  }
}
```

#### brain.config.ts Pattern

```typescript
#!/usr/bin/env bun
import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MatrixInterface } from "@brains/matrix";

export default defineConfig({
  name: "my-brain",
  version: "1.0.0",

  // Environment-based configuration
  aiApiKey: process.env.ANTHROPIC_API_KEY,
  logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",

  // Type-safe plugin configuration
  plugins: [
    new SystemPlugin({}),

    // Conditional plugins
    ...(process.env.MATRIX_ACCESS_TOKEN
      ? [
          new MatrixInterface({
            homeserver: "https://matrix.example.com",
            accessToken: process.env.MATRIX_ACCESS_TOKEN,
            userId: "@bot:example.com",
          }),
        ]
      : []),
  ],
});
```

### CLI Integration

#### Built-in Commands

The config file will support these flags automatically:

- `bun brain.config.ts` - Start the app
- `bun brain.config.ts --migrate` - Run database migrations
- `bun brain.config.ts --cli` - Start with CLI interface
- `bun brain.config.ts --help` - Show available options
- `bun brain.config.ts --version` - Show app version

#### package.json Scripts

```json
{
  "scripts": {
    "start": "bun brain.config.ts",
    "dev": "bun --watch brain.config.ts",
    "migrate": "bun brain.config.ts --migrate",
    "studio": "bun brain.config.ts --studio"
  }
}
```

### Error Handling & Validation

#### Configuration Validation

```typescript
// Automatic validation using existing AppConfig schema
export function defineConfig(config: AppConfig): AppConfig {
  // Validate config at definition time
  const validated = appConfigSchema.parse(config);

  if (import.meta.main) {
    handleCLI(validated);
  }

  return validated;
}
```

#### Runtime Error Handling

```typescript
function handleCLI(config: AppConfig): void {
  process.on("uncaughtException", (error) => {
    console.error(`❌ ${config.name} crashed:`, error);
    process.exit(1);
  });

  // Handle CLI commands...
}
```

## Implementation Plan

### Phase 1: Core Infrastructure ⏳

**Goal**: Create the `defineConfig()` helper and CLI handling

**Tasks**:

1. Create `shell/app/src/config.ts` with `defineConfig()` function
2. Add CLI argument parsing (`--migrate`, `--help`, etc.)
3. Export `defineConfig` from app package index
4. Add unit tests for CLI handling

**Success Criteria**:

- `defineConfig()` auto-runs apps when executed directly
- CLI flags properly route to migration, help, etc.
- Ready for test-brain implementation

### Phase 2: Test-Brain Migration ⏳

**Goal**: Migrate test-brain to use the new pattern

**Tasks**:

1. Create `apps/test-brain/brain.config.ts`
2. Move all configuration from `src/index.ts`
3. Update `package.json` scripts to use new entry point
4. Delete `src/index.ts` (no longer needed)
5. Simplify migration script to use config pattern

**Success Criteria**:

- test-brain starts with `bun brain.config.ts`
- All plugins configured and working
- Migrations work with `bun brain.config.ts --migrate`
- File count reduced (no more index.ts)

### Phase 3: Documentation & Examples ⏳

**Goal**: Document the new pattern and provide examples

**Tasks**:

1. Update app package README with new pattern
2. Create example configs for different use cases
3. Update app-package-refactoring-plan.md
4. Document the new pattern for future apps

**Success Criteria**:

- Clear documentation for developers
- Examples cover common patterns
- Pattern documented for future apps

### Phase 4: Advanced Features 🔮

**Goal**: Add enhanced developer experience features

**Tasks**:

1. Config validation with helpful error messages
2. Plugin discovery and suggestions
3. Development server integration
4. Config schema generation for IDEs

**Success Criteria**:

- Better error messages for config issues
- IDE autocomplete for plugin options
- Hot reload during development

## Examples

### Basic Configuration

```typescript
// brain.config.ts
import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";

export default defineConfig({
  name: "simple-brain",
  version: "1.0.0",
  aiApiKey: process.env.ANTHROPIC_API_KEY,

  plugins: [new SystemPlugin({})],
});
```

### Advanced Multi-Environment

```typescript
// brain.config.ts
import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";

const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  name: "advanced-brain",
  version: "2.1.0",
  aiApiKey: process.env.ANTHROPIC_API_KEY,

  // Environment-specific settings
  logLevel: isDevelopment ? "debug" : "info",

  plugins: [
    new SystemPlugin({
      debug: isDevelopment,
    }),

    // Production-only plugins
    ...(isProduction
      ? [
          new MatrixInterface({
            homeserver: "https://matrix.company.com",
            accessToken: process.env.MATRIX_ACCESS_TOKEN!,
            userId: "@prod-bot:company.com",
          }),
        ]
      : []),

    // Development-only plugins
    ...(isDevelopment
      ? [
          directorySync({
            syncPath: "./dev-data",
            watchEnabled: true,
          }),
        ]
      : []),
  ],
});
```

### Plugin-Heavy Configuration

```typescript
// brain.config.ts - Complex plugin setup
import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { directorySync } from "@brains/directory-sync";
import { templates, routes } from "@brains/default-site-content";

export default defineConfig({
  name: "full-featured-brain",
  version: "1.0.0",
  aiApiKey: process.env.ANTHROPIC_API_KEY,

  plugins: [
    // Core functionality
    new SystemPlugin({}),

    // Interfaces
    new MCPInterface({
      port: 3333,
      transport: "http",
    }),

    new MatrixInterface({
      homeserver: "https://matrix.rizom.ai",
      accessToken: process.env.MATRIX_ACCESS_TOKEN || "",
      userId: "@testbrain-dev:rizom.ai",
      anchorUserId: "@yeehaa:rizom.ai",
    }),

    new WebserverInterface({
      previewPort: 4321,
      productionPort: 8080,
    }),

    // Content management
    directorySync({
      syncPath: "./brain-data",
      watchEnabled: true,
    }),

    siteBuilderPlugin({
      templates,
      routes,
    }),
  ],
});
```

## Implementation Approach

### Single App Focus

Since we currently have only one app (test-brain), we can implement this pattern directly without complex migration considerations.

### Implementation Steps for test-brain

1. Create `brain.config.ts` with all current configuration
2. Update `package.json` scripts to use new entry point
3. Delete `src/index.ts` (no longer needed)
4. Simplify migration script

### Future Apps

New Brain apps will start with the `brain.config.ts` pattern from the beginning, making this the standard approach going forward.

## Success Criteria

### Quantitative Goals

1. **Reduce File Count**: test-brain goes from multiple files to single config file
2. **Maintain Type Safety**: 100% TypeScript coverage in config
3. **Performance**: No measurable startup time impact
4. **Lines of Code**: Reduce total configuration code (~39 → ~30 lines)

### Qualitative Goals

1. **Developer Experience**: Easier to understand and modify
2. **Consistency**: Follows patterns from popular tools (Astro, Vite)
3. **Maintainability**: Single source of truth, clearer data flow
4. **Flexibility**: Supports complex conditional configuration

### Acceptance Tests

1. ✅ `bun brain.config.ts` starts the app
2. ✅ `bun brain.config.ts --migrate` runs migrations
3. ✅ Environment variables work in config logic
4. ✅ Conditional plugins load correctly
5. ✅ TypeScript provides full autocomplete
6. ✅ Error messages are helpful and clear

## Future Enhancements

### Developer Tools

1. **Config Validation**: Rich error messages for invalid configurations
2. **Plugin Discovery**: Suggest available plugins based on installed packages
3. **Schema Generation**: Generate TypeScript definitions for plugins
4. **Hot Reload**: Restart app when config changes in development

### Advanced Features

1. **Config Composition**: Import and extend other configs
2. **Environment Files**: Built-in support for .env files
3. **Config Presets**: Common configurations for different app types
4. **Plugin Templates**: Generate plugin boilerplate

### IDE Integration

1. **Snippets**: VS Code snippets for common patterns
2. **Validation**: Real-time config validation in editors
3. **Documentation**: Inline docs for plugin options

## Conclusion

The Astro-style configuration pattern will significantly improve the developer experience for Brain apps by:

- Eliminating unnecessary indirection
- Providing full type safety and IDE support
- Following familiar patterns from modern tools
- Supporting complex conditional logic
- Creating a single source of truth for app configuration

This approach positions Brain apps for better maintainability and developer adoption while keeping the implementation simple and focused. Starting with test-brain as the reference implementation will establish this as the standard pattern for future Brain applications.
