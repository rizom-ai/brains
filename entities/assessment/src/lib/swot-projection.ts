import {
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  type BaseEntity,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { SwotAdapter } from "../adapters/swot-adapter";
import {
  buildDraftPrompt,
  buildDraftPromptFallback,
  buildPromptContext,
  buildRefinementPromptFallback,
  buildRefinementPromptFromContext,
  getSemanticContent,
  validateRefinement,
} from "../handlers/swot-derivation-handler";
import {
  swotDraftGenerationSchema,
  swotGenerationSchema,
} from "../schemas/swot-generation";
import { buildSwotContextFromEntities } from "./swot-context";

const identitySchema = z.looseObject({
  brainName: z.string().optional(),
  role: z.string().optional(),
  purpose: z.string().optional(),
  profileName: z.string().optional(),
  profileDescription: z.string().optional(),
  profileCategory: z.enum(["person", "team", "organization"]).optional(),
});

const swotProjectionInputSchema = z.object({
  draftPrompt: z.string(),
  refinementPrompt: z.string(),
  promptContext: ProjectionJsonObjectSchema,
  totalInputs: z.number().int().nonnegative(),
  derivedAt: z.string().datetime(),
  model: z.string(),
});

type SwotProjectionInput = z.output<typeof swotProjectionInputSchema>;

function latestSourceUpdate(entities: readonly BaseEntity[]): string {
  return (
    entities
      .map((entity) => entity.updated)
      .sort()
      .at(-1) ?? "1970-01-01T00:00:00.000Z"
  );
}

async function selectSwotInput(
  context: Parameters<ProjectionRule["selectInput"]>[1],
): Promise<SwotProjectionInput> {
  const [agents, skills, draftPromptBase, refinementPrompt, appInfo] =
    await Promise.all([
      context.entities.listEntities({
        entityType: "agent",
        options: { limit: 1000 },
      }),
      context.entities.listEntities({
        entityType: "skill",
        options: { limit: 1000 },
      }),
      context.resolvePrompt(
        "assessment:swot-derivation",
        buildDraftPromptFallback(),
      ),
      context.resolvePrompt(
        "assessment:swot-refinement",
        buildRefinementPromptFallback(),
      ),
      context.appInfo(),
    ]);
  const sourceEntities = [...agents, ...skills].sort(
    (left, right) =>
      left.entityType.localeCompare(right.entityType) ||
      left.id.localeCompare(right.id),
  );
  const parsedIdentity = identitySchema.parse(context.identityInput());
  const identity = {
    ...(parsedIdentity.brainName !== undefined
      ? { brainName: parsedIdentity.brainName }
      : {}),
    ...(parsedIdentity.role !== undefined ? { role: parsedIdentity.role } : {}),
    ...(parsedIdentity.purpose !== undefined
      ? { purpose: parsedIdentity.purpose }
      : {}),
    ...(parsedIdentity.profileName !== undefined
      ? { profileName: parsedIdentity.profileName }
      : {}),
    ...(parsedIdentity.profileDescription !== undefined
      ? { profileDescription: parsedIdentity.profileDescription }
      : {}),
    ...(parsedIdentity.profileCategory !== undefined
      ? { profileCategory: parsedIdentity.profileCategory }
      : {}),
  };
  const contextData = buildSwotContextFromEntities({
    agents,
    skills,
    identity,
  });

  return {
    draftPrompt: buildDraftPrompt(contextData, draftPromptBase),
    refinementPrompt,
    promptContext: ProjectionJsonObjectSchema.parse(
      buildPromptContext(contextData),
    ),
    totalInputs:
      contextData.summary.brainSkillCount +
      contextData.summary.approvedAgentCount +
      contextData.summary.discoveredAgentCount,
    derivedAt: latestSourceUpdate(sourceEntities),
    model: appInfo.ai.model,
  };
}

async function deriveSwotIntent(
  input: SwotProjectionInput,
  context: Parameters<ProjectionRule["derive"]>[1],
  signal: AbortSignal,
): Promise<readonly ProjectionWriteIntent[]> {
  let generated: z.output<typeof swotGenerationSchema>;
  if (input.totalInputs === 0) {
    generated = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
  } else {
    if (signal.aborted) throw signal.reason;
    const draftResult = await context.ai.generateObject(
      input.draftPrompt,
      swotDraftGenerationSchema,
    );
    const draft = swotDraftGenerationSchema.parse(draftResult.object);
    const refinedResult = await context.ai.generateObject(
      buildRefinementPromptFromContext(
        input.promptContext,
        draft,
        input.refinementPrompt,
      ),
      swotGenerationSchema,
    );
    generated = swotGenerationSchema.parse(refinedResult.object);
    validateRefinement(draft, generated);
  }

  const semantic = getSemanticContent(generated);
  const content = new SwotAdapter().createSwotContent({
    ...semantic,
    derivedAt: input.derivedAt,
  });
  return [
    {
      operation: "upsert",
      entity: {
        id: "swot",
        entityType: "swot",
        content,
        metadata: { derivedAt: input.derivedAt },
        visibility: "public",
      },
    },
  ];
}

export function createSwotProjectionRule(): ProjectionRule {
  return defineProjectionRule({
    id: "swot-derivation",
    version: "1",
    sources: [{ kind: "entity", types: ["agent", "skill"] }],
    targetType: "swot",
    inputSchema: swotProjectionInputSchema,
    selectInput: async (_trigger, context) => selectSwotInput(context),
    derive: deriveSwotIntent,
  });
}
