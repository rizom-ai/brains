/**
 * @deprecated Use `createMockShell` from `@brains/test-utils` directly.
 * This file re-exports for backward compatibility.
 */
export {
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "@brains/test-utils";

// Backward compat: `MockShell.createFresh(opts)` → `createMockShell(opts)`
// Tests that use `new MockShell(opts)` need to switch to `createMockShell(opts)`
