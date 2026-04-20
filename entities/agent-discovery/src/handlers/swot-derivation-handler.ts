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
import { buildSwotContext, type SwotContext } from "../lib/swot-context";

function buildPromptContext(contextData: SwotContext): Record<string, unknown> {
  return {
    summary: contextData.summary,
    yourSkills: contextData.brainSkills.map((skill) => ({
      name: skill.name,
      tags: skill.tags,
      networkReinforcement:
        skill.approvedCoverageCount >= 2
          ? "strong"
          : skill.approvedCoverageCount === 1
            ? "thin"
            : "none",
      reinforcedBy: skill.approvedCoverageAgents,
    })),
    networkSkills: {
      approved: contextData.approvedAgents.flatMap((agent) =>
        agent.skills.map((skill) => ({
          name: skill.name,
          tags: skill.tags,
          confidence: "approved",
        })),
      ),
      tentative: contextData.discoveredAgents.flatMap((agent) =>
        agent.skills.map((skill) => ({
          name: skill.name,
          tags: skill.tags,
          confidence: "tentative",
        })),
      ),
    },
    hints: contextData.hints,
  };
}

function buildPromptFallback(): string {
  return `You are writing a concise SWOT analysis for a brain's agent directory.

Use ONLY the supplied directory context.

Goal:
Produce actionable advice for the brain owner about their own skills and their network's skills.
Write like a trusted advisor, not like an internal diagnostics panel.

Quadrant rules:
- Strengths: skills the person already has, especially where the network reinforces them
- Weaknesses: skills the person lacks or can only support thinly
- Opportunities: skills the network has that the person could learn from, collaborate on, or test next
- Threats: places where the person's work could stall because they or their network are too thin, too tentative, or too dependent on one path

Decision rules:
- Prefer claims supported by multiple approved signals in the supplied context
- If a skill is reinforced by only one dependable network match, treat it as thin backup rather than fully secure support
- Treat discovered agents as tentative evidence only; use status only when it changes confidence or next action
- Never describe tentative network skill as fully dependable
- Prefer capability-area language over naming specific agents
- Do not mention capabilities outside the supplied context
- Avoid generic business phrases like "strong market position", "competitive advantage", or "growth opportunity"
- Avoid system jargon such as "route", "routing", "coverage", "source count", "tag overlap", "brain skill", or "approved coverage"
- Avoid repeating the same capability pattern across quadrants unless the contrast is genuinely useful
- Do not restate the same capability as both a weakness and a threat unless the threat is a distinct systemic risk, not the same thin-backup observation repeated
- Do not restate the same capability as both a strength and an opportunity unless the opportunity is a clearly different adjacent move
- If two candidate items say nearly the same thing, keep the sharper one and replace the other with a different capability pattern
- Prefer distinct coverage across the four quadrants over filling every slot
- Before writing, choose up to four DISTINCT themes first, then map them to quadrants. Reuse a theme only if the contrast is truly different and necessary.
- Use this priority order when distinct themes exist:
  1. one real own-skill strength
  2. one real own-skill gap or thin area
  3. one network-only adjacent skill worth testing or learning from
  4. one tentative network skill or broader stall risk
- If a tentative adjacent skill exists, prefer mentioning it once rather than adding another item about an already-covered strength
- Opportunity themes should usually come from skills the network has and the owner does not yet clearly have
- Threat themes should usually come from tentative skills, missing complements, or broader stall risk — not just a second restatement of a weakness item
- Do not use an opportunity slot for a skill the owner already clearly has unless the move is genuinely different from the existing strength
- Verify each capability claim against the supplied context before writing: do not call a dependable network skill tentative, and do not call a tentative network skill dependable

Output style:
- Return 0-3 items per quadrant
- title: short skill/risk label only
- detail: one concise sentence that includes BOTH:
  1. the grounded pattern in plain language about you or your network
  2. the practical implication, recommendation, or next move
- The detail should sound like advice to the owner, using "you" or "your network" when natural
- If you can only say something useful by repeating an earlier theme, leave the extra slot empty instead
- Good detail examples:
  - "You are already strong in research, and your network reinforces it, so this is safe to position as a core strength."
  - "You do not yet have dependable analysis support, so avoid overcommitting here until you build it or add a trusted collaborator."
  - "Your network shows tentative video skill, so review it before you rely on it or invest in that direction."`;
}

async function buildPrompt(
  context: EntityPluginContext,
  contextData: SwotContext,
): Promise<string> {
  const promptContext = buildPromptContext(contextData);
  const basePrompt = await context.prompts.resolve(
    "agent-discovery:swot-derivation",
    buildPromptFallback(),
  );

  return `${basePrompt}

Grounded directory context:
${JSON.stringify(promptContext, null, 2)}`;
}

function buildRefinementPromptFallback(): string {
  return `You are refining a SWOT draft for a brain owner.

Goal:
Turn the draft into clear advice about the owner's own skills and their network's skills.

Refinement rules:
- Keep only the strongest, most actionable items
- Remove repeated themes unless the contrast is genuinely different and useful
- Prefer distinct themes across quadrants
- Use plain advisory language for the owner
- Prefer phrasing like "you" and "your network" when natural
- Remove system/internal jargon such as route, routing, coverage, source count, tag overlap, or similar diagnostics language
- Keep status language only when it changes confidence or the next step
- If an item is weak, repetitive, or generic, drop it instead of rewording it
- Keep the output concise and decision-oriented

Output rules:
- Return 0-3 items per quadrant
- title: short skill/risk label only
- detail: one sentence with the practical implication or recommendation
- Do not invent new capabilities beyond the supplied draft and context`;
}

async function buildRefinementPrompt(
  context: EntityPluginContext,
  contextData: SwotContext,
  draft: SwotGeneration,
): Promise<string> {
  const promptContext = buildPromptContext(contextData);
  const basePrompt = await context.prompts.resolve(
    "agent-discovery:swot-refinement",
    buildRefinementPromptFallback(),
  );

  return `${basePrompt}

Context:
${JSON.stringify(promptContext, null, 2)}

Draft SWOT:
${JSON.stringify(draft, null, 2)}`;
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
        await buildPrompt(this.context, contextData),
        swotGenerationSchema,
      );
      const draft = swotGenerationSchema.parse(object);

      await progressReporter.report({
        progress: 0.75,
        message: "Refining SWOT language",
      });

      const refined = await this.context.ai.generateObject(
        await buildRefinementPrompt(this.context, contextData, draft),
        swotGenerationSchema,
      );
      generated = swotGenerationSchema.parse(refined.object);
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
