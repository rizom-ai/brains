import type { EntityPluginContext } from "@brains/plugins";
import type { SkillEntity } from "../schemas/skill";
import { SKILL_ENTITY_TYPE, SKILLS_WIDGET_ID } from "./constants";

export function registerSkillsDashboardWidget(
  context: EntityPluginContext,
  pluginId: string,
): void {
  // Skills are the brain's A2A-advertised capabilities, so they sit
  // alongside Character (persona) in the sidebar rather than in the
  // main corpus column. The full description lives in CMS / A2A.
  context.messaging.subscribe(
    "system:plugins:ready",
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: SKILLS_WIDGET_ID,
          pluginId,
          title: "Skills",
          section: "sidebar",
          priority: 20,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const skills =
              await context.entityService.listEntities<SkillEntity>({
                entityType: SKILL_ENTITY_TYPE,
                options: { limit: 10 },
              });

            return {
              items: skills.map((s) => ({
                id: s.id,
                name: s.metadata.name,
              })),
            };
          },
        },
      });
      return { success: true };
    },
  );
}
