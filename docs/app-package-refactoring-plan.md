# App Package & Configuration Refactoring Plan

## Overview

This document outlines the comprehensive refactoring of the app package and configuration management across the Brain project. The goal is to simplify configuration, reduce environment variable sprawl, and create a cleaner architecture.

**Status: MOSTLY COMPLETE** ✅

- Environment variables reduced from 30+ to 6 secrets
- Test-brain simplified from 125+ lines to 39 lines
- Centralized configuration management implemented
- All tests use in-memory databases to prevent file pollution

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

## Issues Addressed ✅

1. ✅ **Mixed Responsibilities**: App class simplified, clean separation of concerns
2. ✅ **Interface Confusion**: All interfaces are now regular plugins
3. ✅ **Environment Variable Sprawl**: Reduced from 30+ to 6 secrets only
4. ✅ **Complex Configuration**: Centralized in `getStandardConfig()`
5. 🔄 **Missing Documentation**: In progress - this document and App README

## Plugin Configuration Strategy

### Flat Configuration with Nested Plugin Sections

After reconsidering, we've adopted a simpler approach: flat configuration with nested objects for each plugin. No artificial separation between "core" and "plugin" configs.

1. **Flat Structure**: Top-level keys are either for Shell/core services or plugin names
2. **Plugin Sections**: Each plugin gets its own nested object
3. **Secrets**: Always from environment variables
4. **Coordination**: App loads config once, passes each plugin its section

### Config File Structure

```yaml
# brain.config.yaml - flat structure with nested plugin configs

# Core configuration (used by Shell services)
aiModel: claude-3-haiku-20240307
logLevel: info

# MCP Interface configuration
mcp:
  port: 3333
  transport: http

# Matrix Interface configuration
matrix:
  homeserver: https://matrix.org
  userId: "@bot:matrix.org"
  anchorUserId: "@admin:matrix.org"
  trustedUsers: ["@user1:matrix.org"]

# Directory Sync plugin configuration
directorySync:
  path: ./brain-data
  watchEnabled: false
  watchInterval: 5000

# Webserver Interface configuration
webserver:
  previewPort: 4321
  productionPort: 8080

# Site Builder plugin configuration
siteBuilder:
  templates: default
  routes: default
```

This approach is cleaner because:

- All servers are provided by plugins (MCP, Webserver), not core
- Each plugin clearly owns its configuration section
- No confusing core/plugin distinction
- Easy to understand what each config section controls

## Implementation Plan

### Phase 1: Config Infrastructure ✅ MODIFIED APPROACH

**Status: Partially Complete - Modified Approach**

#### 1.1 Centralized Configuration ✅ IMPLEMENTED

Implemented `shell/core/src/config/shellConfig.ts` instead of YAML loader:

- ✅ Created `getStandardConfig()` for centralized paths
- ✅ Created `getStandardConfigWithDirectories()` for migration scripts
- ✅ Hardcoded sensible defaults for all non-secret configuration
- ✅ Secrets still come from environment variables only
- ✅ Database URLs, cache paths centralized in one place

#### 1.2 Config Loader (Future Enhancement) 🔄 PLANNED

Postponed YAML config loader - current hardcoded approach working well:

- Will add `loadConfigFile()` function when needed
- Infrastructure ready in `@brains/utils` YAML utilities
- Can be added incrementally without breaking changes

### Phase 2: Simplify App Package ✅ COMPLETE

#### 2.1 Refactor app.ts ✅ IMPLEMENTED

- ✅ Removed interfaces array completely
- ✅ All interfaces become regular plugins
- ✅ Kept --cli flag for development convenience
- ✅ Uses centralized configuration from `getStandardConfig()`
- ✅ Simplified initialization flow (193 lines, clean architecture)

#### 2.2 Update types.ts ✅ IMPLEMENTED

- ✅ Removed InterfaceConfig and interfaceConfigSchema
- ✅ Simplified AppConfig to essential fields
- ✅ Clean separation between app config and shell config

### Phase 3: Update Test-Brain ✅ COMPLETE

#### 3.1 Simplify index.ts ✅ EXCEEDED GOAL

Before: 125+ lines with complex env var checking
After: **39 lines** with clean plugin registration (exceeded goal of <100 lines)

Current implementation:

