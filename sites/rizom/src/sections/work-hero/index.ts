import { createTemplate } from "@brains/templates";
import { WorkHeroContentSchema, type WorkHeroContent } from "./schema";
import { WorkHeroLayout } from "./layout";
import { workHeroFormatter } from "./formatter";

export const workHeroTemplate = createTemplate<WorkHeroContent>({
  name: "work-hero",
  description: "Rizom work hero — split studio intro with diagnostic panel",
  schema: WorkHeroContentSchema,
  formatter: workHeroFormatter,
  requiredPermission: "public",
  layout: { component: WorkHeroLayout },
});
