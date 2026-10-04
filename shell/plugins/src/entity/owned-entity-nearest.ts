import type { ContentVisibility } from "@brains/entity-service";
import type { EntityDefinitionShape, EntityOf } from "./entity-shape";

export interface OwnedNearestOptions {
  /** Match exactly this visibility, within the caller's scope. */
  readonly visibility: ContentVisibility;
  readonly maxDistance: number;
  /** Maximum candidates, 1–100, filtered in storage before limiting. */
  readonly limit: number;
  readonly excludeIds?: readonly string[];
  readonly publishedOnly?: boolean;
}

/** Bounded owned-type candidates, not a raw index or hybrid search scores. */
export interface OwnedEntityNearest {
  <TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    query: string,
    options: OwnedNearestOptions,
  ): Promise<
    ReadonlyArray<{
      readonly entity: EntityOf<TDefinition>;
      readonly distance: number;
    }>
  >;
}
