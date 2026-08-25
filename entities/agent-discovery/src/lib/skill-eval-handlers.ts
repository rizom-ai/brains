import { z, type EntityEvalDeclaration } from "@brains/sdk/entities";
import { createSkillProjectionRule } from "./skill-projection";

const deriveInputSchema = z.object({
  topicTitles: z.array(z.string()),
});

/**
 * What skill derivation produces from a known set of topics.
 *
 * Runs the same projection rule production runs. It used to call a second
 * derivation path that only the eval and its own tests reached, so a change
 * to how skills are actually derived moved no number here.
 */
export function skillEvalHandlers(): EntityEvalDeclaration {
  return {
    deriveSkills: async (input, context): Promise<unknown> => {
      const parsed = deriveInputSchema.parse(input);

      await context.fixtures.reset();
      for (const title of parsed.topicTitles) {
        await context.fixtures.seed({
          id: title.toLowerCase().replace(/\s+/g, "-"),
          entityType: "topic",
          content: `---\ntitle: ${title}\nkeywords: []\n---\n${title}`,
        });
      }

      const intents = await context.runProjectionRule(
        createSkillProjectionRule(),
      );
      const upserts = intents.filter((intent) => intent.operation === "upsert");
      return {
        created: upserts.length,
        deleted: intents.length - upserts.length,
        skills: upserts.map((intent) =>
          "entity" in intent ? intent.entity.metadata : {},
        ),
      };
    },
  };
}
