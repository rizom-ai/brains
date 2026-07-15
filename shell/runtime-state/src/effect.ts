import { Context, Effect, Layer } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import { RuntimeStateService } from "./runtime-state-service";
import type { RuntimeStateServiceConfig } from "./types";

export type RuntimeStateServiceTag =
  "@brains/runtime-state/RuntimeStateService";
export const RuntimeStateServiceTag: Context.Tag<
  RuntimeStateServiceTag,
  RuntimeStateService
> = Context.GenericTag<RuntimeStateServiceTag, RuntimeStateService>(
  "@brains/runtime-state/RuntimeStateService",
);

export interface RuntimeStateServiceLayerOptions {
  config: RuntimeStateServiceConfig;
  logger: Logger;
  service?: RuntimeStateService;
}

/** Own one runtime-state database service for the lifetime of the layer scope. */
export function createRuntimeStateServiceLayer(
  options: RuntimeStateServiceLayerOptions,
): Layer.Layer<RuntimeStateServiceTag> {
  return Layer.scoped(
    RuntimeStateServiceTag,
    Effect.acquireRelease(
      Effect.sync(
        () =>
          options.service ??
          RuntimeStateService.createFresh(options.config, options.logger),
      ),
      (service) =>
        Effect.sync(() => {
          service.close();
        }),
    ),
  );
}
