import { Context, scopedServiceLayer } from "@brains/utils/effect";
import type { Layer } from "@brains/utils/effect";
import { EntityService } from "./entityService";
import type { EntityServiceOptions } from "./entityService";
import type { EntityService as IEntityService } from "./types";

export type EntityServiceTag = "@brains/entity-service/EntityService";
export const EntityServiceTag: Context.Tag<EntityServiceTag, IEntityService> =
  Context.GenericTag<EntityServiceTag, IEntityService>(
    "@brains/entity-service/EntityService",
  );

export interface EntityServiceLayerOptions extends EntityServiceOptions {
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
    const service = options.service ?? EntityService.createFresh(options);
    return {
      service,
      close: (): void => {
        if (isCloseableEntityService(service)) service.close();
      },
    };
  });
}
