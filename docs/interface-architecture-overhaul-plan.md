# Interface Architecture Overhaul Plan (Phase 2.3)

## Overview

This document outlines a comprehensive plan to standardize and enhance the interface architecture in the Personal Brain system. Currently, interfaces lack the systematic architecture that plugins have, leading to inconsistencies and missed opportunities for code reuse.

## Current State Analysis

### Existing Interface Packages
- `interfaces/cli` - Command-line interface
- `interfaces/interface-core` - Base interface utilities and formatters
- `interfaces/matrix` - Matrix protocol interface (planned/in development)

### Current Issues
1. **No Interface Registry**: Interfaces are not systematically registered or managed
2. **Inconsistent Lifecycle**: No standardized initialization/shutdown patterns
3. **Ad-hoc Integration**: Each interface integrates with core differently
4. **Missing Context System**: No equivalent to PluginContext for interfaces
5. **Inconsistent Error Handling**: Each interface handles errors differently
6. **Unclear Architecture**: No clear distinction between interfaces and plugins

## Interface vs Plugin Philosophy

### Interfaces
- **Purpose**: User-facing interaction layers and external protocol adapters
- **Examples**: CLI, Matrix, Web UI, API endpoints
- **Characteristics**: 
  - Handle user input/output
  - Manage external protocol communication
  - Focus on presentation and interaction
  - Typically long-running services

### Plugins
- **Purpose**: Content processing and business logic extensions
- **Examples**: Directory sync, git sync, site builder, link capture
- **Characteristics**:
  - Process and transform data
  - Extend core functionality
  - Can be dynamically loaded/unloaded
  - Provide tools and resources

### Hybrid Approach
- Interfaces can load interface-specific plugins for extensibility
- Clear separation of concerns between presentation and logic

## Phase 2.3: Interface Architecture Standardization

### 2.3.1 Interface Registry System

#### Create `@brains/interface-registry` Package
```typescript
export interface InterfaceMetadata {
  name: string;
  version: string;
  description: string;
  protocols: string[]; // e.g., ['cli', 'matrix', 'http']
  dependencies: string[];
  capabilities: InterfaceCapability[];
}

export interface InterfaceRegistry {
  register(interfaceInstance: BaseInterface): Promise<void>;
  unregister(name: string): Promise<void>;
  get(name: string): BaseInterface | undefined;
  list(): InterfaceMetadata[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

#### Interface Discovery and Registration
- Automatic discovery of interface packages
- Configuration-based interface enabling/disabling
- Dependency resolution between interfaces

### 2.3.2 Interface Context Framework

#### Create `InterfaceContext` 
```typescript
export interface InterfaceContext {
  // Core service access
  shell: Shell;
  entityService: EntityService;
  messageBus: MessageBus;
  logger: Logger;
  
  // Interface-specific services
  interfaceRegistry: InterfaceRegistry;
  
  // Configuration and metadata
  config: Record<string, unknown>;
  metadata: InterfaceMetadata;
  
  // Communication helpers
  formatResponse(data: unknown, format?: string): string;
  validateInput(data: unknown, schema: ZodType): unknown;
  
  // Event handling
  on(event: string, handler: Function): void;
  emit(event: string, data: unknown): void;
}
```

#### Interface-Specific Capabilities
- Input validation and sanitization
- Output formatting and rendering
- Session management (for stateful interfaces)
- Authentication and authorization integration

### 2.3.3 Base Interface Class

#### Create `BaseInterface` in `@brains/utils`
```typescript
export abstract class BaseInterface {
  protected context: InterfaceContext;
  protected config: InterfaceConfig;
  protected logger: Logger;
  private state: InterfaceState = 'stopped';

  constructor(config: unknown, schema: ZodType<InterfaceConfig>) {
    this.config = this.validateConfig(config, schema);
  }

  // Lifecycle methods
  abstract initialize(context: InterfaceContext): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract shutdown(): Promise<void>;

  // Health monitoring
  abstract getHealth(): InterfaceHealth;
  
  // Configuration management
  protected validateConfig(config: unknown, schema: ZodType): InterfaceConfig;
  public updateConfig(config: Partial<InterfaceConfig>): Promise<void>;
  
  // Common utilities
  protected formatError(error: Error): string;
  protected logActivity(activity: string, data?: unknown): void;
}
```

#### Interface Configuration System
- Standardized configuration validation
- Environment-specific config support
- Hot-reload capabilities for development

### 2.3.4 Interface Manager

#### Implement `InterfaceManager` in Shell Core
```typescript
export class InterfaceManager {
  private interfaces = new Map<string, BaseInterface>();
  private registry: InterfaceRegistry;
  
  constructor(private shell: Shell) {
    this.registry = new InterfaceRegistryImpl();
  }

  async initialize(): Promise<void> {
    // Load interface configurations
    // Discover and register interfaces
    // Initialize in dependency order
  }

