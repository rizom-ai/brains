import { defineServicePlugin } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withJobHandlers,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { directorySyncConfigSchema } from "./types";
import { directorySyncContextOf } from "./lib/sync-context";
import { DirectorySyncService } from "./service";

/** What the package holds once set up: directory sync as it runs. */
export interface DirectorySyncState {
  readonly sync: DirectorySyncService;
}

/** A test's view of the package's state once set up. */
export interface DirectorySyncDeps {
  readonly onSetup?: ((state: DirectorySyncState) => void) | undefined;
}

/**
 * Directory sync: the brain's records mirrored to Markdown files and, with
 * Git configured, to the checkout the git broker owns; the startup import,
 * durable export, the file watcher, the sync tool, its Studio workspace and
 * its answers about the sync directory. Registered as its class did: the
 * common work first, its jobs, then Git and each role's work.
 */
export function createDirectorySyncPackage(
  deps: DirectorySyncDeps = {},
): ServicePackageDefinition<typeof directorySyncConfigSchema> {
  const service = defineServicePlugin({
    id: "directory-sync",
    config: directorySyncConfigSchema,
    setup: async (context): Promise<DirectorySyncState> => {
      const runtime = serviceRuntime(context);
      const sync = new DirectorySyncService(
        context.config,
        directorySyncContextOf(runtime),
      );
      await sync.registerCommon();
      // After its job handlers: a replay Git runs here queues them.
      runtime.registering(() => sync.registerRoles());
      runtime.ready(() => sync.ready());
      context.lifecycle.onCleanup(() => sync.shutdown());
      const state = { sync };
      deps.onSetup?.(state);
      return state;
    },
  });
  return withTools<typeof directorySyncConfigSchema, DirectorySyncState>(
    withJobHandlers<typeof directorySyncConfigSchema, DirectorySyncState>(
      service,
      ({ state }) => state.sync.jobHandlers(),
    ),
    ({ state }) => state.sync.tools(),
  );
}
