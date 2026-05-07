import type { ServicePluginContext } from "@brains/plugins";

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
      section: "secondary",
      priority: 100,
      rendererName: "PipelineWidget",
      visibility: "operator",
      dataProvider: () => getPipelineWidgetData(context),
    },
  });
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
