import { Context, scopedServiceLayer } from "@brains/utils/effect";
import type { Layer } from "@brains/utils/effect";
import type { Logger } from "@brains/utils/logger";
import { RemoteRuntimeStateService } from "./remote-runtime-state-service";
import { RuntimeStateService } from "./runtime-state-service";
import type { RuntimeStateRpcTransport } from "./runtime-state-rpc";
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
  remoteTransport?: RuntimeStateRpcTransport;
  service?: IRuntimeStateService;
}

/** Own one runtime-state database service for the lifetime of the layer scope. */
export function createRuntimeStateServiceLayer(
  options: RuntimeStateServiceLayerOptions,
): Layer.Layer<RuntimeStateServiceTag> {
  return scopedServiceLayer(RuntimeStateServiceTag, () => {
    const service =
      options.service ??
      (options.remoteTransport
        ? new RemoteRuntimeStateService(options.remoteTransport, options.logger)
        : RuntimeStateService.createFresh(options.config, options.logger));
    return { service, close: () => service.close() };
  });
}
