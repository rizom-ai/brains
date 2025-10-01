# App Configuration with YAML

## Overview

Restructure app configuration to separate config from secrets using a `brain-config.yaml` file, and add a `/about` command that displays this configuration to users.

## The Core Problem

**Current State:**
- Configuration mixed with secrets in environment variables
- No structured config file for apps
- Config values scattered across `brain.config.ts` and `.env`
- No way to view current configuration except reading code/env files
- Users can't easily see "how is my brain configured?"

**What We Need:**
1. Structured configuration file (`brain-config.yaml`)
2. Clear separation: config in YAML, secrets in env vars
3. Command to view configuration (`/about`)

## Solution Architecture

### Part 1: Structured App Configuration

**Add `brain-config.yaml` to each app:**

```yaml
# apps/team-brain/brain-config.yaml
name: team-brain
version: 1.0.0

# Brain identity
identity:
  role: Team knowledge coordinator
  purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing
  values:
    - collaboration
    - transparency
    - accessibility
    - actionability
    - candor

# File synchronization
sync:
  directory:
    path: ./brain-data
    watch: true
    watchInterval: 1000

  git:
    url: https://github.com/username/team-brain-backup
    branch: main
    autoSync: true
    syncInterval: 300000  # 5 minutes

# Communication interfaces
interfaces:
  matrix:
    homeserver: https://matrix.rizom.ai
    userId: "@teambrain-dev:rizom.ai"
    deviceDisplayName: "Team Brain"

  webserver:
    port: 3000
    enabled: true

  mcp:
    enabled: true

# Plugin configuration
plugins:
  link:
    autoCapture: true

  summary:
    autoGenerate: true

  topics:
    autoExtract: true

# Advanced settings (optional)
advanced:
  logLevel: info
  database: file:./data/brain.db

# Secrets remain in environment variables:
# - ANTHROPIC_API_KEY
# - GIT_SYNC_TOKEN
# - MATRIX_ACCESS_TOKEN
# - MCP_AUTH_TOKEN
```

**Benefits:**
- **User-friendly**: Easy to read and edit
- **Version controlled**: Config goes in git, secrets don't
- **Self-documenting**: Shows all configurable options
- **Clear separation**: Config visible, secrets hidden
- **Validation**: Can be validated with schema
- **Introspection**: Easy for `/about` command to display

---

### Part 2: Configuration Loading

**Update `brain.config.ts` to load from YAML:**

```typescript
// apps/team-brain/brain.config.ts
import { defineConfig, handleCLI, loadConfigFromYaml } from "@brains/app";
import { SystemPlugin } from "@brains/system";
// ... other imports

// Load configuration from YAML
const yamlConfig = await loadConfigFromYaml("./brain-config.yaml");

const config = defineConfig({
  // Core settings from YAML
  name: yamlConfig.name,
  version: yamlConfig.version,

  // Identity from YAML
  identity: yamlConfig.identity,

  // Secrets from environment
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Permissions (stays in code for now)
  permissions: {
    anchors: [
      `matrix:${process.env["MATRIX_ANCHOR_USER_ID"]}`,
    ],
    // ...
  },

  // Plugins configured from YAML
  plugins: [
    new SystemPlugin({}),
    new TopicsPlugin(yamlConfig.plugins?.topics || {}),
    new SummaryPlugin(yamlConfig.plugins?.summary || {}),
    new LinkPlugin(yamlConfig.plugins?.link || {}),

    // Interfaces from YAML config
    new MCPInterface({
      authToken: process.env["MCP_AUTH_TOKEN"],
      enabled: yamlConfig.interfaces?.mcp?.enabled,
    }),

    new MatrixInterface({
      homeserver: yamlConfig.interfaces?.matrix?.homeserver,
      userId: yamlConfig.interfaces?.matrix?.userId,
      deviceDisplayName: yamlConfig.interfaces?.matrix?.deviceDisplayName,
      accessToken: process.env["MATRIX_ACCESS_TOKEN"],
    }),

    directorySync({
      syncPath: yamlConfig.sync?.directory?.path,
      watchEnabled: yamlConfig.sync?.directory?.watch,
      seedContent: false,
    }),

    new GitSyncPlugin({
      gitUrl: yamlConfig.sync?.git?.url,
      branch: yamlConfig.sync?.git?.branch,
      authToken: process.env["GIT_SYNC_TOKEN"],
      autoSync: yamlConfig.sync?.git?.autoSync,
    }),

    new WebserverInterface({
      port: yamlConfig.interfaces?.webserver?.port,
      enabled: yamlConfig.interfaces?.webserver?.enabled,
    }),

    siteBuilderPlugin({
      templates,
      routes,
      layouts: { default: DefaultLayout, minimal: MinimalLayout },
      themeCSS,
    }),
  ],
});

if (import.meta.main) {
  handleCLI(config);
}

export default config;
```

