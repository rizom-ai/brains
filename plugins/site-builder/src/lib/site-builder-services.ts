import type { IEntityService, MessageSender } from "@brains/plugins";
import type { SiteContentResolutionOptions } from "./site-content-contracts";
import type { SiteViewTemplate } from "./site-view-template";

export interface SiteBuilderServices {
  entityService: IEntityService;
  sendMessage: MessageSender;
  resolveTemplateContent: <T = unknown>(
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<T | null>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  listViewTemplateNames: () => string[];
}
