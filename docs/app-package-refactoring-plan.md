# App Package & Configuration Refactoring Plan

## Overview

This document outlines the comprehensive refactoring of the app package and configuration management across the Brain project. The goal is to simplify configuration, reduce environment variable sprawl, and create a cleaner architecture.

## Configuration Philosophy

### Three-Tier Configuration Hierarchy

1. **Environment Variables**: ONLY for secrets
   - API keys (ANTHROPIC_API_KEY, MATRIX_ACCESS_TOKEN)
   - Authentication tokens
   - Nothing else

2. **Config File (brain.config.yaml)**: For deployment-specific settings
   - Server ports
   - Service URLs
   - User identities
   - Model selection

3. **Hardcoded Defaults**: For everything else
   - Database paths (./data/\*.db)
   - Cache directories
   - Timeouts and intervals
   - Feature flags

## Current Issues

1. **Mixed Responsibilities**: App class handles CLI parsing, interface registration, signal handling
2. **Interface Confusion**: Interfaces configured separately but registered as plugins
3. **Environment Variable Sprawl**: 30+ env vars across packages
4. **Complex Configuration**: Multiple config merging layers
5. **Missing Documentation**: No clear guidance on configuration

## Plugin Configuration Strategy

### Configuration Coordination

Plugins and core app configuration are handled separately but stored in the same file for convenience:

1. **Core Configuration**: Managed by app package (servers, ai, paths)
2. **Plugin Configuration**: Each plugin manages its own config section
3. **Secrets**: Always from environment variables
4. **Coordination**: App loads config file once, passes relevant sections to plugins

### Config File Structure

```yaml
# Core app configuration
servers:
  mcpPort: 3333
  websitePreviewPort: 4321
  websiteProductionPort: 8080

ai:
  model: claude-3-haiku-20240307

# Plugin configurations (each plugin validates its own section)
plugins:
  matrix:
    homeserver: https://matrix.org
    userId: "@bot:matrix.org"
    anchorUserId: "@admin:matrix.org"
    trustedUsers: ["@user1:matrix.org"]
  
  directorySync:
    path: ./brain-data
    watchEnabled: false
    watchInterval: 5000
  
  siteBuilder:
    templates: default
    routes: default
```

## Implementation Plan

### Phase 1: Config Infrastructure

#### 1.1 Create Config Loader

Create `shell/app/src/config-loader.ts`:

- Load and parse brain.config.yaml
- Return core config AND raw plugin configs
- Only validate core config schema
- Let plugins validate their own sections
- Handle secrets from environment variables

#### 1.2 Create Example Config

Create `apps/test-brain/brain.config.example.yaml` with full structure showing both core and plugin sections.

### Phase 2: Simplify App Package

#### 2.1 Refactor app.ts

- Remove interfaces array completely
- All interfaces become regular plugins
- Keep --cli flag for development convenience
- Use config-loader for all configuration
- Simplify initialization flow

#### 2.2 Update types.ts

- Remove InterfaceConfig and interfaceConfigSchema
- Simplify AppConfig to essential fields
- Add brain.config.yaml types

### Phase 3: Update Test-Brain

#### 3.1 Simplify index.ts

Before: 125 lines with complex env var checking
After: ~50 lines with clean plugin registration

```typescript
import { App } from "@brains/app";
import { loadConfig } from "@brains/app";
// ... plugin imports

const { config, pluginConfigs, secrets, paths } = loadConfig();

// Create plugins with their configurations
const plugins = [
  // System plugin (always included)
  new SystemPlugin(),
  
  // MCP interface with port from core config
  new MCPInterface({
    httpPort: config.servers?.mcpPort ?? 3333,
  }),
  
  // Matrix interface if configured
  ...(pluginConfigs?.matrix && secrets.matrixAccessToken
    ? [new MatrixInterface({
        ...pluginConfigs.matrix,
        accessToken: secrets.matrixAccessToken,
      })]
    : []),
  
  // Directory sync if configured
  ...(pluginConfigs?.directorySync
    ? [new DirectorySync(pluginConfigs.directorySync)]
    : []),
];

await App.run({
  name: "test-brain",
  version: "1.0.0",
  plugins,
  aiApiKey: secrets.anthropicApiKey,
  paths, // Database and cache paths
});
```

