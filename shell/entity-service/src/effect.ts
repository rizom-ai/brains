import { Context, Effect, Layer } from "@brains/utils/effect";
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
  return Layer.scoped(
    EntityServiceTag,
    Effect.acquireRelease(
      Effect.sync(() => options.service ?? EntityService.createFresh(options)),
      (service) =>
        Effect.sync(() => {
          if (isCloseableEntityService(service)) service.close();
        }),
    ),
  );
}
