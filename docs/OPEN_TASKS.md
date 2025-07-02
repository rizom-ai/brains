# Open Tasks and TODOs

This document consolidates all open tasks and TODOs from the Personal Brain Rebuild project documentation as of 2025-07-02.

## High Priority Tasks

### 1. Interface Completion (First Priority)

- [x] ~~Remove deprecated BaseInterface code~~ ✅ Already removed
- [ ] Complete full CLI interface implementation with Ink (beyond basic functionality)
- [ ] Enhance Matrix interface features from original plan
- [ ] Update interface documentation

### 2. Core Plugin Implementation

- **Link Plugin** (docs/link-plugin-plan.md) - Web content capture with AI processing
- **Article Plugin** (docs/article-plugin-plan.md) - Long-form content support

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

- BaseInterface and interface-core removal
- MCP Plugin Tool Registration with plugin-specific message types
- Progress callback support for long-running operations
- Matrix Interface Migration to MessageInterfacePlugin
- Webserver Interface Migration to InterfacePlugin
- Plugin base classes (BasePlugin, InterfacePlugin, MessageInterfacePlugin)
- ContentGenerator package creation (Phase 1)
- Directory-sync and git-sync as separate plugins

## Documentation Updates Needed

### Immediate Updates

1. **docs/architecture-overview.md**
   - Update "Future Packages" section (CLI and Matrix are implemented)
   - Update implementation priorities
   - Clarify interface plugin architecture

2. **docs/plugin-system.md**
   - Add references to @brains/plugin-utils base classes
   - Update examples with real plugins

### Status Updates

1. **docs/shell-refactoring-inventory.md** - Mark completed phases
2. **docs/content-generation-refactor-plan.md** - Mark Phase 1 as completed
3. **docs/interface-architecture-overhaul-plan.md** - Update migration status

### Archive

1. **docs/turborepo-setup.md** - Outdated, setup already complete

## Implementation Order Recommendation

1. **Link Plugin** - Core feature, high user value
2. **Article Plugin** - Build on content patterns
3. **Content Generation Integration** - Complete remaining features
4. **Async Embedding Queue** - Enable non-blocking imports for large content libraries
5. **Architecture Cleanup** - Improve stability and developer experience
6. **Service Extractions** - Clean architecture for scalability
7. **Interface Enhancements** - Polish user experience

## Notes

- Many plans are partially implemented but not fully extracted into the planned structure
- The core functionality works, but architectural improvements would enhance maintainability
- Focus on user-facing features (plugins) before internal refactoring
