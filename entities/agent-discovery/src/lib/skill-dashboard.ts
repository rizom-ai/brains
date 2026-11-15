import { z } from "@brains/utils/zod";
import { skillEntitySchema } from "../schemas/skill";
import { SKILL_ENTITY_TYPE, SKILLS_WIDGET_ID } from "./constants";
import type {
  ContentVisibility,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { defineDashboardWidget } from "@brains/sdk/services";
import type { AgentContext } from "./agent-context";

type SkillsWidgetDataSchema = z.ZodObject<{
  items: z.ZodArray<z.ZodObject<{ id: z.ZodString; name: z.ZodString }>>;
}>;

const skillsWidgetDataSchema: SkillsWidgetDataSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** The skills the caller may see, for the dashboard. */
export async function buildSkillsWidgetData(
  context: Pick<AgentContext, "entityService">,
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

/**
 * The brain's skills on the Dashboard, as the skill class's built-in widget
 * drew them. Skills are the brain's A2A-advertised capabilities, so they
 * sit alongside Character (persona) in the sidebar rather than in the main
 * corpus column. The full description lives in Studio / A2A.
 */
export function registerSkillsDashboardWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
  context: Pick<AgentContext, "entityService">,
): void {
  runtime.dashboardWidget({
    definition: skillsWidget,
    load: async ({ visibilityScope, signal }) => {
      signal.throwIfAborted();
      return buildSkillsWidgetData(context, visibilityScope);
    },
  });
}
