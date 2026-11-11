import { defineServicePlugin } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import { atprotoConfigSchema } from "./config";
import { atprotoContextOf, type AtprotoContext } from "./atproto-context";
import { AtprotoService, type AtprotoPluginDeps } from "./plugin";
import { buildAtprotoWebRoutes } from "./web-routes";

/** What the package holds once set up. */
export interface AtprotoState {
  readonly atproto: AtprotoService;
  readonly context: AtprotoContext;
}

export interface AtprotoPackageDeps extends AtprotoPluginDeps {
  /** Told the state once setup has built it. */
  onSetup?: ((state: AtprotoState) => void) | undefined;
}

/**
 * The brain on the AT Protocol: its brain card and canonical lexicons
 * published, projected entities following every publish and change, peers'
 * cards discovered from Jetstream, and the brain's and its anchor's did:web
 * documents served.
 */
export function createAtprotoPackage(
  deps: AtprotoPackageDeps = {},
): ServicePackageDefinition<typeof atprotoConfigSchema> {
  const { onSetup, ...serviceDeps } = deps;
  const service = defineServicePlugin({
    id: "atproto",
    config: atprotoConfigSchema,
    setup: (context): AtprotoState => {
      const runtime = serviceRuntime(context);
      const atproto = new AtprotoService(
        context.config,
        serviceDeps,
        runtime.logger,
      );
      const atprotoContext = atprotoContextOf(runtime);
      atproto.listen(runtime, atprotoContext);
      runtime.ready(() => atproto.ready(atprotoContext));
      context.lifecycle.onCleanup(() => atproto.shutdown());
      const state = { atproto, context: atprotoContext };
      onSetup?.(state);
      return state;
    },
  });
  return withWebRoutes(service, ({ config }) => buildAtprotoWebRoutes(config));
}