```typescript
import { App, loadConfig, getDatabaseUrls } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface, type MCPConfigInput } from "@brains/mcp";
import { MatrixInterface, type MatrixConfigInput } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";
import type { Plugin } from "@brains/plugins";

const { config, secrets, paths } = loadConfig();
const dbUrls = getDatabaseUrls(paths);

const plugins: Plugin[] = [
  // System plugin (always included)
  new SystemPlugin({ searchLimit: 10, debug: false }),
];

// MCP Interface - pass config section, plugin validates internally
if (config["mcp"]) {
  plugins.push(new MCPInterface(config["mcp"] as MCPConfigInput));
}

// Matrix Interface - only if configured AND has access token
if (config["matrix"] && secrets.matrixAccessToken) {
  const matrixConfig = config["matrix"] as MatrixConfigInput;
  plugins.push(
    new MatrixInterface({
      ...matrixConfig,
      accessToken: secrets.matrixAccessToken,
    }),
  );
}

// Directory Sync - plugin handles its own config validation
if (config["directorySync"]) {
  plugins.push(
    directorySync({
      ...config["directorySync"],
      includeMetadata: true,
    }),
  );
}

// Webserver Interface
if (config["webserver"]) {
  plugins.push(
    new WebserverInterface({
      ...config["webserver"],
      previewDistDir: paths.distDir + "/preview",
      productionDistDir: paths.distDir + "/production",
    }),
  );
}

// Site Builder
if (config["siteBuilder"]) {
  plugins.push(
    siteBuilderPlugin({
      previewOutputDir: paths.distDir + "/preview",
      productionOutputDir: paths.distDir + "/production",
      workingDir: paths.cacheDir + "/site-builder",
      templates,
      routes,
    }),
  );
}

await App.run({
  name: "test-brain",
  version: "1.0.0",
  database: dbUrls.main,
  aiApiKey: secrets.anthropicApiKey,
  logLevel: config["logLevel"] as "debug" | "info" | "warn" | "error",
  shellConfig: {
    jobQueueDatabase: { url: dbUrls.jobQueue },
    conversationDatabase: { url: dbUrls.conversation },
  },
  plugins,
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

- AI_MODEL → aiModel
- LOG_LEVEL → logLevel

Plugin configs (flat structure with nested objects):

- BRAIN_SERVER_PORT → mcp.port
- MCP_TRANSPORT → mcp.transport
- MATRIX_HOMESERVER → matrix.homeserver
- MATRIX_USER_ID → matrix.userId
- MATRIX_ANCHOR_USER_ID → matrix.anchorUserId
- MATRIX_TRUSTED_USERS → matrix.trustedUsers
- SYNC_PATH → directorySync.path
- WEBSITE_PREVIEW_PORT → webserver.previewPort
- WEBSITE_PRODUCTION_PORT → webserver.productionPort

**✅ Removed/Hardcoded (20+ vars):**

- ✅ All DATABASE_URL vars → `getStandardConfig()` (./data/\*.db)
- ✅ FASTEMBED_CACHE_DIR → `getStandardConfig()` (./cache/embeddings)
- ✅ LOG_LEVEL → hardcoded (info)
- ✅ MCP_TRANSPORT → plugin defaults (http)
- ✅ WATCH_ENABLED → **fixed to true** (for auto-mode)
- ✅ WATCH_INTERVAL → plugin defaults (1000ms)
- ✅ MATRIX_DISPLAY_NAME → plugin defaults
- ✅ All WEBSITE\__\_DIR vars → `getStandardConfig()` (./dist/_)

#### 4.2 Update Package Configurations ✅ IMPLEMENTED

**✅ shell/core/src/config/shellConfig.ts:**

- ✅ Removed all env var fallbacks except secrets
- ✅ Uses hardcoded defaults via `getStandardConfig()`
- ✅ Made database config required across all packages

**✅ Database packages:**

- ✅ entity-service: `getStandardConfig().database` (./data/brain.db)
- ✅ job-queue: `getStandardConfig().jobQueueDatabase` (./data/brain-jobs.db)
- ✅ conversation-service: `getStandardConfig().conversationDatabase` (./data/conversations.db)

**✅ Other services:**

- ✅ embedding-service: `getStandardConfig().embedding.cacheDir` (./cache/embeddings)
- ✅ All tests use in-memory databases (`file::memory:`)

### Phase 5: Documentation & Testing 🔄 IN PROGRESS

#### 5.1 Create README.md 🔄 IN PROGRESS

Comprehensive documentation for app package:

- Configuration hierarchy explanation
- Usage examples and patterns
- Migration guide for existing apps

#### 5.2 Update Tests ✅ COMPLETE

- ✅ All tests pass without env var mocking
- ✅ Tests use in-memory databases to prevent file pollution
- ✅ Removed env var fallbacks from test configurations
- ✅ Migration scripts protected from direct execution

### Phase 5B: Additional Improvements 🔄 NEW

#### 5B.1 Migration Runner 📋 PLANNED

Add `App.migrate()` static method to simplify migration scripts:

```typescript
// In app package
public static async migrate(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  await migrateEntities(config.database, logger);
  await migrateJobQueue(config.jobQueueDatabase, logger);
  await migrateConversations(config.conversationDatabase, logger);
}
```

#### 5B.2 Config Loader Infrastructure 📋 PLANNED

Add YAML config loader for future enhancement:

```typescript
// In app package - for future use
export async function loadConfigFile(
  path = "./brain.config.yaml",
): Promise<Partial<AppConfig>> {
  if (!existsSync(path)) return {};
  const content = await readFile(path, "utf-8");
  return fromYaml(content);
}
```

### Benefits Achieved ✅

1. ✅ **Simpler Configuration**: Clear centralized configuration via `getStandardConfig()`
2. ✅ **Reduced Complexity**: 80% fewer environment variables (30+ → 6)
3. ✅ **Better Developer Experience**: Hardcoded sensible defaults, no config files needed
4. ✅ **Cleaner Architecture**: Consistent plugin handling, all interfaces are plugins
5. ✅ **Easier Testing**: In-memory databases, no file system pollution
6. ✅ **Better Documentation**: Self-documenting centralized config

### Migration Guide ✅ COMPLETE

For existing users:

1. ✅ Remove all non-secret environment variables from shell scripts
2. ✅ Use `getStandardConfig()` for all path configuration
3. ✅ Keep only API keys in environment
4. ✅ Update tests to use in-memory databases

### Plugin Configuration Pattern

Each plugin that needs configuration should:

1. **Export a config schema** for validation
2. **Export a config input type** (usually `Partial<ConfigType>`)
3. **Accept unknown/partial config in constructor**
4. **Validate internally using the schema**
5. **Merge with defaults and handle errors gracefully**

Example plugin pattern:

```typescript
// In plugin package
export const matrixConfigSchema = z.object({
  homeserver: z.string().url(),
  userId: z.string(),
  anchorUserId: z.string(),
  trustedUsers: z.array(z.string()).optional(),
});

