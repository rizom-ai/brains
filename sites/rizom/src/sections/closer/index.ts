import { createTemplate } from "@brains/templates";
import { CloserContentSchema, type CloserContent } from "./schema";
import { CloserLayout } from "./layout";
import { closerFormatter } from "./formatter";

export const closerTemplate = createTemplate<CloserContent>({
  name: "closer",
  description: "Rizom closer section — final CTA pair",
  schema: CloserContentSchema,
  formatter: closerFormatter,
  requiredPermission: "public",
  layout: { component: CloserLayout },
});
