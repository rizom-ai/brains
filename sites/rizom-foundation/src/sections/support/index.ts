import { createTemplate } from "@brains/templates";
import { SupportContentSchema, type SupportContent } from "./schema";
import { SupportLayout } from "./layout";
import { supportFormatter } from "./formatter";

export const supportTemplate = createTemplate<SupportContent>({
  name: "support",
  description: "Rizom support section — two-card funding/support grid",
  schema: SupportContentSchema,
  formatter: supportFormatter,
  requiredPermission: "public",
  layout: { component: SupportLayout },
});
