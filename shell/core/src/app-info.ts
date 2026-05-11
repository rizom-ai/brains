import type {
  RuntimeAppInfo,
  EndpointInfo,
  InteractionInfo,
} from "@brains/plugins";
import type { ShellConfig } from "./config";
import type { ShellServices } from "./initialization/shellInitializer";

export async function getRuntimeAppInfo(options: {
  config: ShellConfig;
  services: ShellServices;
  bootTime: number;
  endpoints: () => EndpointInfo[];
  interactions: () => InteractionInfo[];
}): Promise<RuntimeAppInfo> {
  const { config, services, bootTime, endpoints, interactions } = options;
  const entityCounts = await services.entityService.getEntityCounts();
  const totalEntities = entityCounts.reduce((sum, c) => sum + c.count, 0);
  const embeddingCount = await services.entityService.countEmbeddings();
  const daemons = await services.daemonRegistry.getStatuses();

  return {
    model: config.name || "brain-app",
    version: config.version || "1.0.0",
    uptime: Math.floor((Date.now() - bootTime) / 1000),
    entities: totalEntities,
    entityCounts,
    embeddings: embeddingCount,
    ai: {
      model: config.ai.model,
      embeddingModel: "text-embedding-3-small",
    },
    daemons,
    endpoints: endpoints(),
    interactions: interactions(),
  };
}
