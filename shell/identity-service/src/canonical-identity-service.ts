import type { ConversationMessageActor } from "@brains/conversation-service";
import type { Logger } from "@brains/utils/logger";

export interface CanonicalIdentityActor {
  actorId: string;
  label?: string;
}

export interface CanonicalIdentityLink {
  canonicalId: string;
  displayName?: string;
  actors: CanonicalIdentityActor[];
}

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
}

export class CanonicalIdentityService implements ICanonicalIdentityService {
  private static instance: CanonicalIdentityService | null = null;
  private readonly logger: Logger;
  private links: CanonicalIdentityLink[] = [];
  private actorIndex = new Map<string, CanonicalIdentityResolution>();

  public static getInstance(logger: Logger): CanonicalIdentityService {
    CanonicalIdentityService.instance ??= new CanonicalIdentityService(logger);
    return CanonicalIdentityService.instance;
  }

  public static createFresh(logger: Logger): CanonicalIdentityService {
    return new CanonicalIdentityService(logger);
  }

  public static resetInstance(): void {
    CanonicalIdentityService.instance = null;
  }

  private constructor(logger: Logger) {
    this.logger = logger.child("CanonicalIdentityService");
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
}
