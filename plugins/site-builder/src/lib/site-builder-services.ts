import type {
  ServiceClassMessaging,
  ServiceEntityReads,
} from "@brains/sdk/internal/service-runtime";
import type { SiteContentResolutionOptions } from "./site-content-contracts";
import type { SiteViewTemplate } from "./site-view-template";

/** The entity reads a build makes, at the scope each read names. */
export type SiteEntityReads = Pick<
  ServiceEntityReads,
  "getEntityTypes" | "listEntities" | "getEntity"
>;

export interface SiteBuilderServices {
  entityService: SiteEntityReads;
  /** Sends the staging command extensions write their artifacts on. */
  command: ServiceClassMessaging["command"];
  /** Resolved against the template's own schema; callers narrow what they read. */
  resolveTemplateContent: (
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<unknown>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  /** Whether site-content is saved under an id (`zh-tw:home:cover`). */
  hasSavedContent: (id: string) => Promise<boolean>;
  listViewTemplateNames: () => string[];
}
