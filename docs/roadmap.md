# Brains Project Roadmap

Last Updated: 2025-11-25

## Vision

Build a robust, extensible knowledge management platform that serves as the foundation for individual, team, and collective products.

## Next Priority Items

Based on current progress, the following items are ready to be worked on:

### Immediate Priorities

1. **Performance Optimization** - Batch operations, vector search improvements
2. **Additional Testing** - Integration tests, E2E tests
3. **Database Backup/Restore** - Data safety
4. **Health Checks for All Services** - Production readiness

### Secondary Priorities

5. **Roadmap Plugin** - Outcome-based goal tracking with milestone management
6. **UI Component Library Expansion** - Additional reusable components

## Current Status

### Completed ✅

- **Core Architecture**: Shell-based plugin system with direct registration
- **MCP Integration**: Full MCP server with stdio and HTTP transports
- **Plugin System**: Four plugin types (Core, Service, Interface, MessageInterface)
- **Entity Framework**: Functional entity model with Zod schemas and adapters
- **Conversation Memory**: Conversation tracking and message storage
- **Job Queue**: Background processing with progress tracking and batch operations
- **Content Generation**: Template-based content generation with AI integration
- **Test Infrastructure**: Standardized test harnesses for all plugin types (220+ test files)
- **Centralized Permission System**: Single source of truth for user permissions across all interfaces
- **Transport-based MCP Permissions**: Automatic permission levels based on MCP transport type
- **Database Migration System**: Drizzle-based migrations for all databases
- **Separate Databases**: Entity, Job Queue, and Conversation databases separated
- **Structured Logging**: Logger with multiple levels and context support
- **App Package**: Astro-style configuration with defineConfig and handleCLI
- **Directory Sync Plugin**: Import/export entities to/from file system
- **Git Sync Plugin**: Sync entities with Git repositories
- **Site Builder Plugin**: Static site generation with Preact components and Tailwind CSS v4
- **Topics Plugin**: AI-powered topic extraction from entities
- **System Plugin**: System information and health checks
- **Link Plugin**: Web content capture with AI extraction and search ✅
- **Summary Plugin**: AI-powered content summarization and daily digests
- **Template Capabilities System**: Runtime detection of template capabilities
- **Dynamic Route Generation**: Convention-based routes for entity types
- **Entity DataSource Integration**: Plugin-specific DataSources for entity display
- **Site Content Consolidation**: Removed preview/production distinction
- **Docker Deployment**: Simplified Docker deployment with Dockerfile.simple
- **Hetzner Cloud Provider**: Terraform-based deployment with automatic HTTPS via Caddy
- **Team-Brain App**: Created separate app instance with custom configuration
- **Matrix Bot Display Names**: Fixed to show app-specific names instead of "Personal Brain"
- **Deployment Idempotency**: Improved deployment scripts to handle existing infrastructure
- **Blog Plugin**: Long-form content with RSS feeds and series support
- **Decks Plugin**: Slide deck and presentation management
- **Type-safe Entity Metadata**: Strongly-typed metadata with backward compatibility
- **Code Quality**: Zero ESLint warnings, no `as any` type assertions
- **UI Library Components**: Reusable Preact components (Head, ContentSection, etc.)

### In Progress 🚧

- **Documentation**: Updating docs to reflect current architecture

## Phase 1: Production Readiness (Q1 2025)

### 1.1 Database Architecture

- [x] Separate job queue database from entity database ✅
- [x] Implement database migration system ✅
- [ ] Add database backup/restore capabilities

### 1.2 Performance & Scalability

- [x] Batch operations for job queue ✅
- [ ] **Batch operations for entity service** (Not started)
- [x] Async embedding generation queue ✅
- [ ] **Optimize vector search performance** (Basic implementation exists)

### 1.3 Monitoring & Observability

- [x] Structured logging with log levels ✅
- [x] Health check endpoints for MCP service ✅
- [ ] **Health check endpoints for all services** (Not implemented)
- [ ] **Metrics collection and reporting** (Not started)

### 1.4 App Package Refactoring

- [x] Refactor shell/app package for cleaner initialization ✅
- [x] Separate concerns between app orchestration and shell core ✅
- [x] Improve plugin initialization flow ✅
- [x] Add proper lifecycle management ✅

### 1.5 Interface Consolidation

- [x] Merge matrix-setup functionality into main matrix interface package ✅
- [x] Consolidate setup utilities with main interface code ✅
- [x] Provide setup as a built-in command/utility within the interface ✅

## Phase 2: First Plugins (Q1-Q2 2025)

### 2.1 Link Plugin ✅ **COMPLETED**

- [x] Web content capture with AI extraction ✅
- [x] Structured content storage (like topics plugin) ✅
- [x] AI-powered summarization and tagging ✅
- [x] Simple list and search functionality ✅

### 2.2 Blog Plugin ✅ **COMPLETED**

- [x] Long-form content management ✅
- [x] Draft/publish workflow ✅
- [x] RSS feed generation ✅
- [x] Series support for multi-part content ✅

### 2.3 Decks Plugin ✅ **COMPLETED**

- [x] Slide deck and presentation management ✅
- [x] Markdown-based slides ✅
- [x] Detail page templates ✅

### 2.4 Roadmap Plugin - **Not Started**

- [ ] Outcome-based goal tracking
- [ ] Milestone management
- [ ] Evidence linking to entities
- [ ] Progress visualization

## Phase 3: Enhanced Interfaces (Q2 2025) - **Not Started**

### 3.1 Web UI

- [ ] React-based web interface
- [ ] Real-time updates via WebSocket
- [ ] Visual entity browser
- [ ] Search and filter capabilities

### 3.2 Mobile Support

- [ ] Progressive Web App (PWA)
- [ ] Offline capability
- [ ] Mobile-optimized UI

### 3.3 API Expansion

- [ ] GraphQL API
- [ ] REST API v2
- [ ] Webhook support

## Phase 4: Team Features (Q3 2025)

### 4.1 Multi-user Support

- [x] Centralized permission system ✅
- [ ] **User authentication and authorization** (Not started)
- [ ] **Role-based access control** (Permission levels exist, no roles)
- [ ] **Personal and shared workspaces** (Not implemented)

### 4.2 Collaboration

- [ ] Real-time collaboration
- [ ] Comments and annotations
- [ ] Activity feeds

### 4.3 Team Brain

- [ ] Shared knowledge base
- [ ] Team-specific plugins
- [ ] Integration with team tools (Slack, Teams)

## Phase 5: AI Enhancement (Q3-Q4 2025)

### 5.1 Advanced AI Features

- [ ] Custom AI model fine-tuning
- [ ] Multi-modal support (images, audio)
- [ ] AI-powered insights and recommendations

### 5.2 Automation

- [ ] Workflow automation
- [ ] Smart notifications
- [ ] Predictive task creation

## Technical Debt & Maintenance

### Ongoing

- [ ] Security audits
- [ ] Performance monitoring
- [ ] Dependency updates
- [ ] Documentation improvements
- [ ] Test coverage expansion

## Success Metrics

1. **Reliability**: 99.9% uptime for production deployments
2. **Performance**: <100ms response time for queries
3. **Adoption**: Active community of plugin developers
4. **Quality**: >80% test coverage across all packages

## Future Considerations

- **Collective Brain**: Community-driven knowledge bases
- **Federation**: Decentralized brain networks
- **AI Agents**: Autonomous knowledge workers
- **Enterprise Features**: SSO, audit logs, compliance

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to contribute to the project.