---

### Part 3: `/about` Command

**Purpose:** Display configuration from `brain-config.yaml`

**Output:**
```markdown
# Brain Configuration

## Identity
Role: Team knowledge coordinator
Purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing
Values: collaboration, transparency, accessibility, actionability, candor

## File Synchronization
Directory Path: ./brain-data
Directory Watch: Enabled
Git Repository: https://github.com/username/team-brain-backup
Git Auto-Sync: Enabled (every 5 minutes)

## Communication Interfaces
Matrix: @teambrain-dev:rizom.ai on https://matrix.rizom.ai
Web Interface: Running on port 3000
MCP Interface: Enabled

## Plugin Settings
Link Auto-Capture: Enabled
Summary Auto-Generate: Enabled
Topics Auto-Extract: Enabled
```

**Implementation:**

File: `plugins/system/src/commands/index.ts`

```typescript
{
  name: "about",
  description: "View brain configuration",
  usage: "/about",
  visibility: "public",
  handler: async (_args, context): Promise<CommandResponse> => {
    try {
      // Read brain-config.yaml from app directory
      const config = await loadConfigFromYaml("./brain-config.yaml");

      const sections = ["# Brain Configuration", ""];

      // Identity section
      if (config.identity) {
        sections.push("## Identity");
        sections.push(`Role: ${config.identity.role}`);
        sections.push(`Purpose: ${config.identity.purpose}`);
        sections.push(`Values: ${config.identity.values.join(", ")}`);
        sections.push("");
      }

      // File Sync section
      if (config.sync) {
        sections.push("## File Synchronization");
        if (config.sync.directory) {
          sections.push(`Directory Path: ${config.sync.directory.path}`);
          sections.push(
            `Directory Watch: ${config.sync.directory.watch ? "Enabled" : "Disabled"}`
          );
        }
        if (config.sync.git) {
          sections.push(`Git Repository: ${config.sync.git.url}`);
          const syncInterval = config.sync.git.syncInterval
            ? ` (every ${config.sync.git.syncInterval / 1000} seconds)`
            : "";
          sections.push(
            `Git Auto-Sync: ${config.sync.git.autoSync ? "Enabled" : "Disabled"}${syncInterval}`
          );
        }
        sections.push("");
      }

      // Interfaces section
      if (config.interfaces) {
        sections.push("## Communication Interfaces");
        if (config.interfaces.matrix) {
          sections.push(
            `Matrix: ${config.interfaces.matrix.userId} on ${config.interfaces.matrix.homeserver}`
          );
        }
        if (config.interfaces.webserver?.enabled) {
          sections.push(
            `Web Interface: Running on port ${config.interfaces.webserver.port || 3000}`
          );
        }
        if (config.interfaces.mcp?.enabled) {
          sections.push("MCP Interface: Enabled");
        }
        sections.push("");
      }

      // Plugin settings
      if (config.plugins && Object.keys(config.plugins).length > 0) {
        sections.push("## Plugin Settings");
        Object.entries(config.plugins).forEach(([plugin, settings]) => {
          Object.entries(settings as Record<string, unknown>).forEach(
            ([key, value]) => {
              const displayKey = key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase());
              const pluginName =
                plugin.charAt(0).toUpperCase() + plugin.slice(1);
              const displayValue =
                typeof value === "boolean"
                  ? value
                    ? "Enabled"
                    : "Disabled"
                  : String(value);
              sections.push(`${pluginName} ${displayKey}: ${displayValue}`);
            }
          );
        });
        sections.push("");
      }

      return {
        type: "message",
        message: sections.join("\n"),
      };
    } catch (error) {
      return {
        type: "message",
        message: `Error reading configuration: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
}
```

---

## Implementation Plan

### Phase 1: YAML Config Infrastructure

**1.1. Add YAML parsing to @brains/app**

File: `shell/app/src/config-loader.ts` (new file)

```typescript
import { readFile } from "fs/promises";
import YAML from "yaml";
import { z } from "@brains/utils";

