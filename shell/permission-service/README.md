# Permission Service

Centralized permission service for determining user permission levels across all interfaces in the Brain system.

## Overview

The Permission Service provides a single source of truth for user permissions, supporting both explicit user lists and pattern-based permission rules. This eliminates the need for individual interface plugins to implement their own permission logic.

## Features

- **Explicit Permission Lists**: Define specific users as anchors or trusted
- **Pattern-Based Rules**: Use wildcards to match user patterns
- **Interface-Specific**: Permissions are scoped by interface type (matrix, cli, discord, etc.)
- **Dynamic Updates**: Add/remove users at runtime
- **Hierarchical Permissions**: anchor > trusted > public

## Usage

```typescript
import { PermissionService } from "@brains/permission-service";

const permissionService = new PermissionService({
  anchors: ["matrix:@admin:example.org", "cli:admin"],
  trusted: ["matrix:@helper:example.org"],
  rules: [
    { pattern: "cli:*", level: "anchor" }, // All CLI users are anchors
    { pattern: "matrix:@*:admin.org", level: "trusted" }, // Domain-based trust
  ],
});

// Check user permission
const level = permissionService.determineUserLevel("matrix", "@user:example.org");
console.log(level); // "public", "trusted", or "anchor"
```

## Configuration Format

### User ID Format

User IDs are prefixed with the interface type: `{interface}:{userId}`

Examples:
- `matrix:@admin:example.org`
- `cli:admin-user`
- `discord:user#1234`

### Permission Rules

Rules support wildcard (*) matching and are evaluated in order:

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

#### Methods
- `determineUserLevel(interfaceType: string, userId: string): UserPermissionLevel`
- `addAnchor(interfaceType: string, userId: string): void`
- `addTrusted(interfaceType: string, userId: string): void`
- `removeUser(interfaceType: string, userId: string): void`
- `getAnchors(): string[]`
- `getTrusted(): string[]`
- `getRules(): PermissionRule[]`

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