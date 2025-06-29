# Directory Structure Guide

This document provides an overview of the recommended directory structure for the Personal Brain Rebuild project.

## Overview

The project follows a modular structure with clear separation between the core shell application and plugin contexts. The directory structure is designed to facilitate:

- Clear separation of concerns
- Easy navigation and discoverability
- Consistent organization across packages
- Straightforward dependency management

## Root Structure

```
personal-brain-rebuild/
├── package.json             # Root package.json for Turborepo
├── turbo.json               # Turborepo configuration
├── packages/                # All packages in the monorepo
│   ├── core/                # Core shell application
│   ├── note-context/        # Note context plugin
│   ├── profile-context/     # Profile context plugin
│   ├── conversation-context/# Conversation context plugin
│   ├── website-context/     # Website context plugin
│   ├── external-sources/    # External sources context plugin
│   ├── cli/                 # CLI interface
│   └── matrix/              # Matrix interface
└── apps/                    # Applications that use the packages
    └── personal-brain/      # Main Personal Brain application
```

## Core Package Structure

Each core package follows this structure:

```
packages/core/
├── package.json        # Package configuration and dependencies
├── tsconfig.json       # TypeScript configuration
├── src/
│   ├── index.ts        # Main entry point and exports
│   ├── types/          # Type definitions
│   │   └── index.ts    # Exported type definitions
│   ├── db/             # Database infrastructure
│   │   ├── index.ts    # Database client
│   │   ├── schema.ts   # Database schema
│   │   └── migrate.ts  # Database migrations
│   ├── entity/         # Entity framework
│   │   ├── entityRegistry.ts     # Registry for entity adapters
│   │   ├── entityService.ts      # Service for entity operations
│   │   ├── entityAdapter.ts      # Base adapter interface
│   │   ├── baseEntityAdapter.ts  # Base adapter implementation
│   │   └── markdownUtils.ts      # Markdown utilities
│   ├── registry/       # Registry system
│   │   └── registry.ts # Base registry implementation
│   ├── context/        # Context infrastructure
│   │   ├── contextRegistry.ts    # Registry for contexts
│   │   ├── contextInterface.ts   # Context interface
│   │   └── baseContext.ts        # Base context implementation
│   ├── query/          # Query processing
│   │   ├── queryProcessor.ts     # Main query processor
│   │   └── schemas/              # Response schemas
│   ├── schema/         # Schema validation
│   │   └── schemaRegistry.ts     # Registry for schemas
│   ├── resources/      # External resources
│   │   ├── resourceRegistry.ts   # Registry for resources
│   │   └── ai/                   # AI models and services
│   └── utils/          # Utility functions
│       ├── logger.ts   # Logging utilities
│       └── errorUtils.ts # Error handling utilities
└── tests/              # Tests for the package
    └── unit/           # Unit tests
```

## Plugin Context Structure

Each plugin context follows this structure:

```
packages/note-context/
├── package.json        # Package configuration and dependencies
├── tsconfig.json       # TypeScript configuration
├── src/
│   ├── index.ts        # Main entry point and exports
│   ├── types/          # Type definitions
│   │   └── index.ts    # Exported type definitions
│   ├── entity/         # Entity implementation
│   │   ├── noteEntity.ts         # Note entity interface
│   │   └── noteEntityAdapter.ts  # Note entity adapter
│   ├── context/        # Context implementation
│   │   └── noteContext.ts        # Note context implementation
│   ├── schemas/        # Context-specific schemas
│   │   ├── commandSchemas.ts     # Command schemas
│   │   └── responseSchemas.ts    # Response schemas
│   ├── services/       # Context-specific services
│   │   └── noteService.ts        # Note service implementation
│   └── utils/          # Context-specific utilities
└── tests/              # Tests for the package
    └── unit/           # Unit tests
```

## Application Structure

The main application follows this structure:

```
apps/personal-brain/
├── package.json        # Package configuration and dependencies
├── tsconfig.json       # TypeScript configuration
├── src/
│   ├── index.ts        # Main entry point
│   ├── config.ts       # Application configuration
│   ├── app.ts          # Application setup
│   └── interfaces/     # Interface implementations
│       ├── cli.ts      # CLI interface
│       └── matrix.ts   # Matrix interface
└── tests/              # Tests for the application
```

## Best Practices

1. **Exports**:
   - Export interfaces, types, and public functions from `index.ts`
   - Avoid direct imports from implementation files
   - Use named exports instead of default exports

2. **Package Dependencies**:
   - Core package should have minimal dependencies
   - Plugin packages should depend on core package
   - Application should depend on core and plugin packages

3. **Directory Naming**:
   - Use kebab-case for package names (e.g., `note-context`)
   - Use camelCase for file names (e.g., `entityService.ts`)
   - Use PascalCase for class and interface names (e.g., `EntityService`)

4. **File Organization**:
   - Group related files in dedicated directories
   - Keep file size manageable (aim for < 300 lines)
   - One class/interface per file

5. **Testing Structure**:
   - Mirror source directory structure in tests
   - Use same file names with `.test.ts` suffix
   - Group tests by functionality

## Implementation Process

When setting up a new package or component:

1. Start with defining interfaces and types
2. Implement core functionality
3. Set up tests for the implementation
4. Export public API from index.ts
5. Update package.json dependencies

For detailed implementation steps, refer to the implementation guides:

- `implementation-guide/skeleton-implementation.md`
- `implementation-guide/entity-model-implementation.md`
- `implementation-guide/app-integration.md`
