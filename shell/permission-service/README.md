# Permission Service

Centralized permission service for determining user permission levels across all interfaces in the Brain system.

## Overview

The Permission Service provides a single source of truth for user permissions, supporting both explicit user lists and pattern-based permission rules. All interfaces (Matrix, CLI, MCP, etc.) use this centralized service rather than implementing their own permission logic.

## Features

- **Explicit Permission Lists**: Define specific users as anchors or trusted
- **Pattern-Based Rules**: Use wildcards to match user patterns
- **Interface-Specific**: Permissions are scoped by interface type (matrix, cli, discord, etc.)
- **Dynamic Updates**: Add/remove users at runtime
- **Hierarchical Permissions**: anchor > trusted > public

## Usage

### In App Configuration

```typescript
import { defineConfig } from "@brains/app";

const config = defineConfig({
  name: "my-brain",
  permissions: {
    anchors: ["matrix:@admin:example.org"],
    trusted: ["matrix:@helper:example.org"],
    rules: [
      { pattern: "cli:*", level: "anchor" }, // All CLI users are anchors
      { pattern: "mcp:stdio", level: "anchor" }, // Local MCP access
      { pattern: "mcp:http", level: "public" }, // Remote MCP access
      { pattern: "matrix:@*:admin.org", level: "trusted" }, // Domain-based trust
    ],
  },
});
```

### Direct Usage

```typescript
import { PermissionService } from "@brains/permission-service";

const permissionService = new PermissionService({
  anchors: ["matrix:@admin:example.org"],
  trusted: ["matrix:@helper:example.org"],
  rules: [
    { pattern: "cli:*", level: "anchor" },
    { pattern: "matrix:@*:admin.org", level: "trusted" },
  ],
});

// Check user permission
const level = permissionService.determineUserLevel(
  "matrix",
  "@user:example.org",
);
console.log(level); // "public", "trusted", or "anchor"
```

### Static Helper Methods

```typescript
// Check if a user level has permission for required visibility
const canAccess = PermissionService.hasPermission("trusted", "anchor");
console.log(canAccess); // false (trusted users cannot access anchor-only items)

// Filter items by permission
const items = [
  { name: "public-tool", visibility: "public" },
  { name: "admin-tool", visibility: "anchor" },
];
const filtered = PermissionService.filterByPermission(items, "trusted");
// Returns only public-tool
```

### Transport-Based Permissions (MCP)

For MCP interfaces, permissions are based on the transport type rather than individual users:

```typescript
rules: [
  { pattern: "mcp:stdio", level: "anchor" },  // Local MCP access via stdio
  { pattern: "mcp:http", level: "public" },   // Remote MCP access via HTTP
]
```

The MCP interface automatically determines the transport type and uses it as the user ID.

## Configuration Format

### User ID Format

User IDs are prefixed with the interface type: `{interface}:{userId}`

Examples:

- `matrix:@admin:example.org`
- `cli:admin-user`
- `discord:user#1234`

### Permission Rules

Rules support wildcard (\*) matching and are evaluated in order:

```typescript
{
  pattern: "matrix:@*:admin.org",  // Matches any user from admin.org domain
  level: "trusted"
}
```

## Permission Levels

1. **anchor**: Full system access
2. **trusted**: Limited administrative access
3. **public**: Basic user access (default)

## API Reference

### PermissionService

#### Constructor

- `new PermissionService(config: PermissionConfig)`

#### Instance Methods

- `determineUserLevel(interfaceType: string, userId: string): UserPermissionLevel` - Determine permission level for a user
- `hasPermission(userLevel: UserPermissionLevel, requiredLevel: UserPermissionLevel): boolean` - Check if user meets permission requirement
- `filterByPermission<T>(items: T[], userLevel: UserPermissionLevel): T[]` - Filter items by user permission

#### Static Methods

- `hasPermission(grantedLevel: UserPermissionLevel, requiredLevel: UserPermissionLevel): boolean` - Check if a permission level meets requirements

### Types

```typescript
interface PermissionConfig {
  anchors?: string[];
  trusted?: string[];
  rules?: PermissionRule[];
}

interface PermissionRule {
  pattern: string;
  level: UserPermissionLevel;
}

type UserPermissionLevel = "public" | "trusted" | "anchor";
```
