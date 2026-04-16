import { createTemplate } from "@brains/templates";
import { MissionContentSchema, type MissionContent } from "./schema";
import { MissionLayout } from "./layout";
import { missionFormatter } from "./formatter";

export const missionTemplate = createTemplate<MissionContent>({
  name: "mission",
  description: "Rizom mission section — manifesto with highlighted tagline",
  schema: MissionContentSchema,
  formatter: missionFormatter,
  requiredPermission: "public",
  layout: { component: MissionLayout },
});
