import { createTemplate } from "@brains/plugins";
import { Ecosystem } from "@rizom/ui";
import { ecosystemContentSchema } from "../schemas/ecosystem-section";
import { formatEcosystemContent, parseEcosystemContent } from "../lib";

export const ecosystemTemplate = createTemplate({
  name: "ecosystem",
  description: "Rizom ecosystem sibling-site section",
  schema: ecosystemContentSchema,
  formatter: {
    parse: parseEcosystemContent,
    format: formatEcosystemContent,
  },
  dataSourceId: "rizom-ecosystem:entities",
  requiredPermission: "public",
  layout: { component: Ecosystem },
});
