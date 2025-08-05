# System Plugin

Core system operations plugin providing fundamental functionality for the Personal Brain system.

## Features

This plugin provides both commands and tools for:

### Search Operations

- **Command**: `/search <query>` - Search entities using the entity service
- **Tool**: `system:search` - Search entities by type and query
- **Tool**: `system:query` - AI-powered knowledge base query

### Entity Operations

- **Command**: `/get <id> [type]` - Get a specific entity by ID
- **Tool**: `system:get` - Get entity by type and ID

### Job Monitoring

- **Command**: `/getjobstatus [batch-id]` - Check background operation status
- **Tool**: `system:check-job-status` - Check job/batch status

## Architecture

The SystemPlugin extends `InterfacePlugin` to gain access to:

- Query capabilities for AI-powered search
- Entity service for CRUD operations
- Job monitoring for background tasks
- Command execution infrastructure

This design eliminates duplication between shell commands and MCP tools by providing a single implementation used by all interfaces.
