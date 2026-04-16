import { createTemplate } from "@brains/templates";
import { WorkshopContentSchema, type WorkshopContent } from "./schema";
import { WorkshopLayout } from "./layout";
import { workshopFormatter } from "./formatter";

export const workshopTemplate = createTemplate<WorkshopContent>({
  name: "workshop",
  description: "Rizom workshop section — three-step TMS workshop process",
  schema: WorkshopContentSchema,
  formatter: workshopFormatter,
  requiredPermission: "public",
  layout: { component: WorkshopLayout },
});
