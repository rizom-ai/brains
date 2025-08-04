# Brains Project Roadmap

Last Updated: 2025-08-04

## Vision

Build a robust, extensible knowledge management platform that serves as the foundation for individual, team, and collective products.

## Strategic Focus

The roadmap prioritizes:

1. **Clean Architecture** - Complete and consistent core abstractions
2. **Developer Experience** - Make plugin development straightforward
3. **Deployment Excellence** - Simple installation and configuration

## Phase 1: Core Architecture Cleanup (Immediate)

### 1.1 Service Abstraction Completion

**Goal**: Extract QueryProcessor interface to complete service abstraction pattern

**Tasks**:

- [ ] Create IQueryProcessor interface in shell/core
- [ ] Move implementation to concrete class
- [ ] Update all imports to use interface with dependency injection
- [ ] Ensure consistent with other service patterns (EntityService, AIService, etc.)
- [ ] Update tests to use interface and enable mocking

**Why**: QueryProcessor is the only remaining service without an interface. Completing this ensures API stability and enables alternative implementations.

### 1.2 Plugin System Documentation and Cleanup

**Goal**: Ensure plugin system is consistent, clean, and well-documented

**Tasks**:

- [ ] Audit existing plugin base classes (BasePlugin, InterfacePlugin, MessageInterfacePlugin, ServicePlugin, CorePlugin)
- [ ] Document all plugin lifecycle methods clearly in plugins package README
- [ ] Standardize plugin registration patterns
- [ ] Create plugin type definition reference
- [ ] Ensure error handling is consistent across all plugin types
- [ ] Review and improve plugin test harnesses
- [ ] Document plugin dependencies and inter-plugin communication
- [ ] Update existing plugins to follow best practices:
  - [ ] directory-sync - Add better configuration options and error handling
  - [ ] git-sync - Improve conflict resolution and branch management
  - [ ] site-builder - Better template system and build performance

**Why**: A clean, well-documented plugin system is prerequisite for external developers to build plugins effectively.

### 1.3 Database Architecture

**Goal**: Separate job queue database for better data portability and performance

**Tasks**:

- [ ] Create separate SQLite database file for job queue
- [ ] Update JobQueueService to use dedicated connection
- [ ] Update configuration to support multiple database paths
- [ ] Migrate existing job data if needed
- [ ] Update tests to work with separate databases
- [ ] Ensure clean separation between entity and job data

**Why**: Data portability is crucial for deployment flexibility. Separating transient job data from persistent entity data enables better backup strategies and scaling options.

## Phase 2: Developer Experience

### 2.1 Plugin Scaffolding CLI

**Goal**: Enable developers to quickly create new plugins with proper structure

**Command**: `bunx create-brains-plugin`

**Features**:

- [ ] Interactive prompt for plugin type selection
- [ ] Generate appropriate base class extension
- [ ] Include TypeScript configuration
- [ ] Set up test harness with examples
- [ ] Generate package.json with correct dependencies
- [ ] Create README template with usage instructions
- [ ] Include example MCP tool registrations for relevant plugin types

**Plugin Types to Support**:

- Entity plugins (for new content types)
- Service plugins (for new capabilities)
- Interface plugins (for new interaction methods)
- Message Interface plugins (for chat-like interfaces)
- Core plugins (for system-level functionality)

### 2.2 Reference Entity Plugins

**Goal**: Provide high-quality examples of entity plugin development

**Implementation**: Build 2-3 entity plugins that best demonstrate system capabilities

**Requirements for Each**:

- Clean schema definition using Zod
- Proper entity adapter implementation
- MCP tool registration with clear tool descriptions
- Comprehensive tests
- Usage documentation
- Example queries and workflows

### 2.3 Documentation

**Goal**: Comprehensive guides for plugin developers

**Documents to Create**:

- [ ] Plugin Development Guide - Step-by-step tutorial
- [ ] Plugin API Reference - Complete API documentation
- [ ] Plugin Patterns - Common patterns and best practices
- [ ] Testing Guide - How to test plugins effectively

## Phase 3: Deployment & Distribution

### 3.1 Installation Simplification

**Goal**: Single-command setup with configuration wizard

**Command**: `bunx create-brains-app`

**Features**:

- [ ] Generate new project from scratch
- [ ] Interactive configuration wizard
- [ ] Plugin selection during setup
- [ ] Environment variable configuration
- [ ] Database initialization
- [ ] Generate appropriate app.ts with selected plugins
- [ ] Create deployment configuration files

### 3.2 Binary Distribution

**Goal**: Standalone executables using Bun's compilation

**Tasks**:

- [ ] Create build scripts for each platform (Linux, macOS, Windows)
- [ ] Handle native dependencies (SQLite, embeddings)
- [ ] Include selected plugins in binary
- [ ] Create installation packages (.deb, .pkg, .msi)
- [ ] Set up CI/CD for automated builds
- [ ] Document external update process

### 3.3 Deployment Improvements

**Goal**: Production-ready deployment options

**Tasks**:

- [ ] Improve Docker setup (single Dockerfile, better layer caching)
- [ ] Create docker-compose templates for common scenarios
- [ ] Improve systemd service templates
- [ ] Create cloud deployment guides for VMs (AWS EC2, GCP Compute, Azure VMs, Hetzner)
- [ ] Add health check endpoints
- [ ] Implement backup and restore tools
- [ ] Add monitoring and observability hooks

## Immediate Next Steps (Priority Order)

1. **QueryProcessor interface extraction**
   - Complete the service abstraction pattern
2. **Plugin system cleanup and documentation**
   - Ensure consistency before enabling external development
   - Update existing plugins to best practices
3. **Job queue database separation**
   - Core architectural change enabling better data management
4. **Plugin scaffolding CLI**
   - Enable rapid plugin development
5. **Build reference entity plugins**
   - Demonstrate system capabilities and patterns

## Success Metrics

### Phase 1 Success

- [ ] All core services have interfaces with dependency injection
- [ ] Plugin system documentation is complete in plugins package README
- [ ] All existing plugins follow consistent patterns
- [ ] Job queue runs on separate database

### Phase 2 Success

- [ ] Plugin scaffolding CLI generates working plugins
- [ ] 2-3 high-quality reference plugins implemented
- [ ] Developer can create basic plugin in < 30 minutes
- [ ] Plugin development guide published

### Phase 3 Success

- [ ] New user can install and run Brains in < 5 minutes
- [ ] Binary distributions available for major platforms
- [ ] Production deployment guide with best practices
- [ ] Automated build and release pipeline

## Implementation Notes

### Technology Choices

- **Runtime**: Bun (for performance and built-in tooling)
- **Database**: SQLite with libSQL for vectors
- **Monorepo**: Turborepo for build orchestration
- **Testing**: Bun test with custom harnesses
- **CI/CD**: GitHub Actions

### Architecture Principles

- **Plugin-first**: Everything possible should be a plugin
- **Interface-driven**: All services behind interfaces
- **Type-safe**: Zod schemas for all data validation
- **Testable**: Comprehensive test coverage with good harnesses
- **Observable**: Structured logging and metrics hooks

### Development Workflow

1. Implement feature in isolation
2. Add comprehensive tests
3. Update relevant documentation
4. Ensure backwards compatibility
5. Update CHANGELOG if needed

## Related Documents

- `/docs/link-plugin-plan.md` - Detailed plan for Link plugin
- `/docs/article-plugin-plan.md` - Detailed plan for Article plugin
- `/docs/OPEN_TASKS.md` - Complete list of all open tasks
- `/docs/plugin-system.md` - Current plugin system documentation
- `/docs/architecture-overview.md` - System architecture overview
