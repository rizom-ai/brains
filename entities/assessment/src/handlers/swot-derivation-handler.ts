import type { EntityPluginContext, JobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { SwotAdapter } from "../adapters/swot-adapter";
import {
  swotDerivationJobSchema,
  swotDraftGenerationSchema,
  swotGenerationSchema,
  type SwotDerivationJobData,
  type SwotDraftGeneration,
  type SwotGeneration,
  type SwotItem,
} from "../schemas/swot";
import { buildSwotContext, type SwotContext } from "../lib/swot-context";

function normalizeSkillText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenizeSkillText(value: string): string[] {
  return Array.from(
    new Set(
      normalizeSkillText(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4),
    ),
  );
}

function collectOverlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter(
    (value, index) => rightSet.has(value) && left.indexOf(value) === index,
  );
}

function getMatchSignals(
  ownerSkill: { name: string; description: string; tags: string[] },
  networkSkill: { name: string; description: string; tags: string[] },
): {
  score: number;
  sharedTags: string[];
  sharedNameWords: string[];
  sharedDescriptionWords: string[];
} {
  const sharedTags = collectOverlap(
    ownerSkill.tags.map(normalizeSkillText),
    networkSkill.tags.map(normalizeSkillText),
  );
  const sharedNameWords = collectOverlap(
    tokenizeSkillText(ownerSkill.name),
    tokenizeSkillText(networkSkill.name),
  );
  const sharedDescriptionWords = collectOverlap(
    tokenizeSkillText(ownerSkill.description),
    tokenizeSkillText(networkSkill.description),
  );

  return {
    score:
      sharedTags.length * 4 +
      sharedNameWords.length * 3 +
      sharedDescriptionWords.length,
    sharedTags,
    sharedNameWords,
    sharedDescriptionWords,
  };
}

function buildPromptContext(contextData: SwotContext): Record<string, unknown> {
  const dependableNetworkSkills = contextData.approvedAgents.flatMap((agent) =>
    agent.skills.map((skill) => ({
      agent: agent.brainName,
      agentDescription: agent.description,
      agentNotes: agent.notes,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      examples: skill.examples,
      signal: "dependable",
    })),
  );
  const tentativeNetworkSkills = contextData.discoveredAgents.flatMap((agent) =>
    agent.skills.map((skill) => ({
      agent: agent.brainName,
      agentDescription: agent.description,
      agentNotes: agent.notes,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      examples: skill.examples,
      signal: "tentative",
    })),
  );
  const allNetworkSkills = [
    ...dependableNetworkSkills,
    ...tentativeNetworkSkills,
  ];

  return {
    selfProfile: contextData.selfProfile,
    summary: {
      brainSkillCount: contextData.summary.brainSkillCount,
      uncoveredSkillCount: contextData.summary.uncoveredSkillCount,
      singleSourceSkillCount: contextData.summary.singleSourceSkillCount,
      pendingReviewCount: contextData.summary.pendingReviewCount,
    },
    evidenceCards: {
      ownerSkills: contextData.brainSkills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        examples: skill.examples,
        candidateMatches: allNetworkSkills
          .map((networkSkill) => {
            const matchSignals = getMatchSignals(skill, networkSkill);
            if (matchSignals.score === 0) return null;

            return {
              agent: networkSkill.agent,
              name: networkSkill.name,
              description: networkSkill.description,
              tags: networkSkill.tags,
              signal: networkSkill.signal,
              sharedTags: matchSignals.sharedTags,
              sharedNameWords: matchSignals.sharedNameWords,
              sharedDescriptionWords: matchSignals.sharedDescriptionWords,
              matchScore: matchSignals.score,
            };
          })
          .filter((skill): skill is NonNullable<typeof skill> => skill !== null)
          .sort(
            (left, right) =>
              right.matchScore - left.matchScore ||
              left.name.localeCompare(right.name),
          )
          .slice(0, 3),
      })),
      externalNetworkSkills: allNetworkSkills.filter(
        (networkSkill) =>
          !contextData.brainSkills.some(
            (brainSkill) => getMatchSignals(brainSkill, networkSkill).score > 0,
          ),
      ),
    },
    hints: contextData.hints,
  };
}

