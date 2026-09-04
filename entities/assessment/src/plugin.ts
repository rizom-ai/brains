import type {
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  ProjectionRule,
} from "@brains/plugins";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  swotEntitySchema,
  swotFrontmatterSchema,
  type SwotEntity,
} from "./schemas/swot";

const swotWidgetDataSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("generating") }),
  swotFrontmatterSchema.extend({ status: z.literal("ready") }),
]);

const swotWidget = defineDashboardWidget({
  id: "swot",
  title: "SWOT",
  group: "network",
  placement: "secondary",
  priority: 14,
  permission: "public",
  data: swotWidgetDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "SWOT",
        value: data.status === "ready" ? "Ready" : "Generating",
        tone: data.status === "ready" ? "good" : "warn",
      },
    ],
  }),
  view: ({ data }) => {
    if (data.status === "generating") {
      return {
        blocks: [
          {
            type: "notice",
            tone: "neutral",
            text: "Generating the current SWOT assessment.",
          },
        ],
      };
    }
    return {
      blocks: [
        {
          type: "matrix",
          id: "swot-matrix",
          columns: 2,
          cells: [
            {
              id: "strengths",
              label: "Strengths",
              tone: "good",
              empty: "No strengths recorded.",
              items: data.strengths.map((item, index) => ({
                id: `strength-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "weaknesses",
              label: "Weaknesses",
              tone: "warn",
              empty: "No weaknesses recorded.",
              items: data.weaknesses.map((item, index) => ({
                id: `weakness-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "opportunities",
              label: "Opportunities",
              tone: "good",
              empty: "No opportunities recorded.",
              items: data.opportunities.map((item, index) => ({
                id: `opportunity-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
            {
              id: "threats",
              label: "Threats",
              tone: "error",
              empty: "No threats recorded.",
              items: data.threats.map((item, index) => ({
                id: `threat-${index}`,
                title: item.title,
                ...(item.detail ? { description: item.detail } : {}),
              })),
            },
          ],
        },
      ],
    };
  },
});

import { SwotAdapter } from "./adapters/swot-adapter";
import { SwotDerivationHandler } from "./handlers/swot-derivation-handler";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { createSwotProjectionRule } from "./lib/swot-projection";
import packageJson from "../package.json";

const swotAdapter = new SwotAdapter();

export interface AssessmentConfig {
  enableSwotDerivation: boolean;
}

export interface AssessmentConfigInput {
  enableSwotDerivation?: boolean | undefined;
}

export const assessmentConfigSchema: z.ZodType<
  AssessmentConfig,
  AssessmentConfigInput
> = z
  .object({
    enableSwotDerivation: z
      .boolean()
      .default(true)
      .describe(
        "Derive SWOT assessments from agent and skill evidence using AI",
      ),
  })
  .strict();

export class SwotAssessmentPlugin extends EntityPlugin<
  SwotEntity,
  AssessmentConfig,
  AssessmentConfigInput
> {
  readonly entityType = "swot" as const;
  readonly schema: typeof swotEntitySchema = swotEntitySchema;
  readonly adapter: SwotAdapter = swotAdapter;

  private derivationHandler: SwotDerivationHandler | undefined;

  constructor(config: AssessmentConfigInput = {}) {
    super("swot", packageJson, config, assessmentConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return this.config.enableSwotDerivation ? [createSwotProjectionRule()] : [];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.derivationHandler = new SwotDerivationHandler(
      this.logger.child("SwotDerivationHandler"),
      context,
    );
    context.eval.registerHandler("deriveSwot", async () => {
      const progressReporter = CallbackProgressReporter.from(async () => {});
      if (!progressReporter) {
        throw new Error("Expected progress reporter to be created");
      }

      await this.requireDerivationHandler().process(
        { reason: "eval" },
        "eval-swot-derive",
        progressReporter,
      );

      const entity = await context.entityService.getEntity(
        {
          entityType: "swot",
          id: "swot",
        },
        swotEntitySchema,
      );
      if (!entity) {
        throw new Error("Expected SWOT entity to be created during eval");
      }

      return swotAdapter.parseSwotContent(entity.content).frontmatter;
    });

    context.messaging.subscribe(
      SYSTEM_CHANNELS.pluginsRegistered,
      async (): Promise<{ success: boolean }> => {
        await registerBuiltInDashboardWidget({
          context,
          definition: swotWidget,
          load: async ({
            signal,
          }): Promise<z.input<typeof swotWidgetDataSchema>> => {
            signal.throwIfAborted();
            const swot = await context.entityService.getEntity(
              {
                entityType: "swot",
                id: "swot",
              },
              swotEntitySchema,
            );
            signal.throwIfAborted();
            if (!swot) return { status: "generating" };
            const { frontmatter } = swotAdapter.parseSwotContent(swot.content);
            return { status: "ready", ...frontmatter };
          },
        });

        return { success: true };
      },
    );
  }

  private requireDerivationHandler(): SwotDerivationHandler {
    if (!this.derivationHandler) {
      throw new Error("SWOT derivation handler is not registered");
    }
    return this.derivationHandler;
  }
}

export function swotAssessmentPlugin(
  config: AssessmentConfigInput = {},
): Plugin {
  return new SwotAssessmentPlugin(config);
}
