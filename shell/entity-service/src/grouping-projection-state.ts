import type { EntityGrouping } from "./entity-grouping";

export interface GroupingProjectionTarget {
  entityType: string;
  field: string;
  generation: number;
}

/** Process-local work only. Restart always reconstructs it and scans source. */
export class GroupingProjectionState {
  private active = new Set<string>();
  private queued = new Map<string, GroupingProjectionTarget>();
  private generation = 0;

  public replace(
    groupings: Iterable<EntityGrouping>,
    reprojectExisting = false,
  ): void {
    const next = new Set<string>();
    for (const grouping of groupings) {
      for (const entityType of grouping.types) {
        const key = JSON.stringify([entityType, grouping.field]);
        if (next.has(key)) continue;
        next.add(key);
        if (
          reprojectExisting ||
          (!this.active.has(key) && !this.queued.has(key))
        ) {
          this.queued.set(key, {
            entityType,
            field: grouping.field,
            generation: ++this.generation,
          });
        }
      }
    }
    for (const key of this.queued.keys())
      if (!next.has(key)) this.queued.delete(key);
    this.active = next;
  }

  public pending(): GroupingProjectionTarget[] {
    return [...this.queued.values()].map((target) => ({ ...target }));
  }

  public complete(targets: readonly GroupingProjectionTarget[]): void {
    for (const target of targets) {
      const key = JSON.stringify([target.entityType, target.field]);
      if (this.queued.get(key)?.generation === target.generation)
        this.queued.delete(key);
    }
  }
}