// Schema for brain-config.yaml
export const brainConfigYamlSchema = z.object({
  name: z.string(),
  version: z.string(),

  identity: z
    .object({
      role: z.string(),
      purpose: z.string(),
      values: z.array(z.string()),
    })
    .optional(),

  sync: z
    .object({
      directory: z
        .object({
          path: z.string().default("./brain-data"),
          watch: z.boolean().default(true),
          watchInterval: z.number().optional(),
        })
        .optional(),

      git: z
        .object({
          url: z.string(),
          branch: z.string().default("main"),
          autoSync: z.boolean().default(false),
          syncInterval: z.number().optional(),
        })
        .optional(),
    })
    .optional(),

  interfaces: z
    .object({
      matrix: z
        .object({
          homeserver: z.string(),
          userId: z.string(),
          deviceDisplayName: z.string().optional(),
        })
        .optional(),

      webserver: z
        .object({
          port: z.number().default(3000),
          enabled: z.boolean().default(true),
        })
        .optional(),

      mcp: z
        .object({
          enabled: z.boolean().default(true),
        })
        .optional(),
    })
    .optional(),

  plugins: z.record(z.string(), z.unknown()).optional(),

  advanced: z
    .object({
      logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
      database: z.string().optional(),
    })
    .optional(),
});

export type BrainConfigYaml = z.infer<typeof brainConfigYamlSchema>;

