import type { WishMetadata, WishPriority } from "../schemas/wish";

const PRIORITY_ORDER: Record<WishPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Wishes by request count (descending), then priority. */
export function sortWishesByDemand<
  TWish extends {
    readonly metadata: Pick<WishMetadata, "requested" | "priority">;
  },
>(wishes: readonly TWish[]): TWish[] {
  return [...wishes].sort((a, b) => {
    const reqDiff = b.metadata.requested - a.metadata.requested;
    if (reqDiff !== 0) return reqDiff;
    return (
      PRIORITY_ORDER[a.metadata.priority] - PRIORITY_ORDER[b.metadata.priority]
    );
  });
}
