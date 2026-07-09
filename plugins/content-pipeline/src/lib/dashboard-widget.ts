import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface PipelineWidgetItem {
  id: string;
  title: string;
  type: string;
  status: "draft" | "queued" | "published" | "failed";
}

export interface PipelineWidgetData {
  summary: Record<PipelineWidgetItem["status"], number>;
  items: PipelineWidgetItem[];
}

const PUBLISH_STATUSES = ["draft", "queued", "published", "failed"] as const;

type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export async function registerDashboardWidget(
  context: ServicePluginContext,
  pluginId: string,
): Promise<void> {
  await context.messaging.send({
    type: "dashboard:register-widget",
    payload: {
      id: "publication-pipeline",
      pluginId,
      title: "Publication Pipeline",
      group: "publishing",
      section: "secondary",
      priority: 100,
      rendererName: "PipelineWidget",
      visibility: "anchor",
      dataProvider: () => getPipelineWidgetData(context),
      digestProvider: derivePipelineDigest,
    },
  });
}

const pipelineDigestSourceSchema = z.object({
  summary: z.object({
    draft: z.number(),
    queued: z.number(),
    published: z.number(),
    failed: z.number(),
  }),
});

function derivePipelineDigest(data: unknown): {
  digest: Array<{ label: string; value: string; tone?: "good" | "warn" }>;
  needsOperator: number;
} {
  const { summary } = pipelineDigestSourceSchema.parse(data);

  return {
    digest: [
      {
        label: "Queued",
        value: String(summary.queued),
        ...(summary.queued > 0 ? { tone: "warn" as const } : {}),
      },
      { label: "Drafts", value: String(summary.draft) },
      { label: "Published", value: String(summary.published), tone: "good" },
      ...(summary.failed > 0
        ? [
            {
              label: "Failed",
              value: String(summary.failed),
              tone: "warn" as const,
            },
          ]
        : []),
    ],
    // Drafts and failures both wait on an operator decision.
    needsOperator: summary.draft + summary.failed,
  };
}

async function getPipelineWidgetData(
  context: ServicePluginContext,
): Promise<PipelineWidgetData> {
  const entityTypes = context.entityService.getEntityTypes();
  const items: PipelineWidgetItem[] = [];
  const summary: PipelineWidgetData["summary"] = {
    draft: 0,
    queued: 0,
    published: 0,
    failed: 0,
  };

  for (const entityType of entityTypes) {
    const entities = await context.entityService.listEntities({ entityType });
    for (const entity of entities) {
      const status = parsePublishStatus(entity.metadata["status"]);
      if (!status) continue;

      summary[status]++;
      items.push({
        id: entity.id,
        title: getEntityTitle(entity.id, entity.metadata["title"]),
        type: entityType,
        status,
      });
    }
  }

  return { summary, items };
}

function parsePublishStatus(value: unknown): PublishStatus | undefined {
  return PUBLISH_STATUSES.find((status) => status === value);
}

function getEntityTitle(entityId: string, title: unknown): string {
  return typeof title === "string" ? title : entityId;
}