export async function loadConfigFromYaml(
  path: string
): Promise<BrainConfigYaml> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = YAML.parse(content);
    return brainConfigYamlSchema.parse(parsed);
  } catch (error) {
    throw new Error(
      `Failed to load config from ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

**1.2. Export from @brains/app**

File: `shell/app/src/index.ts`

```typescript
export { loadConfigFromYaml, type BrainConfigYaml } from "./config-loader";
// ... existing exports
```

**1.3. Add YAML dependency**

File: `shell/app/package.json`

```json
{
  "dependencies": {
    "yaml": "^2.3.4"
  }
}
```

---

### Phase 2: Create brain-config.yaml Files

**2.1. Create for team-brain**

File: `apps/team-brain/brain-config.yaml`

```yaml
name: team-brain
version: 1.0.0

identity:
  role: Team knowledge coordinator
  purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization
  values:
    - collaboration
    - transparency
    - accessibility
    - actionability
    - candor

sync:
  directory:
    path: ./brain-data
    watch: true

  git:
    url: https://github.com/username/team-brain-backup
    autoSync: true
    syncInterval: 300000

interfaces:
  matrix:
    homeserver: https://matrix.rizom.ai
    userId: "@teambrain-dev:rizom.ai"
    deviceDisplayName: "Team Brain"

  webserver:
    port: 3000
    enabled: true

  mcp:
    enabled: true

plugins:
  link:
    autoCapture: true

  summary:
    autoGenerate: true

  topics:
    autoExtract: true
```

**2.2. Create for test-brain**

File: `apps/test-brain/brain-config.yaml`

```yaml
name: test-brain
version: 1.0.0

identity:
  role: Test assistant
  purpose: Test environment for development
  values:
    - testing
    - development

sync:
  directory:
    path: ./brain-data
    watch: false

interfaces:
  webserver:
    port: 3001
    enabled: false
```

**2.3. Add example file**

File: `apps/team-brain/brain-config.example.yaml`

Copy of brain-config.yaml with placeholder values, for documentation

---

### Phase 3: Update brain.config.ts Files

**3.1. Update team-brain**

File: `apps/team-brain/brain.config.ts`

```typescript
#!/usr/bin/env bun
import { defineConfig, handleCLI, loadConfigFromYaml } from "@brains/app";
// ... imports

// Load configuration from YAML
const yamlConfig = await loadConfigFromYaml("./brain-config.yaml");

const config = defineConfig({
  name: yamlConfig.name,
  version: yamlConfig.version,
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Identity from YAML (will override default)
  identity: yamlConfig.identity,

  permissions: {
    anchors: [
      `matrix:${process.env["MATRIX_ANCHOR_USER_ID"] || "@yeehaa:rizom.ai"}`,
    ],
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "anchor" },
    ],
  },

  plugins: [
    new SystemPlugin({}),
    new TopicsPlugin(yamlConfig.plugins?.topics || {}),
    new SummaryPlugin(yamlConfig.plugins?.summary || {}),
    new LinkPlugin(yamlConfig.plugins?.link || {}),
    new MCPInterface({
      authToken: process.env["MCP_AUTH_TOKEN"],
      enabled: yamlConfig.interfaces?.mcp?.enabled,
    }),
    new MatrixInterface({
      homeserver:
        yamlConfig.interfaces?.matrix?.homeserver ||
        process.env["MATRIX_HOMESERVER"] ||
        "https://matrix.rizom.ai",
      userId:
        yamlConfig.interfaces?.matrix?.userId ||
        process.env["MATRIX_USER_ID"] ||
        "@teambrain-dev:rizom.ai",
      deviceDisplayName:
        yamlConfig.interfaces?.matrix?.deviceDisplayName || "Team Brain",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
    }),
    directorySync({
      syncPath: yamlConfig.sync?.directory?.path,
      watchEnabled: yamlConfig.sync?.directory?.watch,
      seedContent: false,
    }),
    new GitSyncPlugin({
      gitUrl:
        yamlConfig.sync?.git?.url ||
        process.env["GIT_SYNC_URL"] ||
        "https://github.com/username/team-brain-backup",
      branch: yamlConfig.sync?.git?.branch,
      authToken: process.env["GIT_SYNC_TOKEN"],
      autoSync: yamlConfig.sync?.git?.autoSync,
    }),
    new WebserverInterface({
      port: yamlConfig.interfaces?.webserver?.port,
      enabled: yamlConfig.interfaces?.webserver?.enabled,
    }),
    siteBuilderPlugin({
      templates,
      routes,
      layouts: {
        default: DefaultLayout,
        minimal: MinimalLayout,
      },
      themeCSS,
    }),
  ],
});

if (import.meta.main) {
  handleCLI(config);
}

