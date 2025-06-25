# MCP-Powered Dashboard Plan

## Overview

This document outlines the future enhancement of the static dashboard with real-time MCP-powered data. This should be implemented after completing the current site-builder architecture phases.

## Architecture

### 1. MCP Dashboard Tools

Add specialized tools to the shell's MCP server for dashboard data:

```typescript
// Dashboard statistics tool
{
  name: 'dashboard_stats',
  description: 'Get current system statistics for dashboard',
  inputSchema: {
    type: 'object',
    properties: {
      include: {
        type: 'array',
        items: {
          enum: ['entity_counts', 'recent_activity', 'system_health', 'plugin_status']
        },
        default: ['entity_counts', 'recent_activity']
      },
      activity_limit: {
        type: 'number',
        default: 10,
        description: 'Number of recent activities to include'
      }
    }
  },
  handler: async (args) => {
    const stats: DashboardStats = {};

    if (args.include.includes('entity_counts')) {
      stats.entityCounts = await shell.getEntityService().getCountsByType();
    }

    if (args.include.includes('recent_activity')) {
      stats.recentActivity = await shell.getEntityService().list({
        limit: args.activity_limit,
        sortBy: 'updated',
        sortDirection: 'desc'
      });
    }

    if (args.include.includes('system_health')) {
      stats.systemHealth = {
        dbStatus: await shell.checkDatabaseHealth(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
    }

    if (args.include.includes('plugin_status')) {
      stats.pluginStatus = shell.getPluginManager().getPluginStatuses();
    }

    return stats;
  }
}

// Real-time activity stream tool
{
  name: 'dashboard_activity_stream',
  description: 'Subscribe to real-time activity updates',
  inputSchema: {
    type: 'object',
    properties: {
      entity_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter activities by entity types'
      },
      event_types: {
        type: 'array',
        items: { enum: ['created', 'updated', 'deleted'] },
        default: ['created', 'updated']
      }
    }
  },
  handler: async function* (args) {
    // Subscribe to MessageBus events
    const subscription = shell.messageBus.subscribe('entity.*', (event) => {
      if (args.entity_types && !args.entity_types.includes(event.entityType)) return;
      if (args.event_types && !args.event_types.includes(event.type)) return;

      return {
        id: event.id,
        type: event.type,
        entityType: event.entityType,
        timestamp: event.timestamp,
        data: event.data
      };
    });

    // Yield events as they occur
    for await (const event of subscription) {
      yield event;
    }
  }
}
```

### 2. MCP-over-HTTP Bridge

Expose MCP via HTTP for browser access:

```typescript
// In webserver package
app.post("/mcp/call", async (req, res) => {
  const { method, params } = req.body;

  try {
    const result = await shell.getMcpServer().handleRequest({
      jsonrpc: "2.0",
      id: req.body.id || 1,
      method,
      params,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

// Server-Sent Events for streaming
app.get("/mcp/stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const { tool, args } = req.query;

  // Call streaming MCP tool
  const stream = await shell.getMcpServer().callStreamingTool(tool, args);

  for await (const event of stream) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
});
```

### 3. Enhanced Dashboard Component

Update the dashboard to use MCP for live data:

