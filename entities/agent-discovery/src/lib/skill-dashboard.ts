import {
  defineDashboardWidget,
  defineEntityDashboardWidget,
  z,
  type EntityDashboardWidgetDeclaration,
} from "@brains/sdk/entities";

import { skillEntitySchema } from "../schemas/skill";
import { SKILL_ENTITY_TYPE, SKILLS_WIDGET_ID } from "./constants";

const skillsWidgetDataSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const skillsWidget = defineDashboardWidget({
  id: SKILLS_WIDGET_ID,
  title: "Skills",
  group: "network",
  placement: "sidebar",
  priority: 20,
  permission: "public",
  data: skillsWidgetDataSchema,
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "skills",
        empty: "No skills advertised yet.",
        items: data.items.map((skill) => ({
          id: skill.id,
          title: skill.name,
        })),
      },
    ],
  }),
});

// Skills are the brain's A2A-advertised capabilities, so they sit alongside
// Character (persona) in the sidebar rather than in the main corpus column.
// The full description lives in Studio / A2A.
export const skillsWidgetDeclaration: EntityDashboardWidgetDeclaration =
  defineEntityDashboardWidget(skillsWidget, async ({ entities, signal }) => {
    signal.throwIfAborted();
    const skills = await entities.listEntities(
      {
        entityType: SKILL_ENTITY_TYPE,
        options: { limit: 10 },
      },
      skillEntitySchema,
    );
    signal.throwIfAborted();
    return {
      items: skills.map((skill) => ({
        id: skill.id,
        name: skill.metadata.name,
      })),
    };
  });
