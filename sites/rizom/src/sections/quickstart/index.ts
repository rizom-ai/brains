import { createTemplate } from "@brains/templates";
import { QuickstartContentSchema, type QuickstartContent } from "./schema";
import { QuickstartLayout } from "./layout";
import { QuickstartFormatter } from "./formatter";

export {
  QuickstartLayout,
  QuickstartContentSchema,
  QuickstartFormatter,
  type QuickstartContent,
};

export const quickstartTemplate = createTemplate<QuickstartContent>({
  name: "quickstart",
  description: "Rizom quickstart section — install steps + terminal block",
  schema: QuickstartContentSchema,
  formatter: new QuickstartFormatter(),
  requiredPermission: "public",
  layout: { component: QuickstartLayout },
});
