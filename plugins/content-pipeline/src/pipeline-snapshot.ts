import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "./provider-registry";
import type { QueueManager } from "./queue-manager";
import type { RetryTracker } from "./retry-tracker";

const publicationStatusSchema = z.enum([
  "draft",
  "queued",
  "published",
  "failed",
]);

export interface PublicationQueueItem {
  entityId: string;
  entityType: string;
  title: string;
  position: number;
  queuedAt: string;
  destination: string;
  scheduledFor?: string | undefined;
}

export interface PublicationJobItem {
  id: string;
  label: string;
  target: string;
  status: "pending" | "processing";
}

export interface PublicationFailureItem {
  entityId: string;
  entityType: string;
  title: string;
  error: string;
  retryCount: number;
}

export interface PublicationPipelineSnapshot {
  summary: {
    draft: number;
    queued: number;
    generating: number;
    failed: number;
    published: number;
    needsOperator: number;
  };
  queue: PublicationQueueItem[];
  generating: PublicationJobItem[];
  failures: PublicationFailureItem[];
  publishableEntityTypes: string[];
}

export const publicationQueueItemSchema: z.ZodType<
  PublicationQueueItem,
  PublicationQueueItem
> = z.object({
  entityId: z.string(),
  entityType: z.string(),
  title: z.string(),
  position: z.number().int().positive(),
  queuedAt: z.string(),
  destination: z.string(),
  scheduledFor: z.string().optional(),
});

export const publicationJobItemSchema: z.ZodType<
  PublicationJobItem,
  PublicationJobItem
> = z.object({
  id: z.string(),
  label: z.string(),
  target: z.string(),
  status: z.enum(["pending", "processing"]),
});

export const publicationFailureItemSchema: z.ZodType<
  PublicationFailureItem,
  PublicationFailureItem
> = z.object({
  entityId: z.string(),
  entityType: z.string(),
  title: z.string(),
  error: z.string(),
  retryCount: z.number().int().nonnegative(),
});

export const publicationPipelineSnapshotSchema: z.ZodType<
  PublicationPipelineSnapshot,
  PublicationPipelineSnapshot
> = z.object({
  summary: z.object({
    draft: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    generating: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    needsOperator: z.number().int().nonnegative(),
  }),
  queue: z.array(publicationQueueItemSchema),
  generating: z.array(publicationJobItemSchema),
  failures: z.array(publicationFailureItemSchema),
  publishableEntityTypes: z.array(z.string()),
});

type PublicationStatus = z.output<typeof publicationStatusSchema>;

interface PublicationEntityItem {
  entityId: string;
  entityType: string;
  title: string;
  status: PublicationStatus;
  scheduledFor?: string;
  error?: string;
}

const generatingJobDataSchema = z.object({
  sourceEntityType: z.string(),
  sourceEntityId: z.string(),
  attachmentType: z.string().optional(),
});

/** Build the content-pipeline-owned read model for operator surfaces. */
export async function getPublicationPipelineSnapshot(
  context: ServicePluginContext,
  providerRegistry: ProviderRegistry,
  queueManager: QueueManager,
  retryTracker: RetryTracker,
): Promise<PublicationPipelineSnapshot> {
  const publishableEntityTypes = providerRegistry.getRegisteredTypes().sort();
  const entitiesByKey = new Map<string, PublicationEntityItem>();
  const summary = {
    draft: 0,
    queued: 0,
    generating: 0,
    failed: 0,
    published: 0,
    needsOperator: 0,
  };

  for (const entityType of publishableEntityTypes) {
    const entities = await context.entityService.listEntities({ entityType });
    for (const entity of entities) {
      const parsedStatus = publicationStatusSchema.safeParse(
        entity.metadata["status"],
      );
      if (!parsedStatus.success) continue;

      summary[parsedStatus.data] += 1;
      const scheduledFor = entity.metadata["scheduledFor"];
      const error = entity.metadata["error"];
      entitiesByKey.set(entityKey(entityType, entity.id), {
        entityId: entity.id,
        entityType,
        title: getEntityTitle(entity.id, entity.metadata),
        status: parsedStatus.data,
        ...(typeof scheduledFor === "string" ? { scheduledFor } : {}),
        ...(typeof error === "string" ? { error } : {}),
      });
    }
  }

  const queue: PublicationPipelineSnapshot["queue"] = [];
  for (const entityType of publishableEntityTypes) {
    const destination = providerRegistry.get(entityType).name;
    for (const entry of await queueManager.list(entityType)) {
      const entity = entitiesByKey.get(entityKey(entityType, entry.entityId));
      if (!entity) continue;
      queue.push({
        entityId: entry.entityId,
        entityType,
        title: entity.title,
        position: entry.position,
        queuedAt: entry.queuedAt,
        destination,
        ...(entity.scheduledFor ? { scheduledFor: entity.scheduledFor } : {}),
      });
    }
  }
  // QueueManager ordering is per publishable type because schedulers consume
  // one destination at a time. Keep each destination contiguous so operator
  // move controls match the executable order they mutate.
  const generating = await getGeneratingItems(context);
  summary.generating = generating.length;

  const failures = Array.from(entitiesByKey.values())
    .filter((entity) => entity.status === "failed")
    .map((entity) => {
      const retry = retryTracker.getRetryInfo(entity.entityId);
      return {
        entityId: entity.entityId,
        entityType: entity.entityType,
        title: entity.title,
        error: entity.error ?? retry?.lastError ?? "Publication failed",
        retryCount: retry?.retryCount ?? 0,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  summary.needsOperator = summary.draft + summary.failed;

  return publicationPipelineSnapshotSchema.parse({
    summary,
    queue,
    generating,
    failures,
    publishableEntityTypes,
  });
}

async function getGeneratingItems(
  context: ServicePluginContext,
): Promise<PublicationJobItem[]> {
  const generating: PublicationJobItem[] = [];

  for (const job of await context.jobs.getActiveJobs()) {
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

function entityKey(entityType: string, entityId: string): string {
  return `${entityType}\0${entityId}`;
}

function getEntityTitle(
  entityId: string,
  metadata: Record<string, unknown>,
): string {
  for (const key of ["title", "subject", "slug"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return entityId;
}
