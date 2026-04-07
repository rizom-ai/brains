import { createTemplate } from "@brains/templates";
import { MissionContentSchema, type MissionContent } from "./schema";
import { MissionLayout } from "./layout";
import { MissionFormatter } from "./formatter";

export {
  MissionLayout,
  MissionContentSchema,
  MissionFormatter,
  type MissionContent,
};

export const missionTemplate = createTemplate<MissionContent>({
  name: "mission",
  description: "Rizom mission section — manifesto with highlighted tagline",
  schema: MissionContentSchema,
  formatter: new MissionFormatter(),
  requiredPermission: "public",
  layout: { component: MissionLayout },
});
