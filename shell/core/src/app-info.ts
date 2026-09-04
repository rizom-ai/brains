import type {
  RuntimeAppInfo,
  EndpointInfo,
  InteractionInfo,
} from "@brains/plugins";
import { internalFullScope } from "@brains/entity-service";
import type { ShellConfig } from "./config";
import type { ShellServices } from "./types/shell-types";
import { summarizeBackgroundWork } from "./background-work-status";

export async function getRuntimeAppInfo(options: {
  config: ShellConfig;
  services: ShellServices;
  bootTime: number;
  endpoints: () => EndpointInfo[];
  interactions: () => InteractionInfo[];
}): Promise<RuntimeAppInfo> {
  const { config, services, bootTime, endpoints, interactions } = options;
  const [entityCounts, embeddingCount, daemons, queueDiagnostics] =
    await Promise.all([
      services.entityService.getEntityCounts(
        internalFullScope(
          "runtime app info reports operator-facing aggregate status",
        ),
      ),
      services.entityService.countEmbeddings(),
      services.daemonRegistry.getStatuses(),
      services.jobQueueService.getDiagnostics(),
    ]);
  const totalEntities = entityCounts.reduce((sum, c) => sum + c.count, 0);

  return {
    model: config.name || "brain-app",
    version: config.version || "1.0.0",
    uptime: Math.floor((Date.now() - bootTime) / 1000),
    entities: totalEntities,
    entityCounts,
    embeddings: embeddingCount,
    backgroundWork: summarizeBackgroundWork(
      queueDiagnostics,
      services.jobQueueService.getExecutionRegistrations(),
    ),
    ai: {
      model: config.ai.model,
      embeddingModel: "text-embedding-3-small",
    },
    daemons,
    endpoints: endpoints(),
    interactions: interactions(),
  };
}
