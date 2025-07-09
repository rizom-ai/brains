# Async Operations Enhancement Plan

## Problem
- LLMs must poll for async operation status
- No real-time progress updates for CLI/Matrix interfaces
- Status responses lack helpful timing information

## Solution Overview
1. Add MCP server notifications for real-time clients
2. Enhance tool responses with polling guidance for LLMs
3. Improve status tool with timing and progress details

## Implementation Plan

### Phase 1: Enhanced Tool Responses (2 hours)
Update async tools to return structured job information:

```typescript
// Example: site_generate response
{
  "success": true,
  "jobId": "batch-123",
  "type": "batch",
  "status": "started",
  "estimatedDuration": "30-60 seconds",
  "checkStatusIn": "30 seconds",
  "message": "Generating content for 10 sections"
}
```

**Files to modify:**
- `plugins/site-builder/src/site-builder.ts` - Add estimates to responses
- `shell/core/src/shell.ts` - Update shell:query responses
- `shared/plugin-utils/src/interfaces.ts` - Add response types

### Phase 2: Server Notifications (3 hours)
Wire up MCP notifications for progress events:

```typescript
// In mcp-interface.ts
this.context.subscribe("job:progress", async (event) => {
  if (this.mcpServer) {
    await this.mcpServer.notification({
      method: "notifications/progress",
      params: {
        jobId: event.data.id,
        type: event.data.type,
        status: event.data.status,
        progress: event.data.progress
      }
    });
  }
});
```

**Files to modify:**
- `interfaces/mcp/src/mcp-interface.ts` - Add notification support
- `interfaces/cli/src/cli-interface.ts` - Already subscribes to events
- `interfaces/matrix/src/matrix-interface.ts` - Add progress formatting

### Phase 3: Enhanced Status Tool (2 hours)
Improve status responses with actionable information:

```typescript
{
  "batch-123": {
    "status": "processing",
    "progress": { "current": 3, "total": 10 },
    "startedAt": "2024-01-08T10:00:00Z",
    "estimatedCompletion": "30 seconds",
    "currentOperation": "Generating landing:features",
    "checkAgainIn": "15 seconds"
  }
}
```

**Files to modify:**
- `plugins/site-builder/src/site-builder.ts` - Enhance status tool
- `shell/job-queue/src/job-progress-monitor.ts` - Add timing calculations

## API Changes

### Tool Response Types
```typescript
interface AsyncToolResponse {
  success: boolean;
  jobId: string;
  type: "job" | "batch";
  status: "started" | "queued";
  estimatedDuration?: string;
  checkStatusIn?: string;
  message: string;
}
```

### Notification Format
```typescript
interface ProgressNotification {
  method: "notifications/progress";
  params: {
    jobId: string;
    type: "job" | "batch";
    status: string;
    progress?: {
      current: number;
      total: number;
      percentage: number;
    };
    message?: string;
  };
}
```

## Testing
- Test MCP notifications with a mock client
- Verify CLI progress bar still works
- Test LLM polling with new response format
- Ensure backward compatibility

## Rollout
1. Deploy enhanced responses first (no breaking changes)
2. Add notification support (opt-in for clients)
3. Monitor usage and gather feedback
4. Iterate based on real usage patterns

## Estimated Effort
- Phase 1: 2 hours
- Phase 2: 3 hours  
- Phase 3: 2 hours
- Testing: 2 hours
- **Total: ~9 hours**

## Decision Criteria
Implement if:
- Users report confusion about async operations
- We add more long-running operations
- We need better progress visibility

Skip if:
- Current polling is sufficient
- Other features are higher priority
- System stability is still a concern