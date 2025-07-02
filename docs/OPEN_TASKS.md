# Open Tasks and TODOs

This document consolidates all open tasks and TODOs from the Personal Brain Rebuild project documentation.

Last Updated: 2025-07-02

## High Priority Tasks

### 1. Core Plugin Implementation (First Priority)

- **Link Plugin** (docs/link-plugin-plan.md) - Web content capture with AI processing
- **Article Plugin** (docs/article-plugin-plan.md) - Long-form content support

### 2. Interface Completion

- [x] ~~Remove deprecated BaseInterface code~~ ✅ Completed
- [x] ~~Implement interfaces as plugins~~ ✅ All interfaces now extend InterfacePlugin or MessageInterfacePlugin
- [ ] Complete full CLI interface implementation with Ink (beyond basic functionality)
- [ ] Update interface documentation

### 3. Content Generation Integration

From docs/content-generation-integration-plan.md:

- [ ] Update `generate_content` MCP tool to support `save` parameter
- [ ] Implement `deriveEntity` method on EntityService
- [ ] Add content management tools (list, promote, preview, regenerate)
- [ ] Update QueryProcessor to exclude generated-content from searches
- [ ] Implement generated-content entity type

## Medium Priority Tasks

### 1. Architecture Cleanup

From docs/cleanup-inventory.md:

- [ ] Phase 2: Architecture improvements (messaging patterns, error handling)
- [ ] Phase 3: Developer experience (config validation, templates)
- [ ] Phase 4: Stability and monitoring

From docs/shell-refactoring-inventory.md:

- [x] ~~Phase 0.1-0.6: Service package extractions~~ ✅ Completed (reduced shell from ~3,400 to ~1,900 lines)
- [x] ~~Phase 0.7: 4-directory monorepo structure~~ ✅ Completed
- [x] ~~Phase 0.8: Types package decoupling~~ ✅ Completed
- [x] ~~Phase 1: Shell package decomposition~~ ✅ Completed (no files exceed 300 lines)
- [x] ~~Phase 2.1: Component Interface Standardization~~ ✅ Completed
- [x] ~~Phase 2.2.1: Shell package error handling~~ ✅ Completed
- [ ] Phase 2.2.3: Interface and plugin error handling

### 2. Async Embedding Queue

From docs/async-embedding-queue-plan.md:

- [ ] Implement async embedding queue with box pattern
- [ ] Create background worker for queue processing
- [ ] Add retry logic for failed embeddings
- [ ] Implement progress tracking for bulk imports
- [ ] Add queue status monitoring

### 3. Service Extraction

From docs/entity-service-extraction-plan.md:

- [ ] Extract EntityService to separate package
- [ ] Enhance PublicEntityService interface
- [ ] Update directory-sync plugin compatibility

### 4. Plugin Architecture Improvements

From docs/plugin-architecture-refactoring-plan.md:

- [ ] Phase 1: Standardize existing plugins
- [ ] Phase 2: Enhance base abstractions (ContentGeneratingPlugin, builders)
- [ ] Phase 3: Refactor existing plugins to use new patterns
- [ ] Phase 4: Developer experience improvements

### 5. Content Generation Refactoring

From docs/content-generation-refactor-plan.md (Phase 1 ✅ completed):

- [ ] Phase 2: AI service abstraction
- [ ] Phase 3: Template integration
- [ ] Phase 4: Query processor consolidation
- [ ] Phase 5: Shell simplification
- [ ] Phase 6: Plugin development patterns
- [ ] Phase 7: Developer documentation

## Lower Priority Tasks

### 1. Package Improvements

From docs/app-package-plan.md:

- [ ] Create unified App package for easier initialization

From docs/base-entity-package-plan.md:

- [ ] Extract base entity to separate package

### 2. Deployment Enhancements

From docs/deployment-integration-plan.md:

- [ ] Integrate Docker deployment with brain commands

From docs/streamable-http-implementation-plan.md:

- [ ] Migrate to StreamableHTTP transport

From docs/native-modules-build-plan.md:

- [ ] Implement native module build strategy

## Completed Tasks ✅

The following have been completed but were listed as open in various documents:

### Architecture & Refactoring

- 4-directory monorepo structure (shell/, shared/, plugins/, interfaces/, apps/)
- Shell package reduced by 44% (from ~3,400 to ~1,900 lines)
- 8 new service packages extracted:
  - @brains/ai-service
  - @brains/embedding-service
  - @brains/messaging-service
  - @brains/service-registry
  - @brains/view-registry
  - @brains/entity-service
  - @brains/content-generator
  - @brains/app
- Types package decoupled to individual packages
- Component Interface Standardization pattern implemented
- Shell package error handling standardized

### Interface Implementation

- BaseInterface and interface-core removal
- All interfaces implemented as plugins:
  - CLI Interface (MessageInterfacePlugin)
  - Matrix Interface (MessageInterfacePlugin)
  - MCP Interface (InterfacePlugin)
  - Webserver Interface (InterfacePlugin)
- MCP Plugin Tool Registration with plugin-specific message types
- Progress callback support for long-running operations

### Plugin System

- Plugin base classes (BasePlugin, InterfacePlugin, MessageInterfacePlugin)
- Directory-sync plugin (file-based entity sync)
- Git-sync plugin (version control integration)
- Site-builder plugin (static site generation with Preact)
- Default-site-content package (templates and formatters)

## Documentation Updates Needed

### Immediate Updates

1. **docs/architecture-overview.md**
   - Update package structure with 4-directory layout
   - Remove "Future Packages" section (CLI and Matrix are implemented)
   - Update implementation priorities
   - Document new service packages

2. **docs/architecture/package-structure.md**
   - Document the new 4-directory structure
   - List all packages in their correct locations
   - Update package descriptions

3. **docs/plugin-system.md**
   - Add references to @brains/plugin-utils base classes
   - Update examples with real plugins

### Archive

1. **docs/turborepo-setup.md** - Outdated, setup already complete
2. Completed refactoring plans that are fully implemented

## Implementation Order Recommendation

1. **Link Plugin** - Core feature, high user value
2. **Article Plugin** - Build on content patterns
3. **Content Generation Integration** - Complete remaining features
4. **CLI Interface Enhancement** - Full Ink implementation
5. **Cross-Package Error Handling** - Complete Phase 2.2.3
6. **Async Embedding Queue** - Enable non-blocking imports for large content libraries
7. **Additional Entity Plugins** - Task, Profile, Project plugins
8. **Service Extractions** - EntityService package extraction
9. **Architecture Documentation Updates** - Reflect current state

## Notes

- Shell refactoring is complete with 44% reduction in complexity
- All interfaces are now implemented as plugins
- Core functionality is solid and well-tested
- Focus should shift to user-facing entity plugins (Link, Article, Task)
- Architecture is clean and extensible with the new 4-directory structure
- Cross-package error handling is the main remaining architectural task