### Phase 4: Clean Environment Variables

#### 4.1 Environment Variable Audit

**Keep as ENV (6 total):**

- ANTHROPIC_API_KEY
- MATRIX_ACCESS_TOKEN
- MATRIX_ADMIN_TOKEN (setup only)
- DATABASE_AUTH_TOKEN (optional)
- JOB_QUEUE_DATABASE_AUTH_TOKEN (optional)
- CONVERSATION_DATABASE_AUTH_TOKEN (optional)

**Move to Config File:**

Core config:
- BRAIN_SERVER_PORT → servers.mcpPort
- WEBSITE_PREVIEW_PORT → servers.websitePreviewPort
- WEBSITE_PRODUCTION_PORT → servers.websiteProductionPort
- AI_MODEL → ai.model

Plugin configs (in plugins section):
- MATRIX_HOMESERVER → plugins.matrix.homeserver
- MATRIX_USER_ID → plugins.matrix.userId
- MATRIX_ANCHOR_USER_ID → plugins.matrix.anchorUserId
- MATRIX_TRUSTED_USERS → plugins.matrix.trustedUsers
- SYNC_PATH → plugins.directorySync.path

**Remove/Hardcode (15+ vars):**

- All DATABASE_URL vars → ./data/\*.db
- FASTEMBED_CACHE_DIR → ./cache/embeddings
- LOG_LEVEL → info
- MCP_TRANSPORT → http
- WATCH_ENABLED → false
- WATCH_INTERVAL → 5000
- MATRIX_DISPLAY_NAME → Personal Brain
- All WEBSITE\__\_DIR vars → ./dist/_

#### 4.2 Update Package Configurations

**shell/core/src/config/shellConfig.ts:**

- Remove all env var fallbacks except secrets
- Use hardcoded defaults

**Database packages:**

- entity-service: ./data/brain.db
- job-queue: ./data/brain-jobs.db
- conversation-service: ./data/conversations.db

**Other services:**

- embedding-service: ./cache/embeddings
- matrix: Hardcode display name

### Phase 5: Documentation & Testing

#### 5.1 Create README.md

Comprehensive documentation for app package:

- Configuration hierarchy
- Usage examples
- Migration guide

#### 5.2 Update Tests

- Fix app.test.ts
- Update integration tests
- Remove env var mocking

### Expected Benefits

1. **Simpler Configuration**: Clear 3-tier hierarchy
2. **Reduced Complexity**: 75% fewer environment variables
3. **Better Developer Experience**: One config file to edit
4. **Cleaner Architecture**: Consistent plugin handling
5. **Easier Testing**: Predictable defaults
6. **Better Documentation**: Self-documenting config file

### Migration Guide

For existing users:

1. Copy brain.config.example.yaml to brain.config.yaml
2. Move non-secret env vars to config file
3. Keep only API keys in environment
4. Delete old env var exports from shell scripts

### Plugin Configuration Pattern

Each plugin that needs configuration should:

1. **Export a config schema** for validation
2. **Accept config in constructor** (optional)
3. **Merge file config with overrides** (like secrets from env)
4. **Provide sensible defaults** for all settings

Example plugin pattern:
```typescript
// In plugin package
export const matrixConfigSchema = z.object({
  homeserver: z.string().url(),
  userId: z.string(),
  anchorUserId: z.string(),
  trustedUsers: z.array(z.string()).optional(),
});

export class MatrixInterface {
  constructor(config?: Partial<MatrixConfig>) {
    // Validate and merge with defaults
    this.config = matrixConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...config,
    });
  }
}
```

### Implementation Order

1. Create config infrastructure (config-loader.ts)
2. Create example config file  
3. Update app.ts and types.ts
4. Update test-brain/index.ts
5. Clean env vars from all packages
6. Update tests
7. Create documentation
8. Test complete system

## Success Criteria

- [ ] Only 6 environment variables remain (secrets only)
- [ ] Test-brain index.ts under 50 lines
- [ ] All tests pass without env var mocking
- [ ] Config file documents all options
- [ ] Interfaces treated as regular plugins

## Notes

This refactoring is part of the broader architecture cleanup outlined in the roadmap (section 1.4 - App Package Refactoring). It addresses technical debt while maintaining backward compatibility through the config file approach.