export default config;
```

**3.2. Update test-brain**

Similar pattern as team-brain, using yamlConfig values

---

### Phase 4: Implement `/about` Command

**4.1. Add command to system plugin**

File: `plugins/system/src/commands/index.ts`

Add the `/about` command implementation (shown above in Part 3)

**4.2. Make loadConfigFromYaml available to plugins**

Since the command needs to read brain-config.yaml, we need to make the loader accessible.

Option A: Export from @brains/app (already done in Phase 1)
Option B: Pass config through context (more complex)

**Recommendation:** Use Option A - plugins import loadConfigFromYaml from @brains/app

---

## Testing Strategy

### Unit Tests

**For config loader:**

File: `shell/app/test/config-loader.test.ts`

- Test YAML parsing
- Test schema validation
- Test missing files
- Test invalid YAML
- Test default values

**For `/about` command:**

File: `plugins/system/test/commands/about.test.ts`

- Mock loadConfigFromYaml
- Test output formatting for all sections
- Test error handling
- Test with minimal config
- Test with full config

### Integration Tests

File: `apps/team-brain/test/config-integration.test.ts`

- Load actual brain-config.yaml
- Verify plugins receive correct config
- Test `/about` command with real data
- Verify env vars still work for secrets

### Manual Testing

1. Create brain-config.yaml for team-brain
2. Run `bun run dev` and verify config loads
3. Test `/about` command in CLI
4. Test `/about` command in Matrix
5. Verify secrets still work from env vars
6. Test with missing brain-config.yaml (should use defaults)
7. Test with invalid YAML (should show error)

---

## Migration Path

### Backward Compatibility

**Phase 1: Both work (current implementation)**
- YAML config is optional
- Falls back to env vars if YAML missing
- Existing deployments continue working unchanged

**Phase 2: Encourage YAML (documentation)**
- Document brain-config.yaml as preferred approach
- Show examples in README
- Keep env var fallbacks

**Phase 3: Deprecate env vars for config (future)**
- Log warnings for config in env vars
- Encourage migration to YAML
- Keep secrets in env vars forever

---

## Security Considerations

1. **Secrets never in YAML**: API keys, tokens, passwords stay in env vars
2. **YAML in git**: Config can be version controlled (it has no secrets)
3. **Sanitize URLs**: Never show auth tokens if accidentally in config
4. **Read-only command**: `/about` is read-only
5. **Public visibility**: Command marked as `visibility: "public"`
6. **No file writes**: Command only reads, never writes config

---

## Documentation Updates

### New Files

- `docs/configuration.md` - How to configure brains with brain-config.yaml
- `apps/*/brain-config.example.yaml` - Example configs for each app

### Updated Files

- `README.md` - Add configuration section
- `apps/team-brain/README.md` - Document brain-config.yaml
- Plugin docs - Reference brain-config.yaml where relevant
- Deployment docs - Update with YAML config approach

---

## Future Enhancements

### Short Term (v2)
- Add more commands: `/stats` (entity counts), `/plugins` (active plugins)
- Validate brain-config.yaml on startup with better error messages
- Support comments in YAML with usage hints

### Medium Term (v3)
- `/about --edit` - Edit config interactively
- Config hot-reload (watch brain-config.yaml for changes)
- Environment-specific configs (dev/prod)
- `/about set <key> <value>` - Update config from command

### Long Term (v4)
- Web UI for config editing
- Config migration tool
- Config templates/presets
- Plugin-contributed config validation

---

## Success Criteria

- ✓ brain-config.yaml loads correctly
- ✓ Plugins receive config from YAML
- ✓ Secrets still work from env vars
- ✓ `/about` displays current configuration
- ✓ Identity from YAML overrides default
- ✓ Backward compatible (env vars work as fallback)
- ✓ All tests pass
- ✓ Documentation complete
- ✓ No secrets exposed in `/about` output

---

## Estimated Effort

- **Phase 1** (YAML infrastructure): 2-3 hours
- **Phase 2** (Create YAML files): 1 hour
- **Phase 3** (Update brain.config.ts): 2-3 hours
- **Phase 4** (Implement `/about`): 2-3 hours
- **Testing**: 2-3 hours
- **Documentation**: 1-2 hours

**Total**: 10-15 hours

---

## Open Questions

1. **YAML location**: Root level `brain-config.yaml` or `config/brain.yaml`?
   - **Recommendation**: Root level for visibility

2. **Config reload**: Support hot-reload of brain-config.yaml?
   - **Recommendation**: Not for v1, requires restart

3. **Validation timing**: Validate on startup or lazy load?
   - **Recommendation**: Validate on startup, fail fast

4. **Fallback behavior**: What if brain-config.yaml missing?
   - **Recommendation**: Fall back to env vars, then defaults

5. **Command name**: `/about` or `/info` or `/settings`?
   - **Recommendation**: `/about` - standard convention
