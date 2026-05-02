import type { MessageWithPayload, SubscriptionFilter } from "./types";

/**
 * Pre-compile any wildcard string patterns in a filter to anchored RegExp,
 * so the per-publish hot path doesn't recompile them on every match call.
 * Idempotent: RegExp inputs and literal strings (no `*`) pass through unchanged.
 */
export function compileFilter(filter: SubscriptionFilter): SubscriptionFilter {
  return {
    ...filter,
    ...(filter.source !== undefined && {
      source: compilePattern(filter.source),
    }),
    ...(filter.target !== undefined && {
      target: compilePattern(filter.target),
    }),
  };
}

function compilePattern(pattern: string | RegExp): string | RegExp {
  if (pattern instanceof RegExp) return pattern;
  if (!pattern.includes("*")) return pattern;
  const regexBody = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regexBody}$`);
}

/**
 * Check if a message matches a subscription filter.
 */
export function matchesFilter(
  message: MessageWithPayload,
  filter?: SubscriptionFilter,
): boolean {
  if (!filter) {
    return true; // No filter means accept all messages
  }

  if (!matchesOptionalPattern(message.source, filter.source)) {
    return false;
  }

  if (!matchesOptionalPattern(message.target, filter.target, true)) {
    return false;
  }

  if (!matchesMetadata(message.metadata, filter.metadata)) {
    return false;
  }

  return filter.predicate ? filter.predicate(message) : true;
}

function matchesOptionalPattern(
  value: string | undefined,
  pattern: string | RegExp | undefined,
  requireValue = false,
): boolean {
  if (!pattern) return true;
  if (requireValue && !value) return false;
  return matchesPattern(value, pattern);
}

function matchesMetadata(
  metadata: Record<string, unknown> | undefined,
  filterMetadata: Record<string, unknown> | undefined,
): boolean {
  if (!filterMetadata) return true;
  if (!metadata) return false;

  return Object.entries(filterMetadata).every(
    ([key, value]) => metadata[key] === value,
  );
}

/**
 * Check if a value matches a pattern. RegExp patterns are tested directly;
 * string patterns are compared by equality. Wildcard strings are normalized
 * to RegExp at subscribe time via `compileFilter`, so they never reach here.
 */
function matchesPattern(
  value: string | undefined,
  pattern: string | RegExp,
): boolean {
  if (!value) return false;

  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    const matches = pattern.test(value);
    pattern.lastIndex = 0;
    return matches;
  }

  return value === pattern;
}
