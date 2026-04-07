import { createTemplate } from "@brains/templates";
import { QuickstartContentSchema, type QuickstartContent } from "./schema";
import { QuickstartLayout } from "./layout";

export { QuickstartLayout, QuickstartContentSchema, type QuickstartContent };

export const quickstartTemplate = createTemplate<QuickstartContent>({
  name: "quickstart",
  description: "Rizom quickstart section — terminal block with install steps",
  schema: QuickstartContentSchema,
  requiredPermission: "public",
  layout: { component: QuickstartLayout },
});
