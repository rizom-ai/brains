import type { BaseEntity, EntityEvalDeclaration } from "@brains/sdk/entities";
import { ProjectionJsonObjectSchema, z } from "@brains/sdk/entities";
import { buildSwotContextFromEntities } from "./swot-context";
import {
  buildDraftPrompt,
  buildDraftPromptFallback,
  buildPromptContext,
  buildRefinementPromptFallback,
} from "./swot-prompts";
import { deriveSwotIntent } from "./swot-projection";
import { swotAdapter } from "../adapters/swot-adapter";

const evalSkillSchema = z.looseObject({ name: z.string() });

const evalInputSchema = z.object({
  skills: z.array(evalSkillSchema).default([]),
  agents: z.array(z.looseObject({ name: z.string() })).default([]),
  identity: z.looseObject({}).optional(),
});

const EPOCH = "1970-01-01T00:00:00.000Z";

/** A skill or agent as the profile builder reads one: metadata only. */
function asEntity(
  entityType: string,
  index: number,
  metadata: Record<string, unknown>,
): BaseEntity {
  return {
    id: `${entityType}-${index}`,
    entityType,
    content: "",
    visibility: "public",
    contentHash: `${entityType}-${index}`,
    created: EPOCH,
    updated: EPOCH,
    metadata,
  };
}

/**
 * Evals for SWOT derivation.
 *
 * Runs `deriveSwotIntent` — the derivation the projection rule runs in
 * production. It used to run SwotDerivationHandler, a second implementation
 * of the same two-stage generation, so a regression in the rule could not
 * have been caught here.
 *
 * Sources are built in memory rather than seeded: an eval's entity access is
 * scoped to the types its package declares, and skills and agents belong to
 * other packages.
 */
export const swotEvals: EntityEvalDeclaration = {
  deriveSwot: async (input, { ai, logger }) => {
    const parsed = evalInputSchema.parse(input ?? {});
    const contextData = buildSwotContextFromEntities({
      skills: parsed.skills.map((skill, index) =>
        asEntity("skill", index, skill),
      ),
      agents: parsed.agents.map((agent, index) =>
        asEntity("agent", index, agent),
      ),
      ...(parsed.identity ? { identity: parsed.identity } : {}),
    });

    const intents = await deriveSwotIntent(
      {
        draftPrompt: buildDraftPrompt(contextData, buildDraftPromptFallback()),
        refinementPrompt: buildRefinementPromptFallback(),
        promptContext: ProjectionJsonObjectSchema.parse(
          buildPromptContext(contextData),
        ),
        totalInputs: parsed.skills.length + parsed.agents.length,
        derivedAt: EPOCH,
        model: "eval",
      },
      { ai, logger },
      new AbortController().signal,
    );

    const upsert = intents.find(
      (intent): intent is Extract<typeof intent, { operation: "upsert" }> =>
        intent.operation === "upsert",
    );
    if (!upsert) throw new Error("SWOT derivation produced no entity");
    return swotAdapter.parseSwotContent(upsert.entity.content).frontmatter;
  },
};
