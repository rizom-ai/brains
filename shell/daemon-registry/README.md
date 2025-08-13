# @brains/daemon-registry

Background daemon process management for Personal Brain shell.

## Overview

This package provides a registry for managing long-running background processes (daemons) within the Brain shell. It handles daemon lifecycle, health monitoring, and inter-process communication.

## Features

- Daemon registration and lifecycle management
- Health checks and auto-restart
- Process monitoring and metrics
- Inter-daemon communication
- Graceful shutdown handling
- Resource limits and throttling
- Scheduled daemon execution

## Installation

```bash
bun add @brains/daemon-registry
```

## Usage

```typescript
import { DaemonRegistry } from "@brains/daemon-registry";

const registry = DaemonRegistry.getInstance();

// Register a daemon
registry.register({
  name: "sync-daemon",
  description: "Syncs entities with external services",
  interval: 60000, // Run every minute
  handler: async () => {
    await syncWithExternalServices();
  },
  healthCheck: async () => {
    return await checkExternalConnection();
  },
});

// Start daemon
await registry.start("sync-daemon");

// Stop daemon
await registry.stop("sync-daemon");
```

## Daemon Definition

```typescript
interface DaemonDefinition {
  name: string; // Unique daemon name
  description?: string; // Description
  handler: DaemonHandler; // Main function
  interval?: number; // Run interval (ms)
  schedule?: string; // Cron expression
  healthCheck?: HealthCheck; // Health check function
  restartPolicy?: RestartPolicy; // Restart behavior
  resources?: ResourceLimits; // Resource constraints
  dependencies?: string[]; // Required daemons
}

type DaemonHandler = (context: DaemonContext) => Promise<void>;

interface DaemonContext {
  signal: AbortSignal; // For graceful shutdown
  metrics: Metrics; // Performance metrics
  logger: Logger; // Daemon-specific logger
  state: DaemonState; // Shared state
}
```

## Daemon Types

### Interval Daemons

Run at regular intervals:

```typescript
registry.register({
  name: "cleanup",
  interval: 3600000, // Every hour
  handler: async (ctx) => {
    await cleanupOldEntities();
    ctx.metrics.increment("cleanup.runs");
  },
});
```

### Scheduled Daemons

Run on a schedule using cron expressions:

```typescript
registry.register({
  name: "daily-backup",
  schedule: "0 2 * * *", // 2 AM daily
  handler: async (ctx) => {
    await performBackup();
  },
});
```

### Continuous Daemons

Run continuously:

```typescript
registry.register({
  name: "event-processor",
  handler: async (ctx) => {
    while (!ctx.signal.aborted) {
      const event = await queue.pop();
      if (event) {
        await processEvent(event);
      } else {
        await sleep(100); // Brief pause
      }
    }
  },
});
```

## Lifecycle Management

### Starting Daemons

```typescript
// Start single daemon
await registry.start("sync-daemon");

// Start all registered daemons
await registry.startAll();

// Start with options
await registry.start("sync-daemon", {
  immediate: true, // Run immediately, don't wait for interval
  restart: true, // Restart if already running
});
```

### Stopping Daemons

```typescript
// Graceful stop
await registry.stop("sync-daemon");

// Force stop
await registry.stop("sync-daemon", { force: true });

// Stop all daemons
await registry.stopAll();
```

### Restart

```typescript
// Restart daemon
await registry.restart("sync-daemon");

// Restart all daemons
await registry.restartAll();
```

## Health Monitoring

### Health Checks

```typescript
registry.register({
  name: "api-poller",
  healthCheck: async () => {
    const response = await fetch(API_URL);
    return {
      healthy: response.ok,
      message: response.ok ? "API reachable" : "API down",
      metrics: {
        responseTime: response.time,
      },
    };
  },
  healthCheckInterval: 30000, // Check every 30s
});
```

### Auto-restart

```typescript
registry.register({
  name: "critical-daemon",
  restartPolicy: {
    enabled: true,
    maxRestarts: 5,
    restartDelay: 1000,
    backoff: "exponential", // or "linear"
  },
  handler: async (ctx) => {
    // Daemon that auto-restarts on failure
  },
});
```

## Resource Management

### Resource Limits

```typescript
registry.register({
  name: "heavy-processor",
  resources: {
    maxMemory: 512 * 1024 * 1024, // 512MB
    maxCpu: 0.5, // 50% CPU
    priority: "low", // low | normal | high
  },
  handler: async (ctx) => {
    // Resource-constrained daemon
  },
});
```

### Throttling

```typescript
registry.register({
  name: "rate-limited",
  throttle: {
    requests: 100,
    window: 60000, // 100 requests per minute
  },
  handler: async (ctx) => {
    // Rate-limited daemon
  },
});
```

## Inter-daemon Communication

### Message Passing

```typescript
// Send message to daemon
await registry.send("target-daemon", {
  type: "update",
  data: { foo: "bar" },
});

// Receive messages in daemon
registry.register({
  name: "message-receiver",
  handler: async (ctx) => {
    ctx.on("message", (msg) => {
      console.log("Received:", msg);
    });
  },
});
```

### Shared State

```typescript
// Set shared state
registry.setState("sync-daemon", { lastSync: Date.now() });

// Get shared state
const state = registry.getState("sync-daemon");

// Watch state changes
registry.watchState("sync-daemon", (newState) => {
  console.log("State changed:", newState);
});
```

## Monitoring

### Metrics

```typescript
// Get daemon metrics
const metrics = registry.getMetrics("sync-daemon");
console.log(metrics);
// {
//   uptime: 3600000,
//   restarts: 0,
//   errors: 2,
//   lastRun: Date,
//   averageRunTime: 245,
// }

// Get all metrics
const allMetrics = registry.getAllMetrics();
```

### Status

```typescript
// Get daemon status
const status = registry.getStatus("sync-daemon");
// "running" | "stopped" | "error" | "starting" | "stopping"

// Get detailed info
const info = registry.getInfo("sync-daemon");
// {
//   name: "sync-daemon",
//   status: "running",
//   pid: 12345,
//   startTime: Date,
//   metrics: {...},
//   health: {...},
// }
```

## Events

```typescript
registry.on("daemon:started", (daemon) => {
  console.log(`Started: ${daemon.name}`);
});

registry.on("daemon:stopped", (daemon) => {
  console.log(`Stopped: ${daemon.name}`);
});

registry.on("daemon:error", (event) => {
  console.error(`Error in ${event.daemon}:`, event.error);
});

registry.on("daemon:health", (event) => {
  if (!event.healthy) {
    console.warn(`Unhealthy: ${event.daemon}`);
  }
});
```

## Dependencies

Define daemon dependencies:

```typescript
registry.register({
  name: "dependent",
  dependencies: ["database", "cache"],
  handler: async (ctx) => {
    // Won't start until database and cache are running
  },
});

// Start with dependencies
await registry.startWithDependencies("dependent");
```

## Testing

```typescript
import { DaemonRegistry } from "@brains/daemon-registry";
import { createMockDaemon } from "@brains/daemon-registry/test";

const registry = DaemonRegistry.createFresh();

const mockDaemon = createMockDaemon({
  name: "test-daemon",
  handler: jest.fn(),
});

registry.register(mockDaemon);

await registry.start("test-daemon");
expect(mockDaemon.handler).toHaveBeenCalled();
```

## Exports

- `DaemonRegistry` - Main registry class
- `DaemonDefinition` - Daemon type definition
- `DaemonContext` - Execution context
- `DaemonMetrics` - Metrics interface
- Utility functions and types

## License

MIT
