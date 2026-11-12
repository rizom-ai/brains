import { compareIds } from "@brains/utils/sort";
import type { WishMetadata, WishPriority } from "../schemas/wish";

const PRIORITY_ORDER: Record<WishPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Wishes by request count (descending), then priority, then id. */
export function sortWishesByDemand<
  TWish extends {
    readonly id: string;
    readonly metadata: Pick<WishMetadata, "requested" | "priority">;
  },
>(wishes: readonly TWish[]): TWish[] {
  return [...wishes].sort(
    (a, b) =>
      b.metadata.requested - a.metadata.requested ||
      PRIORITY_ORDER[a.metadata.priority] -
        PRIORITY_ORDER[b.metadata.priority] ||
      compareIds(a.id, b.id),
  );
}
