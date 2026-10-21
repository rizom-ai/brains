import type { BaseEntity } from "@brains/entity-service";
import { displayTitleFrom } from "@brains/utils/string-utils";

/** Where an entry's adapter is found; any entity registry satisfies it. */
export interface DisplayTitleAdapters {
  getAdapter(
    entityType: string,
  ):
    | { extractMetadata(entity: BaseEntity): Record<string, unknown> }
    | undefined;
}

/**
 * How an entry is named to people: the title, name or question its adapter
 * reads from the current content, else from stored metadata, else nothing
 * (callers fall back to the id).
 */
export function entityDisplayTitle(
  adapters: DisplayTitleAdapters,
  entity: BaseEntity,
): string | undefined {
  return (
    displayTitleFrom(
      adapters.getAdapter(entity.entityType)?.extractMetadata(entity) ?? {},
    ) ?? displayTitleFrom(entity.metadata)
  );
}
