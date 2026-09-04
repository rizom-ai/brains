import type { MessageSender, ServiceEntityService } from "@brains/plugins";
import type { SiteContentResolutionOptions } from "./site-content-contracts";
import type { SiteViewTemplate } from "./site-view-template";

export interface SiteBuilderServices {
  entityService: ServiceEntityService;
  sendMessage: MessageSender;
  /** Resolved against the template's own schema; callers narrow what they read. */
  resolveTemplateContent: (
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<unknown>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  listViewTemplateNames: () => string[];
}
