# Brain Introspection: `/about` Command

## Overview

Add an `/about` command that provides comprehensive runtime introspection - showing what the brain is, what's currently running, and where it's accessible. This is **not** configuration management, but real-time status reporting.

## The Core Need

**Current State:**
- `/identity` command shows role, purpose, values (good!)
- No way to see the brain's name or model
- No way to see what interfaces are running and their URLs
- No way to check system health status
- Users can't answer: "What is this brain? Where can I access it?"

**What We Need:**
A single command that shows:
1. Who/what the brain is (name, model, version, identity)
2. Where to access it (public URLs, interface status)

## Solution: Introspection-Based `/about` Command

### Core Principle
**Query runtime services for their actual state** - don't read config files, ask the running systems what they're doing.

### Example Output

```markdown
# Team Knowledge Assistant

**Model**: team-brain v1.0.0

## Identity
Role: Team knowledge coordinator
Purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization
Values: collaboration, transparency, accessibility, actionability, candor

## Access
✓ Web: https://babal.io
✓ Matrix: @teambrain:rizom.ai on https://matrix.rizom.ai
✓ MCP: Enabled
```

Or in local development:

```markdown
# Team Knowledge Assistant

**Model**: team-brain v1.0.0

## Identity
Role: Team knowledge coordinator
Purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization
Values: collaboration, transparency, accessibility, actionability, candor

## Access
✓ Web: http://localhost:3000 (preview), http://localhost:8080 (production)
✓ Matrix: @teambrain-dev:rizom.ai on https://matrix.rizom.ai
✓ MCP: Enabled
```

## Implementation Plan

### Phase 1: Identity Schema Enhancement

#### 1.1 Add `name` field to identity schema
**File**: `shell/identity-service/src/schema.ts`

```typescript
export const identityBodySchema = z.object({
  name: z.string(), // NEW: Friendly display name
  role: z.string(),
  purpose: z.string(),
  values: z.array(z.string()),
});
```

#### 1.2 Update identity markdown files
**File**: `apps/team-brain/brain-data/identity/identity.md`

```markdown
# Brain Identity

## Name
Team Knowledge Assistant

## Role
Team knowledge coordinator

## Purpose
Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization

## Values

- collaboration
- transparency
- accessibility
- actionability
- candor
```

#### 1.3 Update identity adapter parsing
**File**: `shell/identity-service/src/adapter.ts`

Update `parseIdentityBody()` to extract `name` from markdown:
- Look for `## Name` section
- Extract the name value

### Phase 2: App Info Exposure

#### 2.1 Add `getAppInfo()` to IShell interface
**File**: `shell/plugins/src/interfaces.ts`

```typescript
export interface IShell {
  // ... existing methods ...

  // App metadata
  getAppInfo(): { model: string; version: string };

  // Introspection APIs
  getDaemonRegistry(): DaemonRegistry;
}
```

#### 2.2 Implement in Shell class
**File**: `shell/core/src/shell.ts`

```typescript
public getAppInfo(): { model: string; version: string } {
  return {
    model: this.config.name || 'brain-app',
    version: this.config.version || '1.0.0',
  };
}

public getDaemonRegistry(): DaemonRegistry {
  return this.daemonRegistry;
}
```

### Phase 3: Enhance Webserver Health Check

#### 3.1 Update webserver health check to include public URL
**File**: `interfaces/webserver/src/webserver-interface.ts`

```typescript
healthCheck: async (): Promise<DaemonHealth> => {
  const status = this.serverManager.getStatus();
  const isRunning = status.preview || status.production;

  // Check for public domain from env
  const domain = process.env["DOMAIN"];

  const details: Record<string, unknown> = {
    preview: status.preview,
    production: status.production,
    previewPort: this.config.previewPort,
    productionPort: this.config.productionPort,
  };

  let message: string;

  if (domain && status.production) {
    // Production deployment with domain
    message = `https://${domain}`;
    details.publicUrl = `https://${domain}`;
  } else if (status.preview || status.production) {
    // Local development
    const parts: string[] = [];
    if (status.preview) {
      parts.push(`http://localhost:${this.config.previewPort} (preview)`);
    }
    if (status.production) {
      parts.push(`http://localhost:${this.config.productionPort} (production)`);
    }
    message = parts.join(", ");
  } else {
    message = "Not running";
  }

  return {
    status: isRunning ? "healthy" : "error",
    message,
    lastCheck: new Date(),
    details,
  };
}
```

### Phase 4: Implement `/about` Command

#### 4.1 Add helper method to SystemPlugin
**File**: `plugins/system/src/plugin.ts`

```typescript
/**
 * Get current daemon status with fresh health checks
 */