export type MatrixConfig = z.infer<typeof matrixConfigSchema>;
export type MatrixConfigInput = Partial<MatrixConfig>;

export class MatrixInterface {
  constructor(config?: MatrixConfigInput) {
    // Plugin validates its own config internally
    const validated = matrixConfigSchema.safeParse({
      ...DEFAULT_CONFIG,
      ...config,
    });

    if (!validated.success) {
      throw new Error(`Invalid Matrix config: ${validated.error.message}`);
    }

    this.config = validated.data;
  }
}
```

### Type-Safe Config Usage in Apps

Apps using plugins should:

1. Load generic config from YAML (`Record<string, unknown>`)
2. Pass config sections to plugins using their input types
3. Let plugins handle validation internally
4. Never use `any` - use plugin's exported input types

```typescript
// In app
import { MatrixInterface, type MatrixConfigInput } from "@brains/matrix";

const { config } = loadConfig();
if (config["matrix"]) {
  // Type assertion to plugin's input type - safe because plugin validates
  const matrixConfig = config["matrix"] as MatrixConfigInput;
  plugins.push(new MatrixInterface(matrixConfig));
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

## Success Criteria ✅ ACHIEVED

- ✅ **Only 6 environment variables remain** (secrets only)
- ✅ **Test-brain index.ts under 100 lines** (39 lines - exceeded goal!)
- ✅ **All tests pass without env var mocking**
- 🔄 **Config documentation** (in progress)
- ✅ **Interfaces treated as regular plugins**
- ✅ **No `any` types** - clean type-safe configuration
- ✅ **Plugins validate their own configuration**

## Implementation Status

### What Was Actually Implemented vs Original Plan

**✅ Centralized Configuration:** Implemented `getStandardConfig()` approach instead of YAML config loader. This proved simpler and more maintainable for current needs.

**✅ Database Configuration:** Made config required across all shell packages, preventing accidental file creation in wrong locations.

**✅ Test Database Isolation:** All tests use `file::memory:` databases, completely solving test pollution issues.

**✅ Migration Script Protection:** Added guards to prevent migration scripts from running directly, only from app contexts.

**🔄 YAML Config:** Postponed in favor of hardcoded defaults. Can be added incrementally when needed using existing `@brains/utils` YAML utilities.

## Environment Variable Final State

**Secrets (6 environment variables):**

- ANTHROPIC_API_KEY
- MATRIX_ACCESS_TOKEN
- MATRIX_ADMIN_TOKEN (setup only)
- DATABASE_AUTH_TOKEN (optional)
- JOB_QUEUE_DATABASE_AUTH_TOKEN (optional)
- CONVERSATION_DATABASE_AUTH_TOKEN (optional)

**Everything Else:** Moved to centralized configuration in `getStandardConfig()` or plugin defaults.

## Lessons Learned

1. **Centralized hardcoded defaults work well** for most configuration needs
2. **YAML config can be added incrementally** when truly needed
3. **Making config required prevents accidental file creation** in wrong locations
4. **In-memory databases completely solve test pollution** issues
5. **Plugin default patterns are sufficient** for most use cases
6. **Type safety is achievable without complex validation** when using centralized config

## Next Steps

1. **Complete Phase 5B improvements:**
   - Add migration runner to App package
   - Add config loader infrastructure for future YAML support
   - Complete app package documentation

2. **Shell Core Implementation:** Begin entity model infrastructure implementation

3. **Cleanup Phase:** Address items in cleanup-inventory.md

4. **Plugin Development:** Implement Link plugin as first plugin

## Notes

This refactoring is part of the broader architecture cleanup outlined in the roadmap (section 1.4 - App Package Refactoring). It successfully addresses technical debt while maintaining backward compatibility. The approach of centralized hardcoded defaults proved more practical than initially planned YAML configuration.
