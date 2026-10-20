import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type ContentVisibility,
  type EntityPluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { skillEntitySchema } from "../schemas/skill";
import { SKILL_ENTITY_TYPE, SKILLS_WIDGET_ID } from "./constants";

type SkillsWidgetDataSchema = z.ZodObject<{
  items: z.ZodArray<z.ZodObject<{ id: z.ZodString; name: z.ZodString }>>;
}>;

const skillsWidgetDataSchema: SkillsWidgetDataSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** The skills the caller may see, for the dashboard. */
export async function buildSkillsWidgetData(
  context: Pick<EntityPluginContext, "entityService">,
  visibilityScope: ContentVisibility,
): Promise<z.input<typeof skillsWidgetDataSchema>> {
  const skills = await context.entityService.listEntities(
    {
      entityType: SKILL_ENTITY_TYPE,
      options: { limit: 10, filter: { visibilityScope } },
    },
    skillEntitySchema,
  );
  return {
    items: skills.map((skill) => ({
      id: skill.id,
      name: skill.metadata.name,
    })),
  };
}

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

export function registerSkillsDashboardWidget(
  context: EntityPluginContext,
): void {
  // Skills are the brain's A2A-advertised capabilities, so they sit
  // alongside Character (persona) in the sidebar rather than in the
  // main corpus column. The full description lives in Studio / A2A.
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: skillsWidget,
        load: async ({ visibilityScope, signal }) => {
          signal.throwIfAborted();
          return buildSkillsWidgetData(context, visibilityScope);
        },
      });
      return { success: true };
    },
  );
}
