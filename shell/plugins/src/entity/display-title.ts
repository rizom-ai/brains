import type { BaseEntity } from "@brains/entity-service";
import { displayTitleFrom } from "@brains/utils/string-utils";

/** Where an entry's adapter is found; any entity registry satisfies it. */
export interface DisplayTitleAdapters {
  getAdapter(entityType: string):
    | {
        extractMetadata(entity: BaseEntity): Record<string, unknown>;
        displayTitle?(entity: BaseEntity): string | undefined;
      }
    | undefined;
}

/**
 * How an entry is named to people: its adapter's own title when it has one,
 * else the title, name or question the adapter reads from the current
 * content, else from stored metadata, else nothing (callers use the id).
 */
export function entityDisplayTitle(
  adapters: DisplayTitleAdapters,
  entity: BaseEntity,
): string | undefined {
  const adapter = adapters.getAdapter(entity.entityType);
  return (
    adapter?.displayTitle?.(entity) ??
    displayTitleFrom(adapter?.extractMetadata(entity) ?? {}) ??
    displayTitleFrom(entity.metadata)
  );
}
