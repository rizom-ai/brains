# Plan: Make Preview Environment Optional

**Date**: 2025-10-20
**Status**: Planning
**Goal**: Allow deployments to work without a preview environment, deploying directly to production when preview is not configured.

## Current State

The system currently maintains two separate environments:

- **Preview**: `./dist/site-preview` on port 4321
- **Production**: `./dist/site-production` on port 8080

Both environments are:

- Always started on initialization
- Have separate configuration (directories, ports, domains)
- Built separately with the site-builder plugin

The auto-rebuild feature always targets the preview environment, and the build-site tool defaults to preview.

## Problem

Preview environment adds complexity for simple deployments where users want to:

- Deploy directly to production
- Avoid running two separate servers
- Simplify their configuration

## Proposed Solution

Make preview environment completely optional. When preview is not configured:

- Only production server starts
- Build tool defaults to production
- Auto-rebuild targets production
- No preview-related resources are allocated

## Implementation Plan

### 1. Configuration Schema Changes

#### `interfaces/webserver/src/config.ts`

```typescript
export const webserverConfigSchema = z.object({
  previewDistDir: z
    .string()
    .optional() // Remove .default()
    .describe("Directory for preview site files"),
  productionDistDir: z
    .string()
    .describe("Directory for production site files")
    .default("./dist/site-production"),
  previewPort: z
    .number()
    .optional() // Remove .default()
    .describe("Port for preview server"),
  productionPort: z
    .number()
    .describe("Port for production server")
    .default(8080),
  productionDomain: z
    .string()
    .optional()
    .describe("Public domain for production server"),
  previewDomain: z
    .string()
    .optional()
    .describe("Public domain for preview server"),
});
```

**Why**: Making these fields optional without defaults means preview is only enabled when explicitly configured.

#### `plugins/site-builder/src/config.ts`

```typescript
export const siteBuilderConfigSchema = z.object({
  previewOutputDir: z
    .string()
    .optional() // Remove .default()
    .describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .optional()
    .describe("Output directory for production builds")
    .default("./dist/site-production"),
  // ... rest of config
});
```

**Why**: Removes automatic preview directory creation.

### 2. Server Startup Logic

#### `interfaces/webserver/src/webserver-interface.ts`

**Location**: Around line 51-53 (auto-start section)

```typescript
// Auto-start servers based on configuration
if (this.config.previewPort && this.config.previewDistDir) {
  await this.serverManager.startPreviewServer();
  this.logger.info("Preview server enabled");
} else {
  this.logger.info("Preview server disabled (not configured)");
}

await this.serverManager.startProductionServer();
```

**Why**: Conditionally start preview only when configured.

#### `interfaces/webserver/src/server-manager.ts`

**Methods to update**:

- `createPreviewApp()` - Add guard for missing config
- `startPreviewServer()` - Check config before starting
- `stopPreviewServer()` - Handle null gracefully

```typescript
public async startPreviewServer(): Promise<void> {
  if (!this.config.previewPort || !this.config.previewDistDir) {
    this.logger.warn("Preview server not configured, skipping");
    return;
  }

  // ... existing start logic
}
```

**Why**: Prevents errors when preview methods are called without config.

### 3. Build Tool Defaults

#### `plugins/site-builder/src/tools/index.ts`

**Location**: build-site tool definition (around line 118)

```typescript
{
  name: `${pluginId}:build-site`,
  description: "Build a static site from registered routes",
  inputSchema: {
    environment: z
      .enum(["preview", "production"])
      .optional()  // Make optional instead of default
      .describe("Build environment (defaults to production, or preview if configured)"),
    // ...
  },
  handler: async (input, context) => {
    const params = buildSchema.parse(input);

    // Determine default environment based on config
    const defaultEnv = config.previewOutputDir ? "preview" : "production";
    const environment = params.environment ?? defaultEnv;

    // Validate environment is available
    if (environment === "preview" && !config.previewOutputDir) {
      throw new Error("Preview environment not configured");
    }

    // Determine output directory
    const outputDir = environment === "production"
      ? config.productionOutputDir
      : config.previewOutputDir!;

    // ... rest of handler
  },
}
```

**Why**: Intelligently defaults to available environment.

#### `plugins/site-builder/src/plugin.ts`

**Location**: setupAutoRebuild method (around line 349)

