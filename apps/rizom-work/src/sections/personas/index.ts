import { createTemplate } from "@brains/templates";
import { PersonasContentSchema, type PersonasContent } from "./schema";
import { PersonasLayout } from "./layout";
import { personasFormatter } from "./formatter";

export const personasTemplate = createTemplate<PersonasContent>({
  name: "personas",
  description: "Rizom personas section — who the workshop is for",
  schema: PersonasContentSchema,
  formatter: personasFormatter,
  requiredPermission: "public",
  layout: { component: PersonasLayout },
});
