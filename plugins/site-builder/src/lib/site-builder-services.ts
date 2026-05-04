import type {
  SiteContentEntityService,
  SiteContentResolutionOptions,
  SiteMessageSender,
} from "./site-content-contracts";
import type { SiteViewTemplate } from "./site-view-template";

export interface SiteBuilderServices {
  entityService: SiteContentEntityService;
  sendMessage: SiteMessageSender;
  resolveTemplateContent: <T = unknown>(
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<T | null>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  listViewTemplateNames: () => string[];
}
