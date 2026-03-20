# Cleanup: Remove Unnecessary Re-exports

## Problem

Packages re-export types from their dependencies (e.g., `@brains/app` re-exporting types from `@brains/plugins`). This creates false dependency chains and makes it unclear where types are defined. Consumers should import from the source package directly.

## TODO

- Audit all `export type { ... } from` in `shell/app/src/index.ts` and other package index files
- Remove re-exports where the type originates in a dependency that consumers already depend on
- Update any consumers to import from the source package