public async getDaemonStatus(): Promise<DaemonInfo[]> {
  const daemonRegistry = this.context.shell.getDaemonRegistry();
  const allDaemons = daemonRegistry.getAllInfo();

  // Refresh health checks for accurate status
  for (const daemon of allDaemons) {
    if (daemon.daemon.healthCheck) {
      await daemonRegistry.checkHealth(daemon.name);
    }
  }

  return daemonRegistry.getAllInfo();
}
```

#### 4.2 Add `/about` command
**File**: `plugins/system/src/commands/index.ts`

```typescript
{
  name: "about",
  description: "View brain information and access points",
  usage: "/about",
  visibility: "public",
  handler: async (_args, _context): Promise<CommandResponse> => {
    try {
      const sections: string[] = [];

      // Get identity and app info
      const identity = plugin.getIdentityData();
      const appInfo = plugin.context.shell.getAppInfo();

      // Title: Brain name
      sections.push(`# ${identity.name || 'Personal Brain'}`);
      sections.push("");

      // Model and version
      sections.push(`**Model**: ${appInfo.model} v${appInfo.version}`);
      sections.push("");

      // Identity section
      sections.push("## Identity");
      sections.push(`Role: ${identity.role}`);
      sections.push(`Purpose: ${identity.purpose}`);
      if (identity.values && identity.values.length > 0) {
        sections.push(`Values: ${identity.values.join(", ")}`);
      }
      sections.push("");

      // Access points (interfaces)
      const daemonInfo = await plugin.getDaemonStatus();
      if (daemonInfo.length > 0) {
        sections.push("## Access");

        for (const info of daemonInfo) {
          const isHealthy = info.status === "running" && info.health?.status === "healthy";
          const icon = isHealthy ? "✓" : "✗";
          const message = info.health?.message || info.status;

          // Format interface name (capitalize first letter)
          const name = info.name.charAt(0).toUpperCase() + info.name.slice(1);

          sections.push(`${icon} ${name}: ${message}`);
        }
      }

      return {
        type: "message",
        message: sections.join("\n"),
      };
    } catch (error) {
      return {
        type: "message",
        message: `Error getting brain information: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
}
```

### Phase 5: Update Identity Files

Update existing identity files to include the `name` field:

**File**: `apps/team-brain/brain-data/identity/identity.md`
```markdown
# Brain Identity

## Name
Team Knowledge Assistant

## Role
Team knowledge coordinator

## Purpose
Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization

## Values

- collaboration
- transparency
- accessibility
- actionability
- candor
```

**File**: `apps/test-brain/brain-data/identity/identity.md` (if exists)
```markdown
# Brain Identity

## Name
Test Brain

## Role
Test assistant

## Purpose
Test environment for development

## Values

- testing
- development
```

## What We're NOT Doing (Future Phases)

**Phase 2** (later):
- `/plugins` or `/capabilities` command for plugin list
- `/stats` for entity counts, storage usage, metrics
- System health summary/status

Keep `/about` focused on: **Who am I? Where can you reach me?**

## Key Benefits

1. **User-Focused**: Answers "what is this and how do I access it?"
2. **Dynamic**: Shows actual runtime state, not stale config
3. **Deployment-Aware**: Shows public URL when deployed, local URLs in dev
4. **Simple**: Clear, concise information
5. **Extensible**: Easy to add more interface types
6. **Zero Config Coupling**: No dependency on YAML or complex config structure

## MCP Tool Support

The `/about` command automatically becomes available as an MCP tool since it's a public command. AI assistants can call it to learn about the brain's identity and access points.

## Testing Strategy

### Unit Tests

**File**: `plugins/system/test/commands/about.test.ts`

- Mock Shell.getIdentity(), Shell.getAppInfo(), Shell.getDaemonRegistry()
- Test output formatting for various daemon states
- Test with/without DOMAIN env var
- Test with no daemons
- Test with mixed healthy/unhealthy states
- Test error handling

### Integration Tests

**File**: `plugins/system/test/integration/about-command.test.ts`

- Start Shell with real plugins
- Call /about command
- Verify name, model, version appear
- Verify all running interfaces listed
- Stop a daemon and verify status changes
- Set DOMAIN env var and verify public URL appears

### Manual Testing

1. Start team-brain locally without DOMAIN
   - Run `/about` - verify shows localhost URLs
2. Set DOMAIN=babal.io and restart
   - Run `/about` - verify shows https://babal.io
3. Run `/about` in Matrix
   - Verify same output
4. Call via MCP tool
   - Verify JSON response

## Migration Path

**Phase 1: Identity Schema** (1-2 hours)
- Add `name` to identity schema
- Update identity adapter
- Update identity files
- Test identity parsing

**Phase 2: App Info** (1 hour)
- Add `getAppInfo()` to Shell
- Expose via IShell interface

**Phase 3: Health Check Enhancement** (2 hours)
- Update webserver health check
- Add DOMAIN env var support
- Test local vs deployed behavior

**Phase 4: Command Implementation** (2-3 hours)
- Add `getDaemonStatus()` to SystemPlugin
- Implement `/about` command
- Test in all interfaces

**Testing & Refinement** (2 hours)

## Success Criteria

- ✓ Identity schema includes `name` field
- ✓ `/about` shows brain name, model, version
- ✓ `/about` shows identity (role, purpose, values)
- ✓ `/about` shows interface access points with URLs
- ✓ Webserver shows public URL when DOMAIN is set
- ✓ Webserver shows local URLs when DOMAIN is not set
- ✓ Works in CLI, Matrix, and MCP interfaces
- ✓ No configuration coupling
- ✓ All tests pass

## Estimated Effort

**Total**: 8-10 hours
