import { Context, scopedServiceLayer } from "@brains/utils/effect";
import type { Layer } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import { RuntimeStateService } from "./runtime-state-service";
import type { IRuntimeStateService, RuntimeStateServiceConfig } from "./types";

export type RuntimeStateServiceTag =
  "@brains/runtime-state/RuntimeStateService";
export const RuntimeStateServiceTag: Context.Tag<
  RuntimeStateServiceTag,
  IRuntimeStateService
> = Context.GenericTag<RuntimeStateServiceTag, IRuntimeStateService>(
  "@brains/runtime-state/RuntimeStateService",
);

export interface RuntimeStateServiceLayerOptions {
  config: RuntimeStateServiceConfig;
  logger: Logger;
  service?: IRuntimeStateService;
}

/** Own one runtime-state database service for the lifetime of the layer scope. */
export function createRuntimeStateServiceLayer(
  options: RuntimeStateServiceLayerOptions,
): Layer.Layer<RuntimeStateServiceTag> {
  return scopedServiceLayer(RuntimeStateServiceTag, () => {
    const service =
      options.service ??
      RuntimeStateService.createFresh(options.config, options.logger);
    return { service, close: () => service.close() };
  });
}