  async startInterface(name: string): Promise<void> {
    // Validate dependencies
    // Start interface with proper context
    // Monitor health
  }

  async stopInterface(name: string): Promise<void> {
    // Graceful shutdown
    // Clean up resources
    // Notify dependencies
  }

  async restartInterface(name: string): Promise<void> {
    // Stop, reinitialize, and start
    // Preserve state where possible
  }

  getInterfaceStatus(): InterfaceStatus[] {
    // Return health and status of all interfaces
  }
}
```

#### Interface Health Monitoring
- Periodic health checks
- Automatic restart on failure
- Interface dependency tracking
- Performance metrics collection

### 2.3.5 Interface Error Handling

#### Standardized Interface Error Classes
```typescript
export class InterfaceError extends BrainsError {
  constructor(
    interfaceName: string,
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>
  ) {
    super(
      `Interface error in ${interfaceName}: ${message}`,
      "INTERFACE_ERROR",
      normalizeError(cause),
      { interfaceName, ...context }
    );
  }
}

export class InterfaceInitializationError extends BrainsError {
  constructor(
    interfaceName: string,
    reason: string,
    cause: ErrorCause,
    context?: Record<string, unknown>
  ) {
    super(
      `Interface initialization failed for ${interfaceName}: ${reason}`,
      "INTERFACE_INITIALIZATION_ERROR",
      normalizeError(cause),
      { interfaceName, reason, ...context }
    );
  }
}

export class InterfaceProtocolError extends BrainsError {
  constructor(
    interfaceName: string,
    protocol: string,
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>
  ) {
    super(
      `Protocol error in ${interfaceName} (${protocol}): ${message}`,
      "INTERFACE_PROTOCOL_ERROR",
      normalizeError(cause),
      { interfaceName, protocol, ...context }
    );
  }
}
```

#### Error Recovery Patterns
- Graceful degradation strategies
- Retry mechanisms with exponential backoff
- Circuit breaker patterns for external protocols
- Error reporting to core system

### 2.3.6 Interface Configuration System

#### Unified Configuration Schema
```typescript
export const interfaceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(true),
  healthCheck: z.object({
    interval: z.number().default(30000),
    timeout: z.number().default(5000),
    retries: z.number().default(3),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('text'),
  }),
  // Interface-specific config extends this base
});
```

#### Environment Configuration
- Development vs production configurations
- Environment variable overrides
- Secrets management integration

## Implementation Plan

### Phase 2.3.1: Foundation (Week 1)
1. Create `@brains/interface-registry` package
2. Implement `BaseInterface` class in `@brains/utils`
3. Define `InterfaceContext` and related types
4. Create standardized interface error classes

### Phase 2.3.2: Core Integration (Week 2)
1. Implement `InterfaceManager` in shell core
2. Create interface discovery and registration system
3. Add interface lifecycle management
4. Integrate with shell initialization

### Phase 2.3.3: Interface Migration (Week 3)
1. Migrate `interfaces/cli` to new architecture
2. Migrate `interfaces/interface-core` to new architecture
3. Update any matrix interface code to new patterns
4. Add comprehensive error handling to all interfaces

### Phase 2.3.4: Testing and Documentation (Week 4)
1. Add comprehensive tests for interface architecture
2. Update integration tests
3. Create interface development guide
4. Document interface vs plugin decision framework

## Benefits

### For Developers
- **Consistent Patterns**: Same patterns across all interfaces
- **Reduced Boilerplate**: BaseInterface handles common concerns
- **Better Testing**: Standardized testing patterns
- **Clear Architecture**: Well-defined boundaries and responsibilities

### For System
- **Reliability**: Health monitoring and automatic recovery
- **Scalability**: Easy to add new interfaces
- **Maintainability**: Centralized interface management
- **Debuggability**: Consistent error handling and logging

### For Users
- **Stability**: More reliable interface behavior
- **Performance**: Optimized interface lifecycle management
- **Features**: Rich interface capabilities and formatting

## Migration Strategy

### Backward Compatibility
- Existing interfaces continue to work during migration
- Gradual migration with parallel systems
- Clear deprecation timeline

### Risk Mitigation
- Feature flags for new interface system
- Rollback mechanisms
- Comprehensive testing before deployment

## Success Metrics

1. **Code Quality**: Reduced duplication across interfaces
2. **Reliability**: Decreased interface-related errors
3. **Performance**: Improved interface startup and response times
4. **Developer Experience**: Faster interface development
5. **Test Coverage**: >90% coverage for interface architecture

## Next Steps

1. Review and approve this plan
2. Create implementation timeline
3. Begin Phase 2.3.1 implementation
4. Regular progress reviews and adjustments

---

This plan provides a solid foundation for creating a robust, scalable interface architecture that complements our existing plugin system while maintaining clear separation of concerns.