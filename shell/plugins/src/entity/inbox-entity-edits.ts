import type { EntityDefinitionShape, EntityOf } from "./entity-shape";
import type { OwnedEntityEdit } from "./owned-entity-mutations";

/** Request-scoped, caller-authorized edits for an installed Inbox source's own types.
 * No background receipts, folds, raw revisions or author-selected attribution.
 */
export interface InboxEntityEdits {
  read<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    id: string,
  ): Promise<OwnedEntityEdit<EntityOf<TDefinition>> | null>;
  replace<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    edit: OwnedEntityEdit<NoInfer<EntityOf<TDefinition>>>,
    entity: NoInfer<EntityOf<TDefinition>>,
  ): Promise<void>;
  delete<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    edit: OwnedEntityEdit<NoInfer<EntityOf<TDefinition>>>,
  ): Promise<void>;
}
