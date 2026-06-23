import type { DataSource, EntityPluginContext, Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import {
  opportunityConfigSchema,
  opportunitySchema,
  type OpportunityConfig,
  type OpportunityEntity,
} from "./schemas/opportunity";
import { opportunityAdapter } from "./adapters/opportunity-adapter";
import { OpportunityFocusDataSource } from "./datasources/opportunity-focus-datasource";
import { OpportunityStackDataSource } from "./datasources/opportunity-stack-datasource";
import { buildOpportunityFocus } from "./lib/opportunity-focus";
import { rankOpportunities } from "./lib/opportunity-ranking";
import packageJson from "../package.json";

export class BusinessDevelopmentPlugin extends EntityPlugin<
  OpportunityEntity,
  OpportunityConfig
> {
  readonly entityType = opportunityAdapter.entityType;
  readonly schema = opportunitySchema;
  readonly adapter = opportunityAdapter;

  constructor(config: Partial<OpportunityConfig> = {}) {
    super("business-development", packageJson, config, opportunityConfigSchema);
  }

  protected override getDataSources(): DataSource[] {
    return [new OpportunityStackDataSource(), new OpportunityFocusDataSource()];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: "business-development-focus",
          pluginId: this.id,
          title: "Business Development Focus",
          section: "primary",
          priority: 40,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const opportunities =
              await context.entityService.listEntities<OpportunityEntity>({
                entityType: "opportunity",
                options: { limit: 1000 },
              });
            const focus = buildOpportunityFocus(
              rankOpportunities(
                opportunities.filter(
                  (opportunity) => opportunity.metadata.state !== "closed",
                ),
              ),
            );
            return {
              items: focus.map((opportunity) => ({
                id: opportunity.id,
                name: opportunity.title,
                count: opportunity.total,
                priority: "active",
                status: opportunity.state,
              })),
            };
          },
        },
      });
      return { success: true };
    });
  }

  protected override async getInstructions(): Promise<string> {
    return [
      'Use system_create with entityType: "opportunity" for commercial leads, grants, partnerships, and internal strategic work that should be prioritized.',
      "Create opportunities with structured fields plus narrative content; Do not hand-write YAML frontmatter in content and do not use prompt for opportunity capture, because the confirmation preview must show the proposed scores before save.",
      "Required fields: title, type (commercial/grant/partnership/internal), state (active/staged/warm/closed), incomePotential, organizationalBuild, brainsDevelopment, and integrity.",
      "Scores use a 0-5 integer rubric: incomePotential measures likely/timely revenue or funding; organizationalBuild measures capacity/network growth; brainsDevelopment measures Brains product/reference-case value; integrity measures values alignment and independence-preserving terms.",
      "integrity 0 is a hard gate: a misaligned or independence-compromising opportunity is disqualified and MUST NEVER use state active, regardless of value score; use staged, warm, or closed instead.",
      "Use active only for at most two top eligible opportunities with integrity 1-5, staged for high-value non-active opportunities, warm for lower-urgency opportunities that should not be dropped, and closed for done/declined/dead opportunities.",
      "In content, include context and short scoring rationales only; the canonical score values belong in fields.",
      "If the request is too thin to identify what the opportunity is or how to score it, ask a brief clarification instead of fabricating scores.",
      "Do not use opportunity for ordinary tasks, CRM contact records, or published portfolio projects.",
    ].join(" ");
  }
}

export function createBusinessDevelopmentPlugin(
  config: Partial<OpportunityConfig> = {},
): Plugin {
  return new BusinessDevelopmentPlugin(config);
}

export const businessDevelopmentPlugin = createBusinessDevelopmentPlugin;

export type {
  OpportunityConfig,
  OpportunityEntity,
  OpportunityFrontmatter,
  OpportunityMetadata,
  OpportunityState,
  OpportunityType,
} from "./schemas/opportunity";
export {
  opportunityConfigSchema,
  opportunityFrontmatterSchema,
  opportunityMetadataSchema,
  opportunitySchema,
  opportunityScoreSchema,
  opportunityStateSchema,
  opportunityTypeSchema,
} from "./schemas/opportunity";
export {
  OpportunityAdapter,
  opportunityAdapter,
} from "./adapters/opportunity-adapter";
export {
  OpportunityFocusDataSource,
  type OpportunityFocusData,
} from "./datasources/opportunity-focus-datasource";
export {
  OpportunityStackDataSource,
  type OpportunityStackData,
} from "./datasources/opportunity-stack-datasource";
export {
  buildOpportunityFocus,
  suggestOpportunityStates,
  type FocusedOpportunity,
  type OpportunityStateSuggestion,
} from "./lib/opportunity-focus";
export {
  computeOpportunityScore,
  rankOpportunities,
  type OpportunityRankingOptions,
  type OpportunityScore,
  type RankedOpportunity,
} from "./lib/opportunity-ranking";
