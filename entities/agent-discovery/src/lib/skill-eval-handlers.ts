import type { ServiceRuntime } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import type { AgentContext } from "./agent-context";
import { SKILL_DERIVATION_PROJECTION_ID, SKILL_ENTITY_TYPE } from "./constants";

const deriveInputSchema = z.object({
  topicTitles: z.array(z.string()),
});

/** Every record of a type, removed, so an eval case starts from its own. */
async function clearEvalEntities(
  context: Pick<AgentContext, "entityService">,
  entityType: string,
): Promise<void> {
  const entities = await context.entityService.listEntities({ entityType });
  await Promise.all(
    entities.map((entity) =>
      context.entityService.deleteEntity({ entityType, id: entity.id }),
    ),
  );
}

/**
 * `skill:deriveSkills`: seed a case's topics and measure the production
 * skill-derivation rule against them, as production runs it: what it would
 * create, update and delete, and the skills it would write.
 */
export function registerSkillEvalHandlers(
  runtime: Pick<ServiceRuntime, "evalHandler" | "runProjectionRule">,
  context: Pick<AgentContext, "entityService">,
): void {
  runtime.evalHandler("deriveSkills", async (input: unknown) => {
    const parsed = deriveInputSchema.parse(input);

    await clearEvalEntities(context, "topic");
    await clearEvalEntities(context, SKILL_ENTITY_TYPE);

    // The topics the rule reads, as a case names them.
    for (const title of parsed.topicTitles) {
      const id = title.toLowerCase().replace(/\s+/g, "-");
      const content = `---\ntitle: ${title}\nkeywords: []\n---\n${title}`;
      try {
        await context.entityService.createEntity({
          entity: { id, entityType: "topic", content, metadata: {} },
        });
      } catch {
        // A topic two titles name alike is created once.
      }
    }

    const intents = await runtime.runProjectionRule(
      SKILL_DERIVATION_PROJECTION_ID,
    );
    const upserts = intents.flatMap((intent) =>
      intent.operation === "upsert" ? [intent.entity] : [],
    );
    return {
      // The case's brain holds no skills, so every skill the rule writes
      // is one it creates.
      created: upserts.length,
      updated: 0,
      deleted: intents.filter(({ operation }) => operation === "delete").length,
      skills: upserts.map((skill) => skill.metadata),
    };
  });
}
