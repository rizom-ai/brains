import type { EntityMirrorClient } from "@rizom/brain/plugins";

export async function guardedImport(mirror: EntityMirrorClient): Promise<void> {
  const snapshot = await mirror.getEntityWriteSnapshot({
    entityType: "note",
    id: "imported",
    visibilityScope: "restricted",
  });
  if (snapshot) {
    await mirror.upsertEntity({
      entity: snapshot.entity,
      options: { conditionalWrite: { expectedRevision: snapshot.revision } },
    });
    await mirror.upsertEntity({
      entity: snapshot.entity,
      options: {
        conditionalWrite: {
          // @ts-expect-error Revisions are opaque strings or null for absence.
          expectedRevision: true,
        },
      },
    });
  }
  // @ts-expect-error The snapshot reader exposes no raw entity registry.
  mirror.getEntityRegistry();
}
