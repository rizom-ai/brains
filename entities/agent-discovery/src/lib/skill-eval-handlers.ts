import type { EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { SKILL_ENTITY_TYPE } from "./constants";
import { deriveSkills } from "./skill-deriver";

const deriveInputSchema = z.object({
  topicTitles: z.array(z.string()),
});

export function registerSkillEvalHandlers(
  context: EntityPluginContext,
  logger: Logger,
): void {
  context.eval.registerHandler("deriveSkills", async (input: unknown) => {
    const parsed = deriveInputSchema.parse(input);

    // Create mock topic entities so deriveSkills can read them.
    for (const title of parsed.topicTitles) {
      const id = title.toLowerCase().replace(/\s+/g, "-");
      const content = `---\ntitle: ${title}\nkeywords: []\n---\n${title}`;
      try {
        await context.entityService.createEntity({
          entity: {
            id,
            entityType: "topic",
            content,
            metadata: {},
          },
        });
      } catch {
        // Topic may already exist.
      }
    }

    const result = await deriveSkills(context, logger);
    const skills = await context.entityService.listEntities({
      entityType: SKILL_ENTITY_TYPE,
    });

    return {
      ...result,
      skills: skills.map((s) => s.metadata),
    };
  });
}
