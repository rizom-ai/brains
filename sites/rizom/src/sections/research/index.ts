import { createTemplate } from "@brains/templates";
import { ResearchContentSchema, type ResearchContent } from "./schema";
import { ResearchLayout } from "./layout";
import { researchFormatter } from "./formatter";

export const researchTemplate = createTemplate<ResearchContent>({
  name: "research",
  description: "Rizom research section — editorial essay index",
  schema: ResearchContentSchema,
  formatter: researchFormatter,
  requiredPermission: "public",
  layout: { component: ResearchLayout },
});
