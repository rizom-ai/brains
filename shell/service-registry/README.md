# @brains/service-registry

Service discovery and dependency injection registry for Personal Brain shell.

## Overview

This package provides a centralized registry for managing services, enabling dependency injection, service discovery, and lifecycle management within the Brain shell architecture.

## Features

- Service registration and discovery
- Dependency injection container
- Service lifecycle management
- Circular dependency detection
- Lazy loading and singleton patterns
- Service health monitoring
- Mock service injection for testing

## Installation

```bash
bun add @brains/service-registry
```

## Usage

```typescript
import { ServiceRegistry } from "@brains/service-registry";

const registry = ServiceRegistry.getInstance();

// Register a service
registry.register("database", {
  factory: () => new DatabaseService(),
  singleton: true,
  dependencies: ["config"],
});

// Get a service
const db = await registry.get("database");

// Register with interface
registry.register<IUserService>("userService", {
  factory: (deps) => new UserService(deps.database),
  dependencies: ["database"],
  interface: IUserService,
});
```

## Service Definition

```typescript
interface ServiceDefinition<T = any> {
  factory: ServiceFactory<T>; // Service creation function
  singleton?: boolean; // Single instance (default: true)
  dependencies?: string[]; // Required services
  interface?: Interface<T>; // Service interface/contract
  lazy?: boolean; // Lazy initialization
  lifecycle?: ServiceLifecycle; // Lifecycle hooks
  metadata?: Record<string, any>; // Service metadata
}

type ServiceFactory<T> = (
  dependencies: Record<string, any>,
  context: ServiceContext,
) => T | Promise<T>;

interface ServiceLifecycle {
  onInit?: () => Promise<void>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onDestroy?: () => Promise<void>;
}
```

## Registration Patterns

### Basic Registration

```typescript
// Simple service
registry.register("logger", {
  factory: () => new Logger(),
});

// With dependencies
registry.register("userRepo", {
  factory: (deps) => new UserRepository(deps.database, deps.logger),
  dependencies: ["database", "logger"],
});
```

### Class Registration

```typescript
@Service("emailService")
@Dependencies(["config", "logger"])
class EmailService {
  constructor(
    private config: Config,
    private logger: Logger,
  ) {}

  async send(email: Email) {
    // Implementation
  }
}

registry.registerClass(EmailService);
```

### Factory Pattern

```typescript
registry.register("cache", {
  factory: async (deps) => {
    const config = deps.config;

    if (config.cache.type === "redis") {
      return new RedisCache(config.redis);
    } else {
      return new MemoryCache();
    }
  },
  dependencies: ["config"],
});
```

## Dependency Injection

### Automatic Injection

```typescript
registry.register("app", {
  factory: (deps) => new Application(deps.database, deps.logger, deps.cache),
  dependencies: ["database", "logger", "cache"],
});

// All dependencies are automatically resolved
const app = await registry.get("app");
```

### Circular Dependencies

```typescript
// Registry detects circular dependencies
registry.register("serviceA", {
  dependencies: ["serviceB"],
  factory: (deps) => new ServiceA(deps.serviceB),
});

registry.register("serviceB", {
  dependencies: ["serviceA"], // Circular!
  factory: (deps) => new ServiceB(deps.serviceA),
});

// Throws: CircularDependencyError
```

### Optional Dependencies

```typescript
registry.register("service", {
  factory: (deps) =>
    new Service({
      logger: deps.logger,
      cache: deps.cache || new DefaultCache(),
    }),
  dependencies: ["logger"],
  optionalDependencies: ["cache"],
});
```

## Service Discovery

### Get Services

```typescript
// Get single service
const db = await registry.get("database");

// Get multiple services
const { database, logger } = await registry.getMany(["database", "logger"]);

// Get by interface
const services = registry.getByInterface(IPlugin);
```

### Service Queries

