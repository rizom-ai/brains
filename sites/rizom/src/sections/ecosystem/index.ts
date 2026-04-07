import { createTemplate } from "@brains/templates";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";
import { EcosystemLayout } from "./layout";

export { EcosystemLayout, EcosystemContentSchema, type EcosystemContent };

export const ecosystemTemplate = createTemplate<EcosystemContent>({
  name: "ecosystem",
  description:
    "Rizom ecosystem section — 3-card grid linking to ai/foundation/work",
  schema: EcosystemContentSchema,
  requiredPermission: "public",
  layout: { component: EcosystemLayout },
});