```typescript
interface DashboardProps {
  initialData: DashboardData; // From SSR
  useLiveData?: boolean; // Enable MCP updates
  mcpEndpoint?: string; // MCP HTTP endpoint
  refreshInterval?: number; // Polling interval
}

export const DashboardWidget: React.FC<DashboardProps> = ({
  initialData,
  useLiveData = true,
  mcpEndpoint = '/mcp/call',
  refreshInterval = 30000
}) => {
  const [data, setData] = useState(initialData);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // MCP client hook
  const mcp = useMCPClient(mcpEndpoint);

  // Fetch live data via MCP
  const fetchLiveData = useCallback(async () => {
    try {
      const stats = await mcp.call('dashboard_stats', {
        include: ['entity_counts', 'recent_activity', 'system_health']
      });

      setData(stats);
      setIsLive(true);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch live data:', error);
      // Fall back to static data
    }
  }, [mcp]);

  // Set up polling
  useEffect(() => {
    if (!useLiveData) return;

    fetchLiveData(); // Initial fetch
    const interval = setInterval(fetchLiveData, refreshInterval);

    return () => clearInterval(interval);
  }, [useLiveData, fetchLiveData, refreshInterval]);

  // Set up real-time activity stream
  useEffect(() => {
    if (!useLiveData) return;

    const eventSource = new EventSource(`${mcpEndpoint}/stream?tool=dashboard_activity_stream`);

    eventSource.onmessage = (event) => {
      const activity = JSON.parse(event.data);

      // Update recent activities in real-time
      setData(prev => ({
        ...prev,
        recentActivity: [activity, ...prev.recentActivity].slice(0, 10)
      }));
    };

    return () => eventSource.close();
  }, [useLiveData, mcpEndpoint]);

  return (
    <div className="dashboard-widget">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">System Dashboard</h2>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 text-green-600">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
              Live
            </span>
          )}
          <span className="text-sm text-gray-500">
            Updated: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Rest of dashboard UI with live data */}
    </div>
  );
};
```

### 4. MCP Client Utilities

Create React hooks for MCP communication:

```typescript
// useMCPClient hook
export function useMCPClient(endpoint: string) {
  const call = useCallback(
    async (method: string, params?: any) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: method, arguments: params },
          id: Date.now(),
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      return result.result;
    },
    [endpoint],
  );

  return { call };
}

// useActivityStream hook
export function useActivityStream(
  endpoint: string,
  options: ActivityStreamOptions,
  onActivity: (activity: Activity) => void,
) {
  useEffect(() => {
    const params = new URLSearchParams({
      tool: "dashboard_activity_stream",
      args: JSON.stringify(options),
    });

    const eventSource = new EventSource(`${endpoint}/stream?${params}`);

    eventSource.onmessage = (event) => {
      const activity = JSON.parse(event.data);
      onActivity(activity);
    };

    eventSource.onerror = (error) => {
      console.error("Activity stream error:", error);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [endpoint, options, onActivity]);
}
```

## Implementation Phases

### Phase 1: MCP Dashboard Tools

1. Add dashboard-specific tools to shell MCP server
2. Test tools via MCP CLI
3. Document tool schemas and responses

### Phase 2: HTTP Transport

1. Implement MCP-over-HTTP endpoint in webserver
2. Add authentication and rate limiting
3. Implement SSE endpoint for streaming tools

### Phase 3: Dashboard Enhancement

1. Update dashboard component with MCP client
2. Add live data fetching with graceful fallback
3. Implement real-time activity stream
4. Add connection status indicators

### Phase 4: Production Features

1. Add caching layer for dashboard data
2. Implement request batching
3. Add error recovery and reconnection
4. Performance optimization

## Benefits

1. **Unified API** - Everything goes through MCP
2. **Real-time Updates** - Live data via SSE
3. **AI Integration** - Claude can use dashboard tools
4. **Progressive Enhancement** - Works without JS, better with it
5. **Scalable Architecture** - Easy to add more dashboard tools

## Security Considerations

1. **Authentication** - Protect MCP endpoints
2. **Rate Limiting** - Prevent abuse
3. **Input Validation** - Validate all MCP calls
4. **CORS** - Configure for dashboard domain
5. **Permissions** - Respect entity access controls

## Future Enhancements

1. **WebSocket Transport** - For bidirectional communication
2. **Dashboard Customization** - User-configurable widgets
3. **Export Capabilities** - Download dashboard data
4. **Historical Analytics** - Time-series data
5. **Multi-tenant Support** - Per-user dashboards

This plan provides a clear path to enhance the static dashboard with real-time MCP-powered capabilities while maintaining the architectural integrity of the Brain system.