```typescript
// Find services by metadata
const httpServices = registry.query({
  metadata: { type: "http" },
});

// Find by tag
const criticalServices = registry.findByTag("critical");

// List all services
const allServices = registry.list();
```

## Lifecycle Management

### Service Lifecycle

```typescript
registry.register("websocket", {
  factory: () => new WebSocketService(),
  lifecycle: {
    onInit: async () => {
      console.log("Initializing WebSocket");
    },
    onStart: async () => {
      await websocket.connect();
    },
    onStop: async () => {
      await websocket.disconnect();
    },
    onDestroy: async () => {
      websocket.cleanup();
    },
  },
});

// Start service
await registry.start("websocket");

// Stop service
await registry.stop("websocket");

// Start all services
await registry.startAll();
```

### Service States

```typescript
// Get service state
const state = registry.getState("database");
// "uninitialized" | "initializing" | "ready" | "starting" | "running" | "stopping" | "stopped" | "error"

// Wait for service
await registry.waitForService("database", {
  timeout: 5000,
  state: "running",
});
```

## Scopes and Contexts

### Scoped Services

```typescript
// Create scoped registry
const scopedRegistry = registry.createScope("request");

// Register scoped service
scopedRegistry.register("requestContext", {
  factory: () => new RequestContext(),
  singleton: false, // New instance per scope
});

// Services in scope
const ctx = scopedRegistry.get("requestContext");
```

### Service Context

```typescript
registry.register("contextAware", {
  factory: (deps, context) => {
    console.log(`Creating service in ${context.scope}`);
    console.log(`Requested by ${context.caller}`);

    return new ContextAwareService({
      environment: context.environment,
      config: context.config,
    });
  },
});
```

## Health Monitoring

```typescript
registry.register("apiClient", {
  factory: () => new ApiClient(),
  healthCheck: async (service) => {
    const response = await service.ping();
    return {
      healthy: response.ok,
      message: response.statusText,
      metrics: {
        latency: response.time,
      },
    };
  },
  healthCheckInterval: 30000, // Check every 30s
});

// Get health status
const health = await registry.checkHealth("apiClient");

// Monitor all services
registry.on("health:check", (result) => {
  if (!result.healthy) {
    console.error(`Service ${result.service} is unhealthy`);
  }
});
```

## Testing Support

### Mock Services

```typescript
// Register mock for testing
registry.registerMock("database", {
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockResolvedValue({ id: 1 }),
});

// Use in tests
const service = await registry.get("userService");
// Uses mock database automatically
```

### Test Isolation

```typescript
import { ServiceRegistry } from "@brains/service-registry";

describe("MyService", () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = ServiceRegistry.createFresh();
    registry.register("myService", {
      factory: () => new MyService(),
    });
  });

  test("should work", async () => {
    const service = await registry.get("myService");
    expect(service).toBeDefined();
  });
});
```

## Service Decorators

```typescript
// TypeScript decorators
@Service({
  name: "userService",
  singleton: true,
})
@Dependencies(["database", "logger"])
@HealthCheck(async (service) => service.isHealthy())
class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}
}

// Auto-register decorated classes
registry.autoRegister([UserService]);
```

## Events

```typescript
registry.on("service:registered", (event) => {
  console.log(`Registered: ${event.name}`);
});

registry.on("service:created", (event) => {
  console.log(`Created instance: ${event.name}`);
});

registry.on("service:error", (event) => {
  console.error(`Error in ${event.name}:`, event.error);
});
```

## Configuration

```typescript
const registry = ServiceRegistry.getInstance({
  lazy: true, // Lazy load all services
  strictMode: true, // Throw on missing dependencies
  healthCheckInterval: 60000, // Global health check interval
  timeout: 5000, // Service initialization timeout
});
```

## Exports

- `ServiceRegistry` - Main registry class
- `ServiceDefinition` - Service definition interface
- `Service` - Service decorator
- `Dependencies` - Dependencies decorator
- Testing utilities and types

## License

MIT
