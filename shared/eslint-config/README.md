# @brains/eslint-config

Shared ESLint configuration for Personal Brain applications.

## Overview

This package provides a standardized ESLint configuration used across all Brain packages and applications. It enforces consistent code style, catches common errors, and ensures best practices.

## Features

- TypeScript-first configuration
- Strict type checking rules
- Import ordering and organization
- Accessibility rules for UI components
- Jest testing rules
- Prettier integration
- Custom rules for Brain conventions

## Installation

```bash
bun add -d @brains/eslint-config
```

## Usage

### Basic Setup

Create `.eslintrc.json` in your package:

```json
{
  "extends": "@brains/eslint-config"
}
```

Or in `package.json`:

```json
{
  "eslintConfig": {
    "extends": "@brains/eslint-config"
  }
}
```

### With TypeScript

```json
{
  "extends": "@brains/eslint-config",
  "parserOptions": {
    "project": "./tsconfig.json"
  }
}
```

## Available Configurations

### Base Config

The default export provides general TypeScript rules:

```json
{
  "extends": "@brains/eslint-config"
}
```

### React Config

For React/UI packages:

```json
{
  "extends": "@brains/eslint-config/react"
}
```

### Node Config

For Node.js services and CLI tools:

```json
{
  "extends": "@brains/eslint-config/node"
}
```

### Test Config

For test files:

```json
{
  "extends": "@brains/eslint-config/test"
}
```

## Rule Categories

### TypeScript Rules

- No explicit `any` without justification
- Strict null checks
- Consistent type imports
- Interface over type when possible
- Explicit return types for public APIs

```typescript
// ❌ Bad
function getData(id) {
  return fetch(`/api/${id}`);
}

// ✅ Good
async function getData(id: string): Promise<Data> {
  return fetch(`/api/${id}`);
}
```

### Import Rules

- Sorted imports
- Grouped by type (external, internal, relative)
- No circular dependencies
- Consistent import paths

```typescript
// ❌ Bad
import { z } from "zod";
import { Shell } from "../shell";
import React from "react";

// ✅ Good
import React from "react";
import { z } from "zod";

import { Shell } from "../shell";
```

### Naming Conventions

- PascalCase for types and components
- camelCase for variables and functions
- UPPER_CASE for constants
- Private members prefixed with underscore

```typescript
// ✅ Good naming
interface UserProfile {
  firstName: string;
}

const MAX_RETRIES = 3;

class Service {
  private _cache: Map<string, any>;
}
```

### Best Practices

- Prefer `const` over `let`
- No unused variables
- Exhaustive switch statements
- Consistent error handling

```typescript
// ❌ Bad
let data = getData();
switch (type) {
  case "note":
    return handleNote();
}

// ✅ Good
const data = getData();
switch (type) {
  case "note":
    return handleNote();
  default:
    throw new Error(`Unknown type: ${type}`);
}
```

## Custom Rules

### Brain-specific Rules

```javascript
module.exports = {
  rules: {
    "@brains/no-direct-db-access": "error",
    "@brains/use-zod-schemas": "error",
    "@brains/consistent-plugin-structure": "error",
  },
};
```

### Enforce Patterns

- Use dependency injection
- Follow plugin conventions
- Use proper error types
- Consistent logging

## Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "lint:ci": "eslint src --ext .ts,.tsx --max-warnings 0"
  }
}
```

## IDE Integration

### VS Code

`.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ]
}
```

### WebStorm

Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint:

- Enable "Automatic ESLint configuration"

## Overriding Rules

### Package-level Overrides

```json
{
  "extends": "@brains/eslint-config",
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off"
  }
}
```

### File-level Overrides

```javascript
/* eslint-disable no-console */
console.log("Debug output");

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const data: any = getLegacyData();
```

### Pattern-based Overrides

```json
{
  "extends": "@brains/eslint-config",
  "overrides": [
    {
      "files": ["*.test.ts"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

## Prettier Integration

ESLint config works with Prettier. Add `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80
}
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Lint
  run: bun run lint:ci
```

### Pre-commit Hook

Using Husky:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "bun run lint"
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **"Parsing error: Cannot read tsconfig.json"**
   - Ensure `parserOptions.project` points to correct tsconfig

2. **"Definition for rule not found"**
   - Update @brains/eslint-config to latest version

3. **Conflicts with Prettier**
   - Ensure eslint-config-prettier is included

## Migration Guide

### From Standard ESLint

1. Install package: `bun add -d @brains/eslint-config`
2. Replace extends: `"extends": "@brains/eslint-config"`
3. Remove redundant plugins and rules
4. Run `bun run lint:fix` to auto-fix issues

## Exports

- Default config for TypeScript
- `/react` - React-specific rules
- `/node` - Node.js-specific rules
- `/test` - Test file rules

## License

MIT
