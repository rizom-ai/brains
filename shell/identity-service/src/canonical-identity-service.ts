import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
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

  private buildActorIndex(
    links: CanonicalIdentityLink[],
  ): Map<string, CanonicalIdentityResolution> {
    const actorIndex = new Map<string, CanonicalIdentityResolution>();

    for (const link of links) {
      for (const actor of link.actors) {
        const existing = actorIndex.get(actor.actorId);
        if (existing) {
          throw new Error(
            `Duplicate canonical identity actor id ${actor.actorId} in ${existing.canonicalId} and ${link.canonicalId}`,
          );
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