function buildDraftPromptFallback(): string {
  return `You are writing a concise SWOT assessment for a brain's capability profile and agent network.

Use ONLY the supplied capability-profile context.

Goal:
Produce actionable advice for the brain owner about their own profile, skills, and network's skills.
Write like a trusted advisor, not like an internal diagnostics panel.

Quadrant rules:
- Strengths: specific skills the person already has, especially where the network clearly reinforces them
- Weaknesses: specific skills the person lacks or can only support thinly
- Opportunities: specific network-only or network-led skills the person could learn from, collaborate on, or test next
- Threats: specific ways the person's work could stall because they or their network are too thin, too tentative, or missing a needed complement

Decision rules:
- Use skill descriptions as the primary grounding signal; names and tags are secondary clues
- Read the owner skill evidence cards first; candidateMatches are plausible evidence, not guaranteed same-skill matches
- Prefer claims supported by the cited evidence cards, especially shared descriptions and shared tags, not just matching labels
- Treat tentative network skill as lower-confidence evidence, but do not let approval/tentative status dominate the analysis
- Never describe tentative network skill as fully dependable
- Strengths should usually stay anchored to a real owner skill, not an external-only network capability
- External network skills are especially good sources for weaknesses, opportunities, and threats when they reveal a missing complement, adjacent move, or tentative risk
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
  1. one real owner-skill strength
  2. one real owner-skill gap or one missing complement revealed by the evidence cards
  3. one external network skill worth testing or learning from
  4. one concrete tentative network skill that matters in practice, or if none exists, one broader stall risk
- If the context supports them, prefer covering distinct themes like research, writing, analysis, facilitation/workshops, workflow/process, video, or visualization rather than collapsing everything into generic labels like "support" or "backup"
- If a tentative adjacent skill exists, prefer mentioning it once rather than adding another item about an already-covered strength
- Opportunity themes should usually come from external network skills or adjacent capabilities visible in the evidence cards
- Weakness and opportunity themes must name a concrete skill or capability visible in the context, not an abstract diagnosis like judgment, support, or communication
- If the owner already has a named skill like Analysis or Writing, refer to that capability directly instead of inventing a broader label
- When an external skill is the point, prefer the concrete skill name from the evidence card, such as Facilitation, Research Systems, or Video Production, over abstract labels like repeatable process or unproven gap
- Threat themes should usually come from tentative skills, missing complements, or broader stall risk — not just a second restatement of a weakness item
- If a concrete tentative skill like video or visualization exists, prefer that as the threat theme over generic process advice
- Do not use an opportunity slot for a skill the owner already clearly has unless the move is genuinely different from the existing strength
- Avoid generic themes like "support", "backup", "capacity", or "help" when a more specific skill theme is available from the context
- Verify each capability claim against the supplied context before writing: do not call a dependable network skill tentative, and do not call a tentative network skill dependable

Output style:
- Return 0-3 items per quadrant
- For this first pass, do NOT write final polished prose
- Instead, choose strong, specific draft items with:
  - theme: usually the actual capability name or a very close capability phrase from the evidence cards
  - evidence: one short factual statement grounded in the context, ideally naming the owner skill or matching network skill involved
  - action: one short recommendation or implication for the owner that says what the network does or does not add
- The action should be concrete, like strengthen it, use it confidently, test it, learn from it, review it, or do not rely on it yet
- If you can only say something useful by repeating an earlier theme, leave the extra slot empty instead
- Do not use generic threat themes like review quality, decision quality, or process discipline when a more concrete missing or tentative skill is available in the context`;
}

