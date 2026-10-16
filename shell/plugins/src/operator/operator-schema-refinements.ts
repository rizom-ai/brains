import type { z } from "@brains/utils/zod";

/** The one part of a Zod refinement context the operator refiners use. */
export type OperatorIssueContext = Pick<z.RefinementCtx, "addIssue">;

export interface DuplicateIssueOptions<T> {
  /** Names the key in the message: `${label} "${key}" is duplicated`. */
  readonly label: string;
  /** Collection and key field; the issue path is `[collection, index, field]`. */
  readonly path: readonly [collection: string, field: string];
  /** Keys already taken elsewhere, which a first occurrence may not reuse. */
  readonly reserved?: ReadonlySet<string> | undefined;
  /** Runs after each item's own check, so per-item issues stay in source order. */
  readonly each?: ((item: T, index: number) => void) | undefined;
}

/**
 * Reports every item whose key repeats an earlier one (or a reserved key) and
 * returns the keys the collection declared. Items without a key are skipped.
 */
export function addDuplicateIssues<T>(
  context: OperatorIssueContext,
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
  options: DuplicateIssueOptions<T>,
): Set<string> {
  const [collection, field] = options.path;
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const key = keyOf(item);
    if (key !== undefined) {
      if (seen.has(key) || options.reserved?.has(key)) {
        context.addIssue({
          code: "custom",
          message: `${options.label} "${key}" is duplicated`,
          path: [collection, index, field],
        });
      }
      seen.add(key);
    }
    options.each?.(item, index);
  }
  return seen;
}
