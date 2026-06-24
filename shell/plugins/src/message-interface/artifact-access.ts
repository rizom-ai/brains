import { permissionToVisibilityScope } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { ArtifactEntityRef } from "./artifact-entity";

export interface MessageArtifactEntity {
  content: unknown;
  metadata: Record<string, unknown> | null | undefined;
}

export interface MessageArtifactAccessInput<
  TEntity extends MessageArtifactEntity,
> {
  entityRef: ArtifactEntityRef;
  userLevel: UserPermissionLevel;
  getEntity: (ref: ArtifactEntityRef) => Promise<TEntity | null | undefined>;
  getVisibleEntity: (
    ref: ArtifactEntityRef,
    visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
  ) => Promise<TEntity | null | undefined>;
}

export type MessageArtifactAccessResult<TEntity extends MessageArtifactEntity> =
  | { status: "visible"; entity: TEntity }
  | { status: "denied" }
  | { status: "missing" };

export async function resolveMessageArtifactAccess<
  TEntity extends MessageArtifactEntity,
>({
  entityRef,
  userLevel,
  getEntity,
  getVisibleEntity,
}: MessageArtifactAccessInput<TEntity>): Promise<
  MessageArtifactAccessResult<TEntity>
> {
  const visibilityScope = permissionToVisibilityScope(userLevel);
  const entity = await getVisibleEntity(entityRef, visibilityScope);
  if (entity) return { status: "visible", entity };

  const exists = Boolean(await getEntity(entityRef));
  return exists ? { status: "denied" } : { status: "missing" };
}

export function canReceiveNativeArtifactFile(
  userLevel: UserPermissionLevel,
): boolean {
  return userLevel === "anchor" || userLevel === "trusted";
}
