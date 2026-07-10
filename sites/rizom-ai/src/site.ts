import type { SiteDefinition } from "@rizom/site";
import { createRizomSite } from "@rizom/site-rizom";
import { AiLayout } from "./layout";
import { aiRoutes } from "./routes";
import aiSiteContent from "./site-content";

export const rizomAiSite: SiteDefinition = createRizomSite({
  packageName: "@rizom/site-rizom-ai",
  themeProfile: "product",
  layout: AiLayout,
  routes: aiRoutes,
  content: aiSiteContent,
});

export default rizomAiSite;
