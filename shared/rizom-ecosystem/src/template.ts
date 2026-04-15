import { createTemplate } from "@brains/templates";
import { ecosystemFormatter } from "./formatter";
import { EcosystemLayout } from "./layout";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";

export const ecosystemTemplate = createTemplate<EcosystemContent>({
  name: "ecosystem",
  description: "Rizom ecosystem section — 3-card grid of sibling rizom sites",
  schema: EcosystemContentSchema,
  formatter: ecosystemFormatter,
  requiredPermission: "public",
  layout: { component: EcosystemLayout },
});
