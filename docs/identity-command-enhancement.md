# Identity Command Enhancement Plan

## Overview

Enhance the `/identity` command (also known as `system:identity`) to provide comprehensive introspective information about the brain's identity, capabilities, configuration, and current state.

## Current State

The `/identity` command currently displays:
- **Role**: The brain's role (e.g., "Team knowledge coordinator")
- **Purpose**: The brain's purpose statement
- **Values**: List of core values

Location: `plugins/system/src/commands/index.ts` (lines 397-438)

## Problems with Current Implementation

1. **Limited Context**: Only shows identity, no information about what the brain is actually doing
2. **No Configuration Visibility**: Users can't see important settings like sync paths, git URLs, etc.
3. **No Capability Overview**: Doesn't show what plugins/features are active
4. **No Knowledge Base Stats**: Can't see what entities are being managed

## Proposed Enhancement

Add four new sections to the `/identity` command output:

### 1. Knowledge Base Statistics
- Count of entities by type (links, summaries, topics, notes, etc.)
- Total entity count
- Provides visibility into what the brain is managing

### 2. Active Plugins
- List of all enabled plugin IDs
- Shows what capabilities are available
- Helps users understand what commands/tools are accessible

### 3. Configuration Details
- **Sync Path**: Directory where markdown files are synced (from directory-sync plugin)
- **Git Backup URL**: Repository URL for backups (from git-sync plugin, if configured)
- **Matrix Connection**: Homeserver and user ID (from matrix interface, if enabled)
- **Webserver Status**: Whether web interface is running (from webserver interface, if enabled)

### 4. Identity Information (existing)
- Keep current format: role, purpose, values
- Move to top of output for prominence

## Data Loading Strategy

**Decision: Load Dynamically**

All information will be fetched in real-time when the command is invoked:

### Why Dynamic Loading?
1. **Always Accurate**: Entity counts and plugin status reflect current state
2. **Configuration Changes**: Reflects any config updates immediately
3. **Simple Implementation**: No cache invalidation complexity
4. **Low Cost**: All operations are cheap (array lookups, cached values)
5. **Infrequent Use**: This is a user-facing introspection command, not called frequently

### Performance Considerations

**Fast Operations:**
- Identity data: Already cached in IdentityService
- Entity types: Simple array lookup
- Plugin list: Array from PluginManager
- Plugin configs: Direct property access

**Potentially Slower Operation:**
- Entity counting: Requires listing entities per type
- Mitigation: Most brains have < 1000 entities total
- If needed: Add 30-second in-memory cache for counts

**Estimated Response Time:** < 500ms for typical brain with 100-500 entities

## Implementation Plan

### Phase 1: Expose Required APIs

**1.1. Add Shell method to get plugin list**

File: `shell/core/src/shell.ts`

```typescript
public getAllPluginIds(): string[] {
  return this.pluginManager.getAllPluginIds();
}
```

Update `IShell` interface in `shell/plugins/src/interfaces.ts`:
```typescript
export interface IShell {
  // ... existing methods
  getAllPluginIds(): string[];
}
```

**1.2. Add method to get plugin configs (optional)**

If we want to show specific plugin configs, add to SystemPlugin:

```typescript
public getPluginConfig(pluginId: string): Record<string, unknown> | undefined {
  if (!this.context) {
    throw new Error("Plugin not registered");
  }
  // Access plugin manager through shell
  // Return sanitized config (no secrets)
}
```

### Phase 2: Update Identity Command Handler

File: `plugins/system/src/commands/index.ts`

**2.1. Gather all data**

```typescript
handler: async (_args, context): Promise<CommandResponse> => {
  try {
    // 1. Identity data (existing)
    const identity = plugin.getIdentityData();

    // 2. Knowledge base stats
    const entityTypes = context.entityService.getEntityTypes();
    const entityCounts = await Promise.all(
      entityTypes.map(async (type) => {
        const entities = await context.entityService.listEntities(type, {
          limit: 10000, // High limit to get count
        });
        return { type, count: entities.length };
      })
    );
    const totalEntities = entityCounts.reduce((sum, { count }) => sum + count, 0);

    // 3. Active plugins
    const pluginIds = context.shell.getAllPluginIds();

    // 4. Configuration details
    // TODO: Determine best way to access plugin configs
    // Options:
    // - Environment variables (SYNC_PATH, GIT_SYNC_URL, etc.)
    // - Plugin config accessor (if we build one)
    // - Hard-coded checks for known plugins

    // Format and return response...
  } catch (error) {
    return {
      type: "message",
      message: `Error getting identity: ${error.message}`,
    };
  }
}
```

**2.2. Format output**

