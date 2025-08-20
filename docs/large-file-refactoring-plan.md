# Large File Refactoring Plan

## Overview

This document outlines the strategy for refactoring large TypeScript files (>500 lines) in the codebase to improve maintainability, testability, and developer experience.

## Current State Analysis

### Files Requiring Refactoring (by size)

| File                                               | Lines | Current Responsibilities                                 | Complexity |
| -------------------------------------------------- | ----- | -------------------------------------------------------- | ---------- |
| `plugins/directory-sync/src/lib/directory-sync.ts` | 927   | File sync, watching, batch operations, import/export     | High       |
| `shell/core/src/shell.ts`                          | 754   | Service orchestration, initialization, plugin management | High       |
| `shell/entity-service/src/entityService.ts`        | 726   | CRUD, search, serialization, validation                  | High       |
| `plugins/site-builder/src/plugin.ts`               | 568   | Site building, template registration, tools              | Medium     |
| `shell/plugins/src/manager/pluginManager.ts`       | 554   | Plugin lifecycle, registration, discovery                | Medium     |
| `shell/job-queue/src/job-queue-service.ts`         | 550   | Job management, queue operations, batch handling         | Medium     |

## Refactoring Strategy

### 1. Directory Sync Refactoring (Priority: HIGH)

**Current Structure:**

```
directory-sync.ts (927 lines)
└── All functionality in single class
```

**Proposed Structure:**

```
lib/
├── directory-sync.ts (~250 lines)      # Core DirectorySync class
├── file-operations.ts (~200 lines)     # File I/O operations
├── batch-operations.ts (~150 lines)    # Batch operation handling
├── file-watcher.ts (~150 lines)        # Chokidar integration
├── sync-status.ts (~100 lines)         # Status tracking
└── types.ts (~75 lines)                # Shared types
```

**Implementation Plan:**

#### Phase 1: Extract File Watcher

```typescript
// file-watcher.ts
export class FileWatcher {
  private watcher?: FSWatcher;
  private watchCallback?: (event: string, path: string) => void;

  async start(syncPath: string, options: WatchOptions): Promise<void>;
  stop(): void;
  setCallback(callback: (event: string, path: string) => void): void;
  private handleFileChange(path: string): Promise<void>;
  private handleFileAdd(path: string): Promise<void>;
  private handleFileUnlink(path: string): Promise<void>;
}
```

#### Phase 2: Extract Batch Operations

```typescript
// batch-operations.ts
export class BatchOperationsManager {
  prepareBatchOperations(
    entityTypes: string[],
    files: string[],
  ): BatchOperationResult;

  queueSyncBatch(
    context: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
  ): Promise<BatchResult | null>;

  private createExportOperations(entityTypes: string[]): BatchOperation[];
  private createImportOperations(files: string[]): BatchOperation[];
}
```

#### Phase 3: Extract File Operations

```typescript
// file-operations.ts
export class FileOperations {
  async readEntity(filePath: string): Promise<RawEntity>;
  async writeEntity(entity: BaseEntity, syncPath: string): Promise<void>;
  getEntityFilePath(entity: BaseEntity, syncPath: string): string;
  getAllMarkdownFiles(syncPath: string): string[];
  async ensureDirectoryStructure(syncPath: string): Promise<void>;
  private calculateContentHash(content: string): string;
}
```

### 2. Shell Refactoring (Priority: HIGH)

**Current Structure:**

```
shell.ts (754 lines)
└── Monolithic Shell class
```

**Proposed Structure:**

```
core/
├── shell.ts (~250 lines)               # Core Shell class
├── shell-factory.ts (~150 lines)       # Factory methods
├── service-container.ts (~200 lines)   # Service management
└── plugin-coordinator.ts (~150 lines)  # Plugin coordination
```

**Implementation Plan:**

#### Phase 1: Extract Service Container

```typescript
// service-container.ts
export class ServiceContainer {
  private services: Map<string, any>;

  register<T>(name: string, service: T): void;
  get<T>(name: string): T;
  getEntityService(): EntityService;
  getConversationService(): IConversationService;
  // ... other getters
}
```

#### Phase 2: Extract Factory Methods

```typescript
// shell-factory.ts
export class ShellFactory {
  static async create(config: ShellConfig): Promise<Shell>;
  static getInstance(): Shell;
  static resetInstance(): void;
  static createFresh(config: ShellConfig): Shell;
  private static initializeServices(config: ShellConfig): ServiceContainer;
  private static initializePlugins(shell: Shell): Promise<void>;
}
```

### 3. Entity Service Refactoring (Priority: MEDIUM)

**Current Structure:**

```
entityService.ts (726 lines)
└── All entity operations in single class
```

**Proposed Structure:**

