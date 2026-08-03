import type {
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  ProjectionRule,
} from "@brains/plugins";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  emptyEntityPluginConfigSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { swotEntitySchema, type SwotEntity } from "./schemas/swot";

const swotDigestSourceSchema = z.object({
  status: z.enum(["ready", "generating"]),
});

import { SwotAdapter } from "./adapters/swot-adapter";
import { SwotDerivationHandler } from "./handlers/swot-derivation-handler";
import { SwotWidget, swotWidgetStyles } from "./widgets/swot-widget";
import { ProgressReporter } from "@brains/utils/progress";
import { createSwotProjectionRule } from "./lib/swot-projection";
import packageJson from "../package.json";

const swotAdapter = new SwotAdapter();

export class SwotAssessmentPlugin extends EntityPlugin<
  SwotEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "swot" as const;
  readonly schema: typeof swotEntitySchema = swotEntitySchema;
  readonly adapter: SwotAdapter = swotAdapter;

  private derivationHandler: SwotDerivationHandler | undefined;

  constructor() {
    super("swot", packageJson, {}, emptyEntityPluginConfigSchema);
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
    return [createSwotProjectionRule()];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.derivationHandler = new SwotDerivationHandler(
      this.logger.child("SwotDerivationHandler"),
      context,
    );
    context.eval.registerHandler("deriveSwot", async () => {
      const progressReporter = ProgressReporter.from(async () => {});
      if (!progressReporter) {
        throw new Error("Expected progress reporter to be created");
      }

      await this.requireDerivationHandler().process(
        { reason: "eval" },
        "eval-swot-derive",
        progressReporter,
      );

      const entity = await context.entityService.getEntity<SwotEntity>({
        entityType: "swot",
        id: "swot",
      });
      if (!entity) {
        throw new Error("Expected SWOT entity to be created during eval");
      }

      return swotAdapter.parseSwotContent(entity.content).frontmatter;
    });

    context.messaging.subscribe(
      SYSTEM_CHANNELS.pluginsRegistered,
      async (): Promise<{ success: boolean }> => {
        await context.dashboard.registerWidget({
          id: "swot",
          title: "SWOT",
          group: "network",
          section: "secondary",
          priority: 14,
          rendererName: "SwotWidget",
          digestProvider: (data: unknown) => {
            const { status } = swotDigestSourceSchema.parse(data);
            return {
              digest: [
                {
                  label: "SWOT",
                  value: status === "ready" ? "Ready" : "Generating",
                  tone: status === "ready" ? "good" : "warn",
                },
              ],
            };
          },
          component: SwotWidget,
          clientStyles: swotWidgetStyles,
          dataProvider: async () => {
            const swot = await context.entityService.getEntity<SwotEntity>({
              entityType: "swot",
              id: "swot",
            });

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

export function swotAssessmentPlugin(): Plugin {
  return new SwotAssessmentPlugin();
}
