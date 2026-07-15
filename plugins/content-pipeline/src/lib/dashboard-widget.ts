import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface PipelineWidgetItem {
  id: string;
  title: string;
  type: string;
  status: "draft" | "queued" | "published" | "failed";
}

export interface PipelineGeneratingItem {
  id: string;
  label: string;
  target: string;
  status: "pending" | "processing";
}

export interface PipelineWidgetData {
  summary: Record<PipelineWidgetItem["status"], number>;
  items: PipelineWidgetItem[];
  generating: PipelineGeneratingItem[];
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
  generating: z.array(z.unknown()),
});

function derivePipelineDigest(data: unknown): {
  digest: Array<{ label: string; value: string; tone?: "good" | "warn" }>;
  needsAttention: number;
} {
  const { summary, generating } = pipelineDigestSourceSchema.parse(data);
  const inFlight = summary.queued + generating.length;
  const pipelineValue =
    inFlight === 0
      ? "idle"
      : `${summary.queued} queued · ${generating.length} generating`;
  const reviewValue =
    summary.failed > 0
      ? `${summary.draft} drafts · ${summary.failed} failed`
      : `${summary.draft} drafts`;
  const needsAttention = summary.draft + summary.failed;

  return {
    digest: [
      {
        label: "Pipeline",
        value: pipelineValue,
        ...(inFlight > 0 ? { tone: "warn" as const } : {}),
      },
      {
        label: "Awaiting review",
        value: reviewValue,
        ...(needsAttention > 0 ? { tone: "warn" as const } : {}),
      },
      { label: "Published", value: String(summary.published), tone: "good" },
    ],
    // Drafts and failures both wait on a human review decision.
    needsAttention,
  };
}

const generatingJobDataSchema = z.object({
  sourceEntityType: z.string(),
  sourceEntityId: z.string(),
  attachmentType: z.string().optional(),
});

async function getGeneratingItems(
  context: ServicePluginContext,
): Promise<PipelineGeneratingItem[]> {
  const activeJobs = await context.jobs.getActiveJobs();
  const generating: PipelineGeneratingItem[] = [];

  for (const job of activeJobs) {
    if (job.source !== "content-pipeline") continue;
    if (job.status !== "pending" && job.status !== "processing") continue;

    let payload: unknown;
    try {
      payload = JSON.parse(job.data);
    } catch {
      continue;
    }
    const parsed = generatingJobDataSchema.safeParse(payload);
    if (!parsed.success) continue;

    generating.push({
      id: job.id,
      label: parsed.data.attachmentType ?? job.type,
      target: `${parsed.data.sourceEntityType}/${parsed.data.sourceEntityId}`,
      status: job.status,
    });
  }

  return generating;
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

  return { summary, items, generating: await getGeneratingItems(context) };
}

function parsePublishStatus(value: unknown): PublishStatus | undefined {
  return PUBLISH_STATUSES.find((status) => status === value);
}

function getEntityTitle(entityId: string, title: unknown): string {
  return typeof title === "string" ? title : entityId;
}
