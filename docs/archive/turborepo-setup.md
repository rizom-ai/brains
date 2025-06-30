# Setting Up Turborepo for Personal Brain

This guide explains how to set up Turborepo for the Personal Brain project, including package organization, workspace configuration, and build pipeline.

## What is Turborepo?

Turborepo is a high-performance build system for JavaScript and TypeScript codebases. It provides:

- Fast, incremental builds with caching
- Parallel task execution
- Dependency graph management
- Monorepo workflow optimization
- Shared configuration and tooling

## Creating the Monorepo

### 1. Initialize the Project

```bash
# Create a new Turborepo project
pnpm dlx create-turbo@latest personal-brain-new
cd personal-brain-new

# Clean up the example apps and packages
rm -rf apps/web apps/docs packages/ui packages/eslint-config*
```

### 2. Set Up Package Structure

```bash
# Create the package directories
mkdir -p packages/shell
mkdir -p packages/note-context
mkdir -p packages/profile-context
mkdir -p packages/website-context
mkdir -p packages/conversation-context
mkdir -p apps/cli
mkdir -p apps/matrix-bot
```

### 3. Configure Turborepo

Update the `turbo.json` file at the root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts", "test/**/*.tsx"]
    },
    "typecheck": {
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 4. Set Up Root Package.json

Update the root `package.json`:

```json
{
  "name": "personal-brain",
  "version": "0.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "eslint": "^8.48.0",
    "prettier": "^3.0.3",
    "turbo": "latest",
    "typescript": "^5.2.2"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "packageManager": "pnpm@8.6.10"
}
```

## Setting Up Shared Configurations

### 1. TypeScript Configuration

Create a base `tsconfig.json` in the root:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Default",
  "compilerOptions": {
    "composite": false,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "inlineSources": false,
    "isolatedModules": true,
    "moduleResolution": "node",
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "preserveWatchOutput": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"]
  },
  "exclude": ["node_modules"]
}
```

Create a package for shared TypeScript configuration:

```bash
mkdir -p packages/typescript-config
```

Add `packages/typescript-config/base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Default",
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Add `packages/typescript-config/package.json`:

```json
{
  "name": "@brains/typescript-config",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json"]
}
```

### 2. ESLint Configuration

Create a package for shared ESLint configuration:

```bash
mkdir -p packages/eslint-config
```

Add `packages/eslint-config/package.json`:

```json
{
  "name": "@brains/eslint-config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "eslint-config-prettier": "^8.10.0",
    "@typescript-eslint/eslint-plugin": "^6.3.0",
    "@typescript-eslint/parser": "^6.3.0"
  }
}
```

Add `packages/eslint-config/index.js`:

```js
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["node_modules/", "dist/"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
};
```

## Setting Up Shell Package

### 1. Configure Package.json

Create `packages/shell/package.json`:

```json
{
  "name": "@brains/shell",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist/**"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "drizzle-orm": "^0.29.0",
    "drizzle-zod": "^0.5.0",
    "gray-matter": "^4.0.3",
    "zod": "^3.22.2"
  },
  "devDependencies": {
    "@brains/eslint-config": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/better-sqlite3": "^7.6.4",
    "@types/node": "^18.16.0",
    "drizzle-kit": "^0.20.0",
    "eslint": "^8.48.0",
    "tsup": "^7.2.0",
    "typescript": "^5.2.2"
  }
}
```

### 2. Configure TypeScript

Create `packages/shell/tsconfig.json`:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 3. Configure Drizzle

Create `packages/shell/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./brain.db",
  },
} satisfies Config;
```

## Setting Up Context Packages

Each context package should be set up with a similar structure. Here's an example for the Note context:

### 1. Configure Package.json

Create `packages/note-context/package.json`:

```json
{
  "name": "@brains/note-context",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist/**"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@brains/shell": "workspace:*",
    "gray-matter": "^4.0.3",
    "zod": "^3.22.2"
  },
  "devDependencies": {
    "@brains/eslint-config": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/node": "^18.16.0",
    "eslint": "^8.48.0",
    "tsup": "^7.2.0",
    "typescript": "^5.2.2"
  }
}
```

### 2. Configure TypeScript

Create `packages/note-context/tsconfig.json`:

```json
{
  "extends": "@brains/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Setting Up Application Packages

For the CLI and Matrix bot applications:

### 1. CLI App Configuration

Create `apps/cli/package.json`:

```json
{
  "name": "@brains/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "brain": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@brains/shell": "workspace:*",
    "@brains/note-context": "workspace:*",
    "@brains/profile-context": "workspace:*",
    "commander": "^11.0.0"
  },
  "devDependencies": {
    "@brains/eslint-config": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/node": "^18.16.0",
    "eslint": "^8.48.0",
    "tsup": "^7.2.0",
    "typescript": "^5.2.2"
  }
}
```

### 2. Matrix Bot Configuration

Create `apps/matrix-bot/package.json`:

```json
{
  "name": "@brains/matrix-bot",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@brains/shell": "workspace:*",
    "@brains/note-context": "workspace:*",
    "@brains/profile-context": "workspace:*",
    "matrix-js-sdk": "^27.0.0"
  },
  "devDependencies": {
    "@brains/eslint-config": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/node": "^18.16.0",
    "eslint": "^8.48.0",
    "tsup": "^7.2.0",
    "typescript": "^5.2.2"
  }
}
```

## Installing Dependencies

After setting up all package configurations:

```bash
# Install all dependencies
pnpm install

# Run initial build
pnpm build

# Start development
pnpm dev
```

## Development Workflow

### Running Commands

```bash
# Build all packages
pnpm build

# Run dev mode (watch mode)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Clean
pnpm clean
```

### Running Commands for Specific Packages

```bash
# Build only the shell package
pnpm --filter "@brains/shell" build

# Run tests for the note context
pnpm --filter "@brains/note-context" test

# Clean the CLI app
pnpm --filter "@brains/cli" clean
```

## Adding New Packages

When adding a new package:

1. Create the package directory under `packages/` or `apps/`
2. Configure `package.json` with appropriate dependencies
3. Set up `tsconfig.json` extending the base configuration
4. Add any package-specific configurations
5. Run `pnpm install` to update workspace dependencies

## Benefits of Turborepo

- **Caching**: Turborepo caches task outputs for faster builds
- **Parallelization**: Tasks run in parallel where possible
- **Dependency Graph**: Automatically manages build order
- **Workspaces**: Simplifies cross-package references
- **Consistent Tooling**: Shared configurations across packages
- **Local Package Links**: Easy development across packages