```typescript
const sections = [
  "# Brain Identity",
  "",
  "## Role",
  identity.role || "Not set",
  "",
  "## Purpose",
  identity.purpose || "Not set",
  "",
  "## Values",
];

// Add values
if (identity.values && identity.values.length > 0) {
  identity.values.forEach((value) => {
    sections.push(`- ${value}`);
  });
} else {
  sections.push("Not set");
}

// Add knowledge base section
sections.push("", "## Knowledge Base");
entityCounts
  .filter(({ count }) => count > 0)
  .forEach(({ type, count }) => {
    sections.push(`- ${count} ${type}${count !== 1 ? 's' : ''}`);
  });
sections.push("", `Total: ${totalEntities} entities`);

// Add configuration section
sections.push("", "## Configuration");
if (syncPath) sections.push(`Sync Path: ${syncPath}`);
if (gitUrl) sections.push(`Git Backup: ${gitUrl}`);
if (matrixInfo) sections.push(`Matrix: ${matrixInfo}`);
if (webserverRunning) sections.push(`Webserver: Running`);

// Add plugins section
sections.push("", "## Active Plugins");
sections.push(pluginIds.join(", "));

return {
  type: "message",
  message: sections.join("\n"),
};
```

### Phase 3: Configuration Access Strategy

**Decision Point:** How to access plugin configurations?

**Option A: Environment Variables** (Simplest)
- Read from `process.env` directly
- Pros: Simple, no new APIs needed
- Cons: Only works for env-configured plugins

**Option B: Plugin Config Accessor** (Most Flexible)
- Add method to get sanitized plugin configs
- Pros: Works for any plugin configuration
- Cons: More complex, requires new API

**Option C: Known Plugin Checks** (Pragmatic)
- Hard-code checks for common plugins (directory-sync, git-sync, matrix)
- Pros: Works immediately, no new APIs
- Cons: Not extensible

**Recommendation: Start with Option C, migrate to Option B if needed**

```typescript
// Check for directory-sync config
let syncPath: string | undefined;
if (pluginIds.includes("directory-sync")) {
  syncPath = process.env["SYNC_PATH"] || "./brain-data";
}

// Check for git-sync config
let gitUrl: string | undefined;
if (pluginIds.includes("git-sync")) {
  gitUrl = process.env["GIT_SYNC_URL"];
}

// Check for matrix interface
let matrixInfo: string | undefined;
if (pluginIds.includes("matrix")) {
  const userId = process.env["MATRIX_USER_ID"];
  const homeserver = process.env["MATRIX_HOMESERVER"];
  if (userId && homeserver) {
    matrixInfo = `${userId} on ${homeserver}`;
  }
}

// Check for webserver
const webserverRunning = pluginIds.includes("webserver");
```

## Example Output

```markdown
# Brain Identity

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

## Knowledge Base
- 45 links
- 23 summaries
- 12 topics
- 8 notes
- 1 identity

Total: 89 entities

## Configuration
Sync Path: ./brain-data
Git Backup: https://github.com/username/team-brain-backup
Matrix: @teambrain-dev:rizom.ai on https://matrix.rizom.ai
Webserver: Running

## Active Plugins
system, topics, summary, link, mcp, matrix, directory-sync, git-sync, webserver, site-builder
```

## Testing Strategy

### Unit Tests
- Mock all service dependencies
- Test each section formatting independently
- Test error handling for missing data

### Integration Tests
- Run command in test-brain environment
- Verify all sections appear
- Verify data accuracy (entity counts, plugin list)

### Manual Testing
- Test in team-brain and test-brain
- Verify configuration values are correct
- Test with different plugin combinations

## Future Enhancements

### Short Term
- Add caching for entity counts (30s TTL)
- Show last sync time from directory-sync
- Show last backup time from git-sync

### Medium Term
- Add `/identity --verbose` flag for more details
- Show recent activity (last 10 entity updates)
- Show job queue status

### Long Term
- Make command extensible - plugins can contribute sections
- Add JSON output format for programmatic use
- Create corresponding MCP tool for identity introspection

## Migration Notes

### Backward Compatibility
- Existing output format remains unchanged structurally
- New sections are additive only
- No breaking changes to command signature

### Documentation Updates
- Update plugin documentation to mention `/identity` command
- Add examples to user guides
- Update MCP tool descriptions

## Security Considerations

1. **No Secrets**: Never display API keys, auth tokens, or passwords
2. **Sanitize URLs**: Show git URLs but strip credentials if present
3. **User IDs Only**: Show Matrix user IDs but not access tokens
4. **Public Command**: Mark as `visibility: "public"` - safe for all users

## Performance Benchmarks

Target performance metrics:
- **Entity Counting**: < 300ms for 1000 entities
- **Total Command**: < 500ms end-to-end
- **Memory**: < 10MB additional allocation

If benchmarks not met:
1. Add simple in-memory cache (30s TTL)
2. Limit entity listing to first 10K per type
3. Show approximate counts for large entity sets

## Open Questions

1. Should we show entity counts for empty types (0 links, 0 summaries)?
   - **Recommendation**: No, only show non-zero counts

2. Should configuration section show defaults or only configured values?
   - **Recommendation**: Only show explicitly configured values

3. Should we group plugins by type (core/service/interface)?
   - **Recommendation**: Start simple with flat list, enhance later if needed

4. How to handle plugin configs that aren't from env vars?
   - **Recommendation**: Phase 2 enhancement - build plugin config accessor API

## Success Criteria

1. ✓ Command shows all 4 new sections
2. ✓ Entity counts are accurate
3. ✓ Plugin list matches active plugins
4. ✓ Configuration values are correct
5. ✓ No secrets or sensitive data exposed
6. ✓ Command responds in < 500ms
7. ✓ All tests pass
8. ✓ Documentation updated
