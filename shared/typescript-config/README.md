# @brains/typescript-config

Shared TypeScript configuration for Personal Brain applications.

## Overview

This package provides standardized TypeScript configurations used across all Brain packages. It ensures consistent type checking, compilation settings, and development experience.

## Features

- Strict type checking by default
- Multiple configuration presets
- Optimized for Bun runtime
- Path aliases support
- Incremental compilation
- Source map generation

## Installation

```bash
bun add -d @brains/typescript-config
```

## Usage

### Basic Setup

Create `tsconfig.json` in your package:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Available Configurations

### Base Config

General-purpose TypeScript configuration:

```json
{
  "extends": "@brains/typescript-config/base.json"
}
```

Features:

- ES2022 target
- Module resolution for Node
- Strict type checking
- Declaration files generation

### Library Config

For packages that will be published:

```json
{
  "extends": "@brains/typescript-config/library.json"
}
```

Additional features:

- Declaration maps
- Source maps
- Composite projects support
- Clean builds

### Application Config

For applications and services:

```json
{
  "extends": "@brains/typescript-config/application.json"
}
```

Features:

- No declaration files
- Inline source maps
- Faster compilation
- Runtime optimizations

### React Config

For React/UI packages:

```json
{
  "extends": "@brains/typescript-config/react.json"
}
```

Features:

- JSX support
- React JSX transform
- DOM library types
- CSS modules support

### Test Config

For test files:

```json
{
  "extends": "@brains/typescript-config/test.json"
}
```

Features:

- Includes test globals
- Relaxed type checking
- Jest types included

## Compiler Options

### Strict Settings

All configs include strict settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### Module Resolution

Optimized for modern Node.js and Bun:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Type Checking

Enhanced type safety:

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Path Aliases

Configure import aliases:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

Usage:

```typescript
import { Button } from "@components/Button";
import { formatDate } from "@utils/date";
```

## Project References

For monorepo packages:

```json
{
  "extends": "@brains/typescript-config/library.json",
  "compilerOptions": {
    "composite": true,
    "declarationMap": true
  },
  "references": [{ "path": "../core" }, { "path": "../utils" }]
}
```

## Build Configuration

### Development

Fast compilation for development:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",
    "sourceMap": true,
    "inlineSourceMap": false
  }
}
```

### Production

Optimized for production:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "removeComments": true,
    "sourceMap": false,
    "inlineSources": false,
    "declaration": true
  }
}
```

## Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .tsbuildinfo"
  }
}
```

## IDE Integration

### VS Code

`.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### WebStorm

Automatically detects tsconfig.json. For custom configs:

- Settings → Languages & Frameworks → TypeScript
- Set "TypeScript" to project's node_modules version

## Extending Configurations

### Override Options

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "target": "ES2023",
    "strict": false,
    "noUnusedLocals": false
  }
}
```

### Multiple Configs

For different environments:

`tsconfig.json`:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "include": ["src/**/*"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

`tsconfig.test.json`:

```json
{
  "extends": "@brains/typescript-config/test.json",
  "include": ["src/**/*.test.ts", "test/**/*"]
}
```

## Troubleshooting

### Common Issues

1. **"Cannot find module"**
   - Check `moduleResolution` setting
   - Verify path aliases configuration

2. **"Type error in node_modules"**
   - Add to exclude: `"skipLibCheck": true`

3. **Slow compilation**
   - Enable incremental compilation
   - Use project references for large codebases

4. **"Cannot use import statement"**
   - Ensure `module` is set to "ESNext" or "ES2022"

## Migration Guide

### From JavaScript

1. Rename files from `.js` to `.ts`
2. Add tsconfig.json extending our config
3. Run `bun run typecheck` to find issues
4. Gradually add types

### From Loose TypeScript

1. Extend stricter config
2. Fix type errors incrementally
3. Enable one strict option at a time

## Best Practices

1. **Use strict mode** - Start with strict settings
2. **Avoid `any`** - Use `unknown` or specific types
3. **Enable all checks** - Turn on all type checking options
4. **Use declaration files** - Generate `.d.ts` for libraries
5. **Incremental adoption** - Gradually increase strictness

## Files Included

- `base.json` - Base configuration
- `library.json` - For publishable packages
- `application.json` - For applications
- `react.json` - For React projects
- `test.json` - For test files

## License

MIT
