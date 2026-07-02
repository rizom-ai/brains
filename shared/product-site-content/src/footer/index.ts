export { FooterLayout } from "./layout";
export { FooterSchema, type FooterData } from "./schema";

import { FooterSchema, type FooterData } from "./schema";
import { FooterLayout } from "./layout";
import { createTemplate, type Template } from "@brains/templates";

export const footerTemplate: Template = createTemplate<FooterData>({
  name: "footer",
  description: "Footer section with navigation links",
  schema: FooterSchema,
  dataSourceId: "site:navigation", // Navigation data from site builder
  requiredPermission: "public",
  // No formatter needed - footer data is never stored, always dynamic from DataSource
  layout: {
    component: FooterLayout,
  },
});
