# Website Deployment Workflow

This document explains how the website deployment workflow is implemented in Personal Brain.

## Architecture Overview

The website deployment system is built with a clear separation of concerns through dependency injection:

```
WebsiteContext
    ↓ (depends on)
DeploymentManagerFactory
    ↓ (creates)
WebsiteDeploymentManager (interface)
    ↓ (implemented by)
┌─────────────────────┐  ┌─────────────────────┐
│LocalCaddyDeployment│  │LocalDevDeployment   │
│Manager             │  │Manager              │
└─────────────────────┘  └─────────────────────┘
    (Caddy-based)        (Local Development)
```

## Hybrid Caddy Approach

The system uses a hybrid approach for server management:

1. **Always-Running Servers**: With the hybrid Caddy approach, servers are always started at application startup regardless of environment.
2. **External Management**: Caddy manages the HTTP servers in server environments.
3. **Consistent Server Lifecycle**: Servers follow the same lifecycle in all environments (development, test, server).

## Site Environments

The system supports two site environments:

1. **Preview Environment**: For staging and testing changes before they go live
2. **Live Environment**: For hosting the public-facing website

## Components

### 1. WebsiteContext

The WebsiteContext is responsible for high-level website operations. It:

- Gets the appropriate deployment manager based on configuration
- Provides `handleWebsiteBuild`, `handleWebsitePromote`, and `handleWebsiteStatus` methods
- Delegates deployment operations to the deployment manager

### 2. DeploymentManagerFactory

The factory creates the appropriate deployment manager based on:
- Configuration settings (deployment.type)
- Environment variable overrides (WEBSITE_DEPLOYMENT_TYPE)

### 3. WebsiteDeploymentManager Interface

Defines the contract for all deployment managers:
- `getEnvironmentStatus(environment)`: Gets information about a specific environment
- `promoteToLive()`: Promotes preview content to the live site

### 4. CaddyDeploymentManager

The server implementation that works with Caddy web server:
- Manages files at `/opt/personal-brain-website/{preview,live}/dist`
- Handles Caddy server interactions (status checks, reloading)
- Implements file operations for promotion

### 5. LocalDevDeploymentManager

The development implementation for local testing:
- Manages files at `./dist/{preview,live}`
- Simulates deployment without needing a real web server
- Uses the same interface for command compatibility

### 6. ServerManager

Dedicated server management component with responsibilities:
- Initializing servers at application startup
- Ensuring servers are properly stopped during shutdown
- Providing server status information
- Coordinating with the deployment manager

## Workflow Example

```
┌────────────┐   ┌──────────────────┐   ┌───────────────┐  
│User Command│   │WebsiteContext    │   │DeploymentMgr  │  
└─────┬──────┘   └────────┬─────────┘   └───────┬───────┘  
      │                   │                     │          
      │ website-build     │                     │          
      │─────────────────>│                     │          
      │                   │                     │          
      │                   │ buildWebsite()      │          
      │                   │────────────>│      │          
      │                   │                     │          
      │                   │<───────────│      │          
      │                   │                     │          
      │ website-status    │                     │          
      │─────────────────>│                     │          
      │                   │                     │          
      │                   │ getEnvironmentStatus│          
      │                   │────────────────────>│          
      │                   │                     │          
      │                   │<────────────────────│          
      │                   │                     │          
      │ website-promote   │                     │          
      │─────────────────>│                     │          
      │                   │                     │          
      │                   │ promoteToLive        │          
      │                   │────────────────────>│          
      │                   │                     │          
      │                   │<────────────────────│          
      │<─────────────────│                     │          
```

## Manager Selection Logic

The system selects the appropriate deployment manager:

1. If `WEBSITE_DEPLOYMENT_TYPE=local-dev` is set, it always uses LocalDevDeploymentManager
2. If `config.deployment.type === 'local-dev'`, it uses LocalDevDeploymentManager
3. Otherwise, it uses the appropriate manager based on configuration

## Directory Structure

### Server Environment
```
/opt/personal-brain-website/
  ├── preview/
  │   └── dist/        # Preview environment
  └── live/
      └── dist/        # Live environment
```

### Development Environment
```
./dist/
  ├── preview/         # Preview environment
  └── live/            # Live environment
```

## Testing

The deployment system includes comprehensive tests:
- Unit tests for each manager implementation
- Integration tests for the workflow
- Mock implementations for automated testing

## Configuration

Environment variables and configuration that control deployment:

- `WEBSITE_DEPLOYMENT_TYPE`: Override to force a specific manager type
- `config.deployment.type`: Configuration setting determining deployment type
- `WEBSITE_BASE_DIR`: Base directory for file operations
- `WEBSITE_DOMAIN`: Domain name for the website

## CSS Handling

To ensure proper CSS serving across environments:

1. **Caddy Configuration**: 
   - Explicit MIME type handling via path-matching directives
   - Content-Type headers set to "text/css; charset=utf-8"
   - Cache-Control headers optimize CSS caching

2. **Static File Server**:
   - Uses the `serve` package for reliable file serving
   - Port configuration via environment variables
   - Consistent behavior in preview and live environments

3. **Troubleshooting CSS Issues**:
   - Verify CSS files appear in the file transfer during promotion
   - Check network requests in browser developer tools
   - Ensure cache settings don't prevent fresh CSS loading
   - For persistent issues, manually reload Caddy configuration