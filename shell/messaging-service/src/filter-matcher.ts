import type { MessageWithPayload, SubscriptionFilter } from "./types";

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
 * Check if a value matches a pattern (string or RegExp).
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

  // Support simple wildcards for string patterns
  if (pattern.includes("*")) {
    const regexPattern = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${regexPattern}$`).test(value);
  }

  return value === pattern;
}
