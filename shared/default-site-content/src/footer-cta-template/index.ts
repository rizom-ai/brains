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
  basePrompt: `Generate a compelling call-to-action for the footer section.
Include a powerful heading that encourages action, button text that is clear and actionable, and a button link (use # for anchor links or full URLs).
The CTA should align with the brain's purpose and motivate users to engage.`,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  formatter: new FooterCTAFormatter(),
  layout: {
    component: FooterCTALayout,
    interactive: false,
  },
});