async function buildDraftPrompt(
  context: EntityPluginContext,
  contextData: SwotContext,
): Promise<string> {
  const promptContext = buildPromptContext(contextData);
  const basePrompt = await context.prompts.resolve(
    "assessment:swot-derivation",
    buildDraftPromptFallback(),
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
- You are an editor, not a new analyst
- Keep only the strongest, most actionable items
- Remove repeated themes unless the contrast is genuinely different and useful
- Prefer distinct themes across quadrants
- Use plain advisory language for the owner
- Prefer phrasing like "you" and "your network" when natural
- Remove system/internal jargon such as route, routing, coverage, source count, tag overlap, or similar diagnostics language
- Keep dependability language only when it changes confidence or the next step
- Do not invent new themes, capabilities, or claims beyond the supplied draft and context
- Each final item must stay anchored to one draft theme from the same quadrant
- sourceTheme must be copied EXACTLY from the allowed theme list for that quadrant
- Never shorten, paraphrase, generalize, or rewrite a draft theme in sourceTheme
- If an item is weak, repetitive, or generic, drop it instead of rewording it
- Keep the output concise and decision-oriented
- Make each detail operational: state what to use, test, learn, pair with, or avoid relying on
- When context contains distinct owner skills and network-only skills, preserve that breadth instead of thinning the SWOT to generic labels
- Prefer details that name the practical contrast, such as dependable overlap, missing complement, adjacent network move, or tentative risk
- Do not use vague wording like "outside input" or "network" alone when a concrete capability from the draft can be named

Output rules:
- Return 0-3 items per quadrant
- sourceTheme: exact copied theme string from the corresponding draft quadrant allowedThemes list
- title: short skill/risk label only, usually keeping the concrete capability named by sourceTheme rather than abstracting it further
- detail: one sentence with the practical implication or recommendation, grounded in the specific capability contrast`;
}

async function buildRefinementPrompt(
  context: EntityPluginContext,
  contextData: SwotContext,
  draft: SwotDraftGeneration,
): Promise<string> {
  const promptContext = buildPromptContext(contextData);
  const allowedThemes = {
    strengths: draft.strengths.map((item) => item.theme),
    weaknesses: draft.weaknesses.map((item) => item.theme),
    opportunities: draft.opportunities.map((item) => item.theme),
    threats: draft.threats.map((item) => item.theme),
  };
  const basePrompt = await context.prompts.resolve(
    "assessment:swot-refinement",
    buildRefinementPromptFallback(),
  );

  return `${basePrompt}

Allowed themes by quadrant:
${JSON.stringify(allowedThemes, null, 2)}

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

function validateRefinement(
  draft: SwotDraftGeneration,
  refined: SwotGeneration,
): void {
  const quadrants = [
    "strengths",
    "weaknesses",
    "opportunities",
    "threats",
  ] as const;

  for (const quadrant of quadrants) {
    const allowedThemes = new Set(
      draft[quadrant].map((item) => item.theme.trim().toLowerCase()),
    );

    for (const item of refined[quadrant]) {
      const sourceTheme = item.sourceTheme.trim().toLowerCase();
      if (!allowedThemes.has(sourceTheme)) {
        throw new Error(
          `SWOT refinement invented theme "${item.sourceTheme}" in ${quadrant}`,
        );
      }
    }
  }
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
        await buildDraftPrompt(this.context, contextData),
        swotDraftGenerationSchema,
      );
      const draft = swotDraftGenerationSchema.parse(object);

      await progressReporter.report({
        progress: 0.75,
        message: "Refining SWOT language",
      });

      const refined = await this.context.ai.generateObject(
        await buildRefinementPrompt(this.context, contextData, draft),
        swotGenerationSchema,
      );
      generated = swotGenerationSchema.parse(refined.object);
      validateRefinement(draft, generated);
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
    }>({ entityType: "swot", id: "swot" });

    if (existing) {
      await this.context.entityService.updateEntity({
        entity: {
          ...existing,
          content,
          metadata: { derivedAt },
        },
      });
    } else {
      await this.context.entityService.createEntity({
        entity: {
          id: "swot",
          entityType: "swot",
          content,
          metadata: { derivedAt },
        },
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
