import type { ServicePublisher } from "@brains/sdk/services";
import type { BaseEntity, ListOptions } from "@brains/sdk/entities";
import type { SiteContentResolutionOptions } from "./site-content-contracts";
import type { SiteViewTemplate } from "./site-view-template";

/**
 * The reads a build makes of the brain's records.
 *
 * A site renders types other packages own, so these are reads across the
 * whole corpus. A build writes files, never entities, which is why there is
 * nothing here that could change one.
 */
export interface SiteEntityReads {
  getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null>;
  listEntities(request: {
    entityType: string;
    options?: ListOptions | undefined;
  }): Promise<BaseEntity[]>;
  getEntityTypes(): string[];
}

export interface SiteBuilderServices {
  entityService: SiteEntityReads;
  sendMessage: ServicePublisher["send"];
  /** Announcing, for the staging hand-off every listener may act on. */
  publishMessage: ServicePublisher["publish"];
  /** Resolved against the template's own schema; callers narrow what they read. */
  resolveTemplateContent: (
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<unknown>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  listViewTemplateNames: () => string[];
}
