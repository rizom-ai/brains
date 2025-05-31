# Versioning Strategy

This document outlines strategies for consistent version management in the Personal Brain monorepo.

## Current State

Currently, packages have inconsistent versions ranging from 0.0.0 to 1.0.0. Since all packages are private (`"private": true`), version numbers are primarily for internal tracking.

## Recommended Approaches

### 1. Fixed Version (Recommended for Private Monorepos)

Since all packages are private and always used together, use a single fixed version:

```json
{
  "version": "0.1.0"
}
```

**Implementation**: Add a script to update all versions at once:

```bash
# scripts/update-versions.sh
#!/bin/bash
VERSION=$1
find packages apps -name "package.json" -not -path "*/node_modules/*" \
  -exec sed -i 's/"version": "[^"]*"/"version": "'$VERSION'"/' {} +
```

### 2. Automated Version Management Tools

#### Changesets (Recommended for Public Packages)

```bash
bun add -D @changesets/cli

# Initialize
bunx changeset init

# Add a changeset
bunx changeset

# Version packages
bunx changeset version

# Publish (if needed)
bunx changeset publish
```

#### Lerna (Traditional Choice)

```bash
bun add -D lerna

# lerna.json
{
  "version": "0.1.0",
  "npmClient": "bun",
  "packages": ["packages/*", "apps/*"]
}

# Version all packages together
bunx lerna version --no-push
```

### 3. Turborepo with Changesets Integration

Since you're already using Turborepo, you can integrate with changesets:

```json
// turbo.json
{
  "pipeline": {
    "version": {
      "dependsOn": ["^version"],
      "cache": false
    }
  }
}
```

### 4. Bun Workspaces Version Sync

Create a simple Bun script to sync versions:

```typescript
// scripts/sync-versions.ts
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const TARGET_VERSION = "0.1.0";

async function updatePackageVersion(path: string) {
  const content = await readFile(path, "utf-8");
  const pkg = JSON.parse(content);
  pkg.version = TARGET_VERSION;
  await writeFile(path, JSON.stringify(pkg, null, 2) + "\n");
}

async function findPackageJsons(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      files.push(...(await findPackageJsons(fullPath)));
    } else if (entry.name === "package.json") {
      files.push(fullPath);
    }
  }

  return files;
}

// Update all packages
const packages = await findPackageJsons("packages");
const apps = await findPackageJsons("apps");

for (const pkg of [...packages, ...apps]) {
  console.log(`Updating ${pkg}`);
  await updatePackageVersion(pkg);
}
```

## Recommendation for This Project

Since all packages are private and tightly coupled:

1. **Use fixed versioning** - All packages share the same version
2. **Version with the monorepo** - When you tag a release, all packages get that version
3. **Simple script** - Use the Bun script above or shell script for updates
4. **No publishing needed** - Since packages are private, no npm publishing complexity

## Implementation Steps

1. Create `scripts/sync-versions.ts` with the Bun script above
2. Add to package.json:
   ```json
   {
     "scripts": {
       "version:sync": "bun scripts/sync-versions.ts",
       "version:set": "bun scripts/sync-versions.ts && git add -A && git commit -m 'chore: sync package versions'"
     }
   }
   ```
3. Run when needed:
   ```bash
   bun run version:sync
   ```

## Version Numbering

Follow semantic versioning even for private packages:

- `0.1.0` - Initial development version
- `0.2.0` - New features added
- `0.2.1` - Bug fixes
- `1.0.0` - First stable release

## Benefits

1. **Consistency** - All packages always have the same version
2. **Simplicity** - No complex version resolution
3. **Clear releases** - Git tags match all package versions
4. **Easy tracking** - Know exactly what versions work together
