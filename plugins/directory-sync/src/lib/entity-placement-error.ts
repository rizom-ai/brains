/** A historical ID cannot be exported under the current placement rules. */
export class EntityPlacementError extends Error {
  readonly entityType: string;
  readonly entityId: string;
  readonly relativePath: string;
  readonly owner: { entityType: string; id: string };

  constructor(
    entityType: string,
    entityId: string,
    relativePath: string,
    owner: { entityType: string; id: string },
  ) {
    super(
      `${entityType}/${entityId} cannot use ${relativePath}: invalid placement (reads as ${owner.entityType}/${owner.id})`,
    );
    this.name = "EntityPlacementError";
    this.entityType = entityType;
    this.entityId = entityId;
    this.relativePath = relativePath;
    this.owner = owner;
  }
}
