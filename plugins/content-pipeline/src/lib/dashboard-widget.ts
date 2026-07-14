import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  getPublicationPipelineSnapshot,
  type PublicationPipelineSnapshot,
} from "../pipeline-snapshot";
import type { ProviderRegistry } from "../provider-registry";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";

export interface PipelineWidgetData extends PublicationPipelineSnapshot {
  managementUrl?: string | undefined;
}

export interface RegisterDashboardWidgetDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  retryTracker: RetryTracker;
  managementUrl?: string | undefined;
}

export async function registerDashboardWidget(
  context: ServicePluginContext,
  pluginId: string,
  deps: RegisterDashboardWidgetDeps,
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
      dataProvider: async (): Promise<PipelineWidgetData> => ({
        ...(await getPublicationPipelineSnapshot(
          context,
          deps.providerRegistry,
          deps.queueManager,
          deps.retryTracker,
        )),
        ...(deps.managementUrl ? { managementUrl: deps.managementUrl } : {}),
      }),
      digestProvider: derivePipelineDigest,
    },
  });
}

const pipelineDigestSourceSchema = z.object({
  summary: z.object({
    draft: z.number(),
    queued: z.number(),
    generating: z.number(),
    published: z.number(),
    failed: z.number(),
    needsOperator: z.number(),
  }),
});

function derivePipelineDigest(data: unknown): {
  digest: Array<{ label: string; value: string; tone?: "good" | "warn" }>;
  needsOperator: number;
} {
  const { summary } = pipelineDigestSourceSchema.parse(data);
  const inFlight = summary.queued + summary.generating;
  const pipelineValue =
    inFlight === 0
      ? "idle"
      : `${summary.queued} queued · ${summary.generating} generating`;
  const reviewValue =
    summary.failed > 0
      ? `${summary.draft} drafts · ${summary.failed} failed`
      : `${summary.draft} drafts`;

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
        ...(summary.needsOperator > 0 ? { tone: "warn" as const } : {}),
      },
      { label: "Published", value: String(summary.published), tone: "good" },
    ],
    needsOperator: summary.needsOperator,
  };
}
