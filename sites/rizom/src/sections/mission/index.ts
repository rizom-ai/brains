import { createTemplate } from "@brains/templates";
import { MissionContentSchema, type MissionContent } from "./schema";
import { MissionLayout } from "./layout";

export { MissionLayout, MissionContentSchema, type MissionContent };

export const missionTemplate = createTemplate<MissionContent>({
  name: "mission",
  description:
    "Rizom mission section — centered manifesto with highlighted tagline",
  schema: MissionContentSchema,
  requiredPermission: "public",
  layout: { component: MissionLayout },
});
