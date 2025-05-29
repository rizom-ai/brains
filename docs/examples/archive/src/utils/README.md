# Utility Functions

This directory contains utility functions used throughout the personal-brain project.

## Type Safety Utilities

### `safeAccessUtils.ts`

This module provides functions for safe property and array access with proper type handling. These utilities are especially useful for avoiding TypeScript errors related to potentially undefined values.

#### Key Functions:

- `safeArrayAccess<T>(array: T[] | undefined | null, index: number, defaultValue: T): T`
  - Safely access array elements with a default value when the index is out of bounds
  - Example: `safeArrayAccess(users, 5, defaultUser)`

- `safeObjectAccess<T, K extends keyof T>(obj: T | undefined | null, key: K, defaultValue: T[K]): T[K]`
  - Safely access object properties with a default value if the object or property doesn't exist
  - Example: `safeObjectAccess(user, 'name', 'Anonymous')`

- `safeIndexAccess<T>(obj: Record<string, T> | undefined | null, key: string, defaultValue: T): T`
  - Safely access properties on objects with string indices
  - Example: `safeIndexAccess(userMap, userId, defaultUser)`

- `safeNestedAccess<T>(obj: Record<string, unknown> | undefined | null, path: string, defaultValue: T): T`
  - Safely access nested properties with a dot-separated path
  - Example: `safeNestedAccess(user, 'profile.address.city', 'Unknown')`

- `assertDefined<T>(value: T | undefined | null, errorMessage: string): T`
  - Assert that a value is defined, throwing an error if it's not
  - Example: `const userId = assertDefined(user.id, 'User ID is required')`

- `isDefined<T>(value: T | undefined | null): value is T`
  - Type guard for checking if a value exists (not undefined or null)
  - Example: `if (isDefined(user)) { ... }`

### Future TypeScript Safety Improvements

The project has a roadmap for gradually improving type safety:

1. ✅ Enable `noImplicitOverride`
2. ✅ Enable `noImplicitReturns`
3. ✅ Enable `forceConsistentCasingInFileNames`
4. ✅ Enable `noPropertyAccessFromIndexSignature`
5. 🔄 Introduce safe access utilities
6. ⬜ Enable `noUncheckedIndexedAccess` (planned)
7. ⬜ Enable `exactOptionalPropertyTypes` (future consideration)

### Preparing for `noUncheckedIndexedAccess`

When `noUncheckedIndexedAccess` is enabled, TypeScript will treat all property access via index signatures as potentially undefined. To prepare for this:

1. Use `safeArrayAccess` for array element access instead of direct indexing
2. Use `safeIndexAccess` for dynamic property access on objects
3. Add null checks before accessing properties, or use optional chaining with nullish coalescing
4. Use the `isDefined` type guard to narrow types
5. For guaranteed properties, consider using assertion functions

### Other Utilities

- `configUtils.ts` - Type-safe environment variable access
- `logger.ts` - Logging utilities
- `noteUtils.ts` - Note handling and formatting
- `tagExtractor.ts` - Tag extraction and generation
- `textUtils.ts` - Text processing and chunking