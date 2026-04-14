import { createTemplate } from "@brains/templates";
import { ProofContentSchema, type ProofContent } from "./schema";
import { ProofLayout } from "./layout";
import { proofFormatter } from "./formatter";

export const proofTemplate = createTemplate<ProofContent>({
  name: "proof",
  description: "Rizom proof section — testimonial and partners",
  schema: ProofContentSchema,
  formatter: proofFormatter,
  requiredPermission: "public",
  layout: { component: ProofLayout },
});
