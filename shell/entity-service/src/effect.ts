import { Context, scopedServiceLayer } from "@brains/utils/effect";
import type { Layer } from "@brains/utils/effect";
import { EntityService } from "./entityService";
import type { EntityServiceOptions } from "./entityService";
import { RemoteEntityService } from "./remote-entity-service";
import type { EntityRpcTransport } from "./entity-rpc";
import type { ProjectionStoreRpcTransport } from "./projection-rpc";
import type { EntityService as IEntityService } from "./types";

export type EntityServiceTag = "@brains/entity-service/EntityService";
export const EntityServiceTag: Context.Tag<EntityServiceTag, IEntityService> =
  Context.GenericTag<EntityServiceTag, IEntityService>(
    "@brains/entity-service/EntityService",
  );

export interface EntityServiceLayerOptions extends EntityServiceOptions {
  remoteTransport?: EntityRpcTransport;
  projectionTransport?: ProjectionStoreRpcTransport;
  service?: IEntityService;
}

function isCloseableEntityService(
  service: IEntityService,
): service is IEntityService & { close(): void } {
  return "close" in service && typeof service.close === "function";
}

/** Own one entity service and both of its databases for the layer scope. */
export function createEntityServiceLayer(
  options: EntityServiceLayerOptions,
): Layer.Layer<EntityServiceTag> {
  return scopedServiceLayer(EntityServiceTag, () => {
    if (
      (options.remoteTransport === undefined) !==
      (options.projectionTransport === undefined)
    ) {
      throw new Error(
        "Remote entity service requires both entity and projection transports",
      );
    }
    const createRemoteService = (): RemoteEntityService => {
      if (
        !options.remoteTransport ||
        !options.projectionTransport ||
        !options.jobQueueService
      ) {
        throw new Error(
          "Remote entity service requires entity, projection, and job queue transports",
        );
      }
      return new RemoteEntityService({
        transport: options.remoteTransport,
        projectionTransport: options.projectionTransport,
        embeddingService: options.embeddingService,
        entityRegistry: options.entityRegistry,
        jobQueueService: options.jobQueueService,
        ...(options.logger && { logger: options.logger }),
        ...(options.messageBus && { messageBus: options.messageBus }),
      });
    };
    const service =
      options.service ??
      (options.remoteTransport
        ? createRemoteService()
        : EntityService.createFresh(options));
    return {
      service,
      close: (): void => {
        if (isCloseableEntityService(service)) service.close();
      },
    };
  });
}