```
entity-service/
├── entity-service.ts (~250 lines)      # Core service
├── entity-search.ts (~200 lines)       # Search functionality
├── entity-serializer.ts (~150 lines)   # Serialization
├── entity-validator.ts (~75 lines)     # Validation
└── entity-queries.ts (~100 lines)      # Query building
```

## Migration Strategy

### Phase-Based Approach

1. **Phase 1: File Extraction (No API Changes)**
   - Extract helper classes/functions
   - Keep public API unchanged
   - Update imports internally

2. **Phase 2: Interface Definition**
   - Define clear interfaces between modules
   - Add comprehensive JSDoc
   - Create integration tests

3. **Phase 3: Optimization**
   - Remove duplicate code
   - Optimize module boundaries
   - Performance improvements

### Risk Mitigation

1. **Testing Strategy**
   - Write integration tests before refactoring
   - Maintain 100% test coverage during refactoring
   - Use snapshot testing for large outputs

2. **Backward Compatibility**
   - Keep all public APIs unchanged
   - Use facade pattern where needed
   - Deprecate old methods gradually

3. **Rollback Plan**
   - Create feature branches for each refactoring
   - Tag releases before major changes
   - Keep old implementations until new ones are stable

## Implementation Timeline

### Week 1-2: Directory Sync

- [ ] Extract FileWatcher class
- [ ] Extract BatchOperationsManager
- [ ] Extract FileOperations
- [ ] Update tests and documentation

### Week 3-4: Shell

- [ ] Extract ServiceContainer
- [ ] Extract ShellFactory
- [ ] Extract PluginCoordinator
- [ ] Update tests and documentation

### Week 5: Entity Service

- [ ] Extract EntitySearch
- [ ] Extract EntitySerializer
- [ ] Extract EntityValidator
- [ ] Update tests and documentation

### Week 6: Other Large Files

- [ ] Refactor site-builder plugin
- [ ] Refactor plugin manager
- [ ] Refactor job queue service

## Success Metrics

1. **Code Quality**
   - No file exceeds 400 lines
   - Each class has single responsibility
   - Cyclomatic complexity < 10 per method

2. **Maintainability**
   - Improved test coverage (>90%)
   - Reduced coupling between modules
   - Clear module boundaries

3. **Performance**
   - No regression in performance benchmarks
   - Improved memory usage
   - Faster test execution

## Testing Strategy

### Unit Tests

Each extracted module should have:

- Isolated unit tests
- Mock dependencies
- Edge case coverage

### Integration Tests

- Test interactions between split modules
- Ensure backward compatibility
- Test file system operations

### Example Test Structure

```typescript
describe("FileWatcher", () => {
  let watcher: FileWatcher;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    watcher = new FileWatcher();
    mockCallback = jest.fn();
  });

  describe("start", () => {
    it("should initialize watcher with correct path", async () => {
      // Test implementation
    });
  });
});
```

## Code Style Guidelines

### File Organization

```typescript
// 1. Imports
import { external } from "package";
import { internal } from "../module";

// 2. Types/Interfaces
export interface ModuleOptions {
  // ...
}

// 3. Constants
const DEFAULT_TIMEOUT = 5000;

// 4. Main Class/Function
export class Module {
  // ...
}

// 5. Helper Functions
function helperFunction() {
  // ...
}
```

### Naming Conventions

- Classes: PascalCase (e.g., `FileWatcher`)
- Files: kebab-case (e.g., `file-watcher.ts`)
- Interfaces: Prefix with 'I' for contracts (e.g., `IFileWatcher`)
- Types: PascalCase (e.g., `WatchOptions`)

## Review Checklist

Before completing each refactoring:

- [ ] All tests pass
- [ ] No breaking API changes
- [ ] Documentation updated
- [ ] Type safety maintained
- [ ] Performance benchmarks pass
- [ ] Code review completed
- [ ] Integration tests added

## Appendix: Detailed File Analysis

### Directory Sync Methods Distribution

- File Operations: 5 methods (~200 lines)
- Batch Operations: 2 methods (~150 lines)
- File Watching: 4 methods (~150 lines)
- Import/Export: 4 methods (~250 lines)
- Status/Utils: 3 methods (~100 lines)
- Initialization: 3 methods (~77 lines)

### Shell Methods Distribution

- Service Getters: 15 methods (~100 lines)
- Factory Methods: 4 static methods (~200 lines)
- Plugin Management: 3 methods (~100 lines)
- Context Building: 2 methods (~200 lines)
- Initialization: Constructor + init (~154 lines)

### Entity Service Methods Distribution

- CRUD Operations: 8 methods (~250 lines)
- Search/Query: 5 methods (~200 lines)
- Serialization: 4 methods (~150 lines)
- Validation: 3 methods (~75 lines)
- Utils: 4 methods (~51 lines)
