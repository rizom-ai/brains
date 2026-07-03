import { permissionToVisibilityScope } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { StructuredChatCard } from "../contracts/agent";
import {
  resolveArtifactEntityRefFromCard,
  type ArtifactEntityRef,
} from "./artifact-entity";

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

/**
 * Single source of truth for which artifact cards are permission-denied for a
 * caller. An attachment card is denied when its backing entity exists but is not
 * visible at the caller's permission level. Every message interface should drop
 * (or suppress) these cards so a restricted artifact's existence and metadata
 * are not exposed — not just its bytes gated at download time.
 */
export async function collectDeniedArtifactCardIds<
  TEntity extends MessageArtifactEntity,
>(input: {
  cards: StructuredChatCard[] | undefined;
  userLevel: UserPermissionLevel;
  displayBaseUrl: string | undefined;
  getEntity: (ref: ArtifactEntityRef) => Promise<TEntity | null | undefined>;
  getVisibleEntity: (
    ref: ArtifactEntityRef,
    visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
  ) => Promise<TEntity | null | undefined>;
}): Promise<Set<string>> {
  const denied = new Set<string>();
  for (const card of input.cards ?? []) {
    if (card.kind !== "attachment") continue;
    const entityRef = resolveArtifactEntityRefFromCard(
      card,
      input.displayBaseUrl,
    );
    if (!entityRef) continue;
    const access = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: input.userLevel,
      getEntity: input.getEntity,
      getVisibleEntity: input.getVisibleEntity,
    });
    if (access.status === "denied") denied.add(card.id);
  }
  return denied;
}
