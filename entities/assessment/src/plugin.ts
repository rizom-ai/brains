import type { Plugin, EntityPluginContext } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import {
  swotEntitySchema,
  type SwotEntity,
  type SwotDerivationJobData,
} from "./schemas/swot";
import { SwotAdapter } from "./adapters/swot-adapter";
import { SwotDerivationHandler } from "./handlers/swot-derivation-handler";
import { SwotWidget } from "./widgets/swot-widget";
import packageJson from "../package.json";

const swotAdapter = new SwotAdapter();

export class SwotAssessmentPlugin extends EntityPlugin<SwotEntity> {
  readonly entityType = "swot";
  readonly schema = swotEntitySchema;
  readonly adapter = swotAdapter;

  private initialSyncComplete = false;

  constructor() {
    super("swot", packageJson);
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    const derivationHandler = new SwotDerivationHandler(
      this.logger.child("SwotDerivationHandler"),
      context,
    );

    context.jobs.registerHandler("derive", derivationHandler);

    const enqueueDerive = async (reason: string): Promise<string | null> => {
      try {
        return await context.jobs.enqueue(
          "derive",
          { reason } satisfies SwotDerivationJobData,
          null,
          {
            source: this.id,
            priority: 10,
            deduplication: "coalesce",
            deduplicationKey: "swot",
            metadata: {
              operationType: "data_processing",
              operationTarget: `swot:${reason}`,
            },
          },
        );
      } catch (error) {
        this.logger.error("Failed to queue SWOT derivation", { error, reason });
        return null;
      }
    };

    const ensureDerived = async (reason: string): Promise<void> => {
      const existing = await context.entityService.getEntity<SwotEntity>(
        "swot",
        "swot",
      );
      if (!existing) {
        await enqueueDerive(reason);
      }
    };

    context.messaging.subscribe("sync:initial:completed", async () => {
      this.initialSyncComplete = true;
      await ensureDerived("initial-missing-entity");
      return { success: true };
    });

    context.messaging.subscribe(
      "system:plugins:ready",
      async (): Promise<{ success: boolean }> => {
        await context.messaging.send({
          type: "dashboard:register-widget",
          payload: {
            id: "swot",
            pluginId: this.id,
            title: "SWOT",
            section: "secondary",
            priority: 14,
            rendererName: "SwotWidget",
            component: SwotWidget,
            dataProvider: async () => {
              const swot = await context.entityService.getEntity<SwotEntity>(
                "swot",
                "swot",
              );

              if (!swot) return { status: "generating" };

              const { frontmatter } = swotAdapter.parseSwotContent(
                swot.content,
              );
              return { status: "ready", ...frontmatter };
            },
          },
        });

        return { success: true };
      },
    );

    const handleEntityChange = async (message: {
      payload: { entityType: string };
    }): Promise<{ success: boolean }> => {
      const { entityType } = message.payload;

      if (!this.initialSyncComplete) return { success: true };
      if (entityType !== "agent" && entityType !== "skill") {
        return { success: true };
      }

      await enqueueDerive("entity-change");
      return { success: true };
    };

    context.messaging.subscribe("entity:created", handleEntityChange);
    context.messaging.subscribe("entity:updated", handleEntityChange);
    context.messaging.subscribe("entity:deleted", handleEntityChange);
  }
}

export function swotAssessmentPlugin(): Plugin {
  return new SwotAssessmentPlugin();
}
