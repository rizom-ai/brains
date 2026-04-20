import type { EntityPluginContext, JobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { SwotAdapter } from "../adapters/swot-adapter";
import {
  swotDerivationJobSchema,
  swotGenerationSchema,
  type SwotDerivationJobData,
  type SwotGeneration,
  type SwotItem,
} from "../schemas/swot";
import { buildSwotContext } from "../lib/swot-context";

function buildPrompt(
  contextData: Awaited<ReturnType<typeof buildSwotContext>>,
): string {
  return `You are writing a concise SWOT analysis for a brain's agent directory.

Use ONLY the supplied directory context.

Rules:
- Strengths: depth, redundancy, or strong approved external coverage
- Weaknesses: local capabilities with thin or no approved external backup
- Opportunities: useful adjacent capabilities approved agents bring that the brain does not currently represent locally
- Threats: pending review backlog, single points of failure, or over-reliance on tentative coverage
- Prefer claims supported by multiple approved sources
- Treat discovered agents as tentative, mostly relevant to threats
- Do not mention capabilities outside the supplied context
- Prefer capability-area language over naming specific agents
- Keep each item short and operator-facing
- Return 0-3 items per quadrant
- Avoid repeating the same capability area across quadrants unless the contrast is genuinely useful

Grounded directory context:
${JSON.stringify(contextData, null, 2)}`;
}

function normalizeItems(items: SwotGeneration["strengths"]): SwotItem[] {
  return items.map((item) =>
    item.detail === null
      ? { title: item.title }
      : { title: item.title, detail: item.detail },
  );
}

export class SwotDerivationHandler implements JobHandler<
  string,
  SwotDerivationJobData,
  { entityId: string }
> {
  private readonly adapter = new SwotAdapter();

  constructor(
    private readonly logger: Logger,
    private readonly context: EntityPluginContext,
  ) {}

  validateAndParse(data: unknown): SwotDerivationJobData | null {
    const result = swotDerivationJobSchema.safeParse(data ?? {});
    return result.success ? result.data : null;
  }

  async process(
    _data: SwotDerivationJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<{ entityId: string }> {
    await progressReporter.report({
      progress: 0.2,
      message: "Building SWOT context",
    });
    const contextData = await buildSwotContext(this.context);

    let generated: SwotGeneration;
    const totalInputs =
      contextData.summary.brainSkillCount +
      contextData.summary.approvedAgentCount +
      contextData.summary.discoveredAgentCount;

    if (totalInputs === 0) {
      generated = {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: [],
      };
    } else {
      await progressReporter.report({
        progress: 0.6,
        message: "Synthesizing SWOT analysis",
      });
      const { object } = await this.context.ai.generateObject(
        buildPrompt(contextData),
        swotGenerationSchema,
      );
      generated = swotGenerationSchema.parse(object);
    }

    const derivedAt = new Date().toISOString();
    const content = this.adapter.createSwotContent({
      strengths: normalizeItems(generated.strengths),
      weaknesses: normalizeItems(generated.weaknesses),
      opportunities: normalizeItems(generated.opportunities),
      threats: normalizeItems(generated.threats),
      derivedAt,
    });

    await progressReporter.report({
      progress: 0.9,
      message: "Saving SWOT entity",
    });

    const existing = await this.context.entityService.getEntity<{
      id: string;
      entityType: "swot";
      content: string;
      metadata: { derivedAt: string };
      contentHash: string;
      created: string;
      updated: string;
    }>("swot", "swot");

    if (existing) {
      await this.context.entityService.updateEntity({
        ...existing,
        content,
        metadata: { derivedAt },
      });
    } else {
      await this.context.entityService.createEntity({
        id: "swot",
        entityType: "swot",
        content,
        metadata: { derivedAt },
      });
    }

    this.logger.info("SWOT derivation complete", {
      derivedAt,
      brainSkillCount: contextData.summary.brainSkillCount,
      approvedAgentCount: contextData.summary.approvedAgentCount,
      discoveredAgentCount: contextData.summary.discoveredAgentCount,
    });

    return { entityId: "swot" };
  }
}
