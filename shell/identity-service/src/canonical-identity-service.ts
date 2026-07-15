import { actorRefKey, type ActorRef } from "@brains/contracts";
import type { ConversationMessageActor } from "@brains/conversation-service";
import type { Logger } from "@brains/utils/logger";

export interface CanonicalIdentityActor {
  identity: ActorRef;
  label?: string;
}

export interface CanonicalIdentityLink {
  userId: string;
  canonicalId: string;
  displayName?: string;
  actors: CanonicalIdentityActor[];
}

export interface CanonicalIdentityResolution extends CanonicalIdentityLink {
  matchedActor: CanonicalIdentityActor;
}

export interface CanonicalIdentityLookup {
  userId: string;
  canonicalId: string;
  displayName?: string;
}

export type CanonicalIdentityResolver = (
  actor: ActorRef,
) => Promise<CanonicalIdentityLookup | null>;

export interface ICanonicalIdentityService {
  refreshCache(): Promise<void>;
  getLinks(): CanonicalIdentityLink[];
  resolveActor(actor: ActorRef): CanonicalIdentityResolution | null;
  /**
   * Return the actor with `canonicalId` filled in when a link exists. Returns
   * the actor unchanged when enrichment doesn't apply (already canonical, no
   * matching link, or non-user role).
   */
  enrichActor(
    actor: ConversationMessageActor,
  ): Promise<ConversationMessageActor>;
}

export class CanonicalIdentityService implements ICanonicalIdentityService {
  private static instance: CanonicalIdentityService | null = null;
  private readonly logger: Logger;
  private resolver: CanonicalIdentityResolver | undefined;
  private links: CanonicalIdentityLink[] = [];
  private actorIndex = new Map<string, CanonicalIdentityResolution>();

  public static getInstance(
    logger: Logger,
    resolver?: CanonicalIdentityResolver,
  ): CanonicalIdentityService {
    CanonicalIdentityService.instance ??= new CanonicalIdentityService(
      logger,
      resolver,
    );
    if (resolver) {
      CanonicalIdentityService.instance.resolver = resolver;
    }
    return CanonicalIdentityService.instance;
  }

  public static createFresh(
    logger: Logger,
    resolver?: CanonicalIdentityResolver,
  ): CanonicalIdentityService {
    return new CanonicalIdentityService(logger, resolver);
  }

  public static resetInstance(): void {
    CanonicalIdentityService.instance = null;
  }

  private constructor(logger: Logger, resolver?: CanonicalIdentityResolver) {
    this.logger = logger.child("CanonicalIdentityService");
    this.resolver = resolver;
  }

  public async refreshCache(): Promise<void> {
    this.links = [];
    this.actorIndex = new Map();
    this.logger.debug("Canonical identity links refreshed", {
      linkCount: 0,
      actorCount: 0,
    });
  }

  public getLinks(): CanonicalIdentityLink[] {
    return this.links;
  }

  public resolveActor(actor: ActorRef): CanonicalIdentityResolution | null {
    return this.actorIndex.get(actorRefKey(actor)) ?? null;
  }

  public async enrichActor(
    actor: ConversationMessageActor,
  ): Promise<ConversationMessageActor> {
    if (
      (actor.identity.kind === "user" && actor.identity.canonicalId) ||
      actor.role !== "user"
    ) {
      return actor;
    }
    const cachedResolution = this.resolveActor(actor.identity);
    if (cachedResolution) {
      return {
        ...actor,
        identity: {
          kind: "user",
          userId: cachedResolution.userId,
          canonicalId: cachedResolution.canonicalId,
        },
      };
    }
    const resolution = await this.resolver?.(actor.identity);
    return resolution
      ? {
          ...actor,
          identity: {
            kind: "user",
            userId: resolution.userId,
            canonicalId: resolution.canonicalId,
          },
          ...(resolution.displayName
            ? { displayName: resolution.displayName }
            : {}),
        }
      : actor;
  }
}
