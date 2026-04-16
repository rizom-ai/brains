import { createRizomSite } from "@brains/site-rizom";
import { AiLayout } from "./layout";
import { aiRoutes } from "./routes";
import { aiTemplates } from "./templates";

export default createRizomSite({
  packageName: "rizom-ai-site",
  variant: "ai",
  layout: AiLayout,
  routes: aiRoutes,
  templates: aiTemplates,
});