```typescript
private setupAutoRebuild(context: ServicePluginContext): void {
  let pendingRebuild = false;
  let rebuildTimer: NodeJS.Timeout | undefined;

  const excludedTypes = ["base"];

  const scheduleRebuild = (): void {
    if (pendingRebuild) return;

    pendingRebuild = true;
    this.logger.debug("Scheduling site rebuild in 5 seconds");

    rebuildTimer = setTimeout(async () => {
      pendingRebuild = false;

      // Determine target environment based on config
      const environment = this.config.previewOutputDir ? "preview" : "production";
      const outputDir = environment === "production"
        ? this.config.productionOutputDir
        : this.config.previewOutputDir!;

      this.logger.debug(`Auto-triggering ${environment} site rebuild after content changes`);

      try {
        await context.enqueueJob("site-build", {
          environment,
          outputDir,
          workingDir: this.config.workingDir,
          enableContentGeneration: true,
          metadata: {
            trigger: "auto-rebuild",
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        this.logger.error("Failed to enqueue auto-rebuild", error);
      }
    }, 5000);
  };

  // ... event subscriptions remain the same
}
```

**Why**: Auto-rebuild adapts to configured environment.

### 4. Documentation Updates

#### `apps/team-brain/.env.example`

**Location**: Webserver section (around line 39-45)

```bash
# Webserver Plugin (Optional)
# Production server is always enabled
# DOMAIN=your-domain.com                    # Optional: public domain for production

# Preview Environment (Optional)
# Uncomment these to enable a separate preview environment
# PREVIEW_DOMAIN=preview.your-domain.com    # Optional: public domain for preview
# PREVIEW_PORT=4321                          # Port for preview server
# PRODUCTION_PORT=8080                       # Port for production server (default: 8080)
```

**Why**: Clarifies preview is optional and shows minimal setup.

#### New: `docs/deployment/single-environment.md`

Create a guide for production-only deployments showing:

- Minimal configuration example
- How auto-rebuild works without preview
- How to manually build to production
- Migration from dual-environment setup

## Testing Strategy

### Test Cases

1. **Preview Disabled**:
   - No preview env vars set
   - Only production server starts
   - Auto-rebuild targets production
   - Manual build defaults to production

2. **Preview Enabled**:
   - All preview env vars set
   - Both servers start
   - Auto-rebuild targets preview
   - Manual build defaults to preview

3. **Migration**:
   - Existing deployment with preview
   - Remove preview config
   - Verify graceful degradation to production-only

### Test Commands

```bash
# Test with preview disabled
bun test interfaces/webserver
bun test plugins/site-builder

# Integration test
bun run typecheck
bun run build

# Manual verification
# 1. Start with no preview config
# 2. Trigger entity change
# 3. Verify production build occurs
# 4. Check only production server running
```

## Migration Path

### For Existing Deployments

1. **No Action Required**: If you want to keep preview, existing config continues to work
2. **To Disable Preview**: Remove preview-related environment variables
3. **Gradual Migration**: Can disable preview server first, then remove config later

### Breaking Changes

**None** - This is backwards compatible:

- Existing deployments with preview config continue to work
- New deployments can choose production-only or dual-environment

## Files to Modify

1. ✅ `interfaces/webserver/src/config.ts` - Make preview fields optional
2. ✅ `interfaces/webserver/src/webserver-interface.ts` - Conditional server start
3. ✅ `interfaces/webserver/src/server-manager.ts` - Guard preview methods
4. ✅ `plugins/site-builder/src/config.ts` - Make previewOutputDir optional
5. ✅ `plugins/site-builder/src/tools/index.ts` - Smart environment default
6. ✅ `plugins/site-builder/src/plugin.ts` - Auto-rebuild environment selection
7. ✅ `apps/team-brain/.env.example` - Update documentation
8. ✅ `docs/deployment/single-environment.md` - New deployment guide

## Success Criteria

- [ ] Can deploy without preview environment variables
- [ ] Production server starts without preview
- [ ] Auto-rebuild works in production-only mode
- [ ] Manual builds default correctly based on config
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No breaking changes for existing deployments

## Timeline

**Estimated effort**: 2-3 hours

- Configuration changes: 30 minutes
- Server logic updates: 45 minutes
- Build tool updates: 45 minutes
- Testing: 30 minutes
- Documentation: 30 minutes

## Risks & Mitigations

| Risk                                        | Mitigation                                             |
| ------------------------------------------- | ------------------------------------------------------ |
| Breaking existing deployments               | Make changes backwards compatible with optional fields |
| Preview server errors when disabled         | Add guards in all preview methods                      |
| Auto-rebuild fails without preview          | Dynamic environment selection based on config          |
| Confusion about which environment is active | Clear logging when preview is disabled                 |

## Next Steps

1. Review and approve this plan
2. Implement configuration schema changes
3. Update server startup logic
4. Modify build defaults
5. Run test suite
6. Update documentation
7. Test with real deployment
8. Commit and deploy
