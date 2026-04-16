import { createTemplate } from "@brains/templates";
import { QuickstartContentSchema, type QuickstartContent } from "./schema";
import { QuickstartLayout } from "./layout";
import { quickstartFormatter } from "./formatter";

export const quickstartTemplate = createTemplate<QuickstartContent>({
  name: "quickstart",
  description: "Rizom quickstart section — install steps + terminal block",
  schema: QuickstartContentSchema,
  formatter: quickstartFormatter,
  requiredPermission: "public",
  layout: { component: QuickstartLayout },
});
