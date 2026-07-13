import type { ShellLifecycle } from "./initialization/shell-lifecycle";
import type { ShellServices } from "./types/shell-types";

/**
 * Register runtime resources after transactional service acquisition. Effect
 * closes them before the database and subscription finalizers owned by the
 * service factory.
 */
export function registerShellRuntimeFinalizers(
  lifecycle: ShellLifecycle,
  services: ShellServices,
): void {
  lifecycle.addFinalizer(async () => {
    for (const [pluginId] of services.pluginManager.getAllPlugins()) {
      await services.pluginManager.disablePlugin(pluginId);
    }
  });

  lifecycle.addFinalizer(() => services.jobQueueWorker.stop());
  lifecycle.addFinalizer(() => services.jobProgressMonitor.stop());
  lifecycle.addFinalizer(() => services.batchJobManager.stop());
}
