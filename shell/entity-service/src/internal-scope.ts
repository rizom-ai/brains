import type { ContentVisibility } from "./types";

/**
 * Opt up to unrestricted visibility scope for system-internal operations.
 *
 * Call this only where the operation never exposes entity content to a
 * non-system caller. The `reason` argument is for grep/audit — not a runtime
 * check — but every callsite must justify itself.
 *
 * Legitimate uses:
 *  - embedding regeneration (pure indexing, no user surface)
 *  - reconciliation/sync jobs (system bookkeeping)
 *  - bootstrap singleton loads (process startup, no user context yet)
 *
 * Illegitimate uses:
 *  - resolving content for display — propagate the outer caller's scope
 *  - anything returning entity data on a user request
 *
 * Plain "restricted" strings in non-test code should always go through this
 * helper; the helper call is the auditable record that the bypass was
 * deliberate.
 */
export function internalFullScope(_reason: string): ContentVisibility {
  return "restricted";
}
