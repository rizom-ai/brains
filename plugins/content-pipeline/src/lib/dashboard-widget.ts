import {
  defineDashboardWidget,
  type DashboardWidgetDefinition,
} from "@brains/sdk/services";
import type { PipelineRuntime } from "../runtime";
import {
  getPublicationPipelineSnapshot,
  publicationPipelineSnapshotSchema,
  type PublicationPipelineSnapshot,
} from "../pipeline-snapshot";
import type { ProviderRegistry } from "../provider-registry";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";

export type PipelineWidgetData = PublicationPipelineSnapshot;

export interface PipelineWidgetDeps {
  providerRegistry: ProviderRegistry;
  queueManager: QueueManager;
  retryTracker: RetryTracker;
}

export const publicationPipelineWidget: DashboardWidgetDefinition<
  "publication-pipeline",
  typeof publicationPipelineSnapshotSchema
> = defineDashboardWidget({
  id: "publication-pipeline",
  title: "Publication Pipeline",
  group: "publishing",
  placement: "primary",
  priority: 100,
  permission: "admin",
  data: publicationPipelineSnapshotSchema,
  digest: ({ data }) => {
    const inFlight = data.summary.queued + data.summary.generating;
    const pipelineValue =
      inFlight === 0
        ? "idle"
        : `${data.summary.queued} queued · ${data.summary.generating} generating`;
    const reviewValue =
      data.summary.failed > 0
        ? `${data.summary.draft} drafts · ${data.summary.failed} failed`
        : `${data.summary.draft} drafts`;
    return {
      items: [
        {
          label: "Pipeline",
          value: pipelineValue,
          ...(inFlight > 0 ? { tone: "warn" } : {}),
        },
        {
          label: "Awaiting review",
          value: reviewValue,
          ...(data.summary.needsOperator > 0 ? { tone: "warn" } : {}),
        },
        {
          label: "Published",
          value: String(data.summary.published),
          tone: "good",
        },
      ],
      attention: data.summary.needsOperator,
    };
  },
  view: ({ data }) => ({
    blocks: [
      {
        type: "stats",
        items: [
          { label: "Queued", value: data.summary.queued },
          { label: "Generating", value: data.summary.generating },
          {
            label: "Awaiting review",
            value: data.summary.needsOperator,
            tone: data.summary.needsOperator > 0 ? "warn" : "neutral",
          },
          { label: "Published", value: data.summary.published, tone: "good" },
        ],
      },
      {
        type: "list",
        id: "publication-failures",
        empty: "No publication failures.",
        items: data.failures.slice(0, 3).map((failure) => ({
          id: `${failure.entityType}:${failure.entityId}`,
          title: failure.title,
          description: failure.error,
          badges: [
            {
              label: `${failure.retryCount} retries`,
              tone: "error",
            },
          ],
        })),
      },
      {
        type: "links",
        items: [
          {
            label: "Open in Studio",
            target: { launch: { target: "publishing" } },
          },
        ],
      },
    ],
  }),
});

/** What the widget shows: the same snapshot the workspace opens with. */
export function loadPipelineWidget(
  context: PipelineRuntime,
  deps: PipelineWidgetDeps,
): ({ signal }: { signal: AbortSignal }) => Promise<PipelineWidgetData> {
  return ({ signal }) => {
    signal.throwIfAborted();
    return getPublicationPipelineSnapshot(
      context,
      deps.providerRegistry,
      deps.queueManager,
      deps.retryTracker,
    );
  };
}
