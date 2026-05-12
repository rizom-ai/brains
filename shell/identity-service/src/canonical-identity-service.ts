import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { ConversationMessageActor } from "@brains/conversation-service";
import { CanonicalIdentityLinkAdapter } from "./canonical-identity-link-adapter";
import {
  CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
  type CanonicalIdentityActor,
  type CanonicalIdentityLink,
  type CanonicalIdentityLinkEntity,
} from "./canonical-identity-link-schema";

export interface CanonicalIdentityResolution extends CanonicalIdentityLink {
  matchedActor: CanonicalIdentityActor;
}

export interface ICanonicalIdentityService {
  refreshCache(): Promise<void>;
  getLinks(): CanonicalIdentityLink[];
  resolveActor(actorId: string): CanonicalIdentityResolution | null;
  /**
   * Return the actor with `canonicalId` filled in when a link exists. Returns
   * the actor unchanged when enrichment doesn't apply (already canonical, no
   * matching link, or non-user role).
   */
  enrichActor(actor: ConversationMessageActor): ConversationMessageActor;
  validateLink(
    entity: CanonicalIdentityLinkEntity,
    context: { operation: "create" | "update" },
  ): Promise<void>;
}

export class CanonicalIdentityService implements ICanonicalIdentityService {
  private static instance: CanonicalIdentityService | null = null;
  private readonly adapter = new CanonicalIdentityLinkAdapter();
  private readonly logger: Logger;
  private links: CanonicalIdentityLink[] = [];
  private actorIndex = new Map<string, CanonicalIdentityResolution>();

  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
  ): CanonicalIdentityService {
    CanonicalIdentityService.instance ??= new CanonicalIdentityService(
      entityService,
      logger,
    );
    return CanonicalIdentityService.instance;
  }

  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
  ): CanonicalIdentityService {
    return new CanonicalIdentityService(entityService, logger);
  }

  public static resetInstance(): void {
    CanonicalIdentityService.instance = null;
  }

  private constructor(
    private readonly entityService: IEntityService,
    logger: Logger,
  ) {
    this.logger = logger.child("CanonicalIdentityService");
  }

  public async refreshCache(): Promise<void> {
    let entities: CanonicalIdentityLinkEntity[];
    try {
      entities =
        await this.entityService.listEntities<CanonicalIdentityLinkEntity>({
          entityType: CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
          options: { limit: 10_000 },
        });
    } catch (error) {
      this.links = [];
      this.actorIndex = new Map();
      this.logger.warn("Failed to load canonical identity links", { error });
      return;
    }

    const links = entities.map((entity) =>
      this.adapter.parseLinkBody(entity.content),
    );
    const actorIndex = this.buildActorIndex(links);

    this.links = links;
    this.actorIndex = actorIndex;
    this.logger.debug("Canonical identity links refreshed", {
      linkCount: links.length,
      actorCount: actorIndex.size,
    });
  }

  public getLinks(): CanonicalIdentityLink[] {
    return this.links;
  }

  public resolveActor(actorId: string): CanonicalIdentityResolution | null {
    return this.actorIndex.get(actorId) ?? null;
  }

  public enrichActor(
    actor: ConversationMessageActor,
  ): ConversationMessageActor {
    if (actor.canonicalId || actor.role !== "user") return actor;
    const resolution = this.resolveActor(actor.actorId);
    if (!resolution) return actor;
    return { ...actor, canonicalId: resolution.canonicalId };
  }

  public async validateLink(
    entity: CanonicalIdentityLinkEntity,
    _context: { operation: "create" | "update" },
  ): Promise<void> {
    const candidate = this.adapter.parseLinkBody(entity.content);
    const existingEntities =
      await this.entityService.listEntities<CanonicalIdentityLinkEntity>({
        entityType: CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
        options: { limit: 10_000 },
      });

    const candidateActorIds = new Set(
      candidate.actors.map((actor) => actor.actorId),
    );

    for (const otherEntity of existingEntities) {
      if (otherEntity.id === entity.id) continue;
      const other = this.adapter.parseLinkBody(otherEntity.content);
      for (const actor of other.actors) {
        if (candidateActorIds.has(actor.actorId)) {
          throw new Error(
            `Cannot persist canonical identity link ${candidate.canonicalId}: actorId ${actor.actorId} is already claimed by ${other.canonicalId}`,
          );
        }
      }
    }
  }

  private buildActorIndex(
    links: CanonicalIdentityLink[],
  ): Map<string, CanonicalIdentityResolution> {
    const actorIndex = new Map<string, CanonicalIdentityResolution>();

    for (const link of links) {
      for (const actor of link.actors) {
        const existing = actorIndex.get(actor.actorId);
        if (existing) {
          this.logger.error(
            "Duplicate canonical identity actor id in cache; keeping first match (invariant should be enforced at write time)",
            {
              actorId: actor.actorId,
              keptCanonicalId: existing.canonicalId,
              droppedCanonicalId: link.canonicalId,
            },
          );
          continue;
        }

        actorIndex.set(actor.actorId, {
          ...link,
          matchedActor: actor,
        });
      }
    }

    return actorIndex;
  }
}
