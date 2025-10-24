export { footerCTASchema, type FooterCTAContent } from "./schema";
export { FooterCTALayout } from "./layout";
export { FooterCTAFormatter } from "./formatter";

import { footerCTASchema, type FooterCTAContent } from "./schema";
import { FooterCTALayout } from "./layout";
import { FooterCTAFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

export const footerCTATemplate = createTemplate<FooterCTAContent>({
  name: "footer-cta",
  description: "Call-to-action footer section",
  schema: footerCTASchema,
  basePrompt: "", // No AI generation needed
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  formatter: new FooterCTAFormatter(),
  layout: {
    component: FooterCTALayout,
    interactive: false,
  },
});
