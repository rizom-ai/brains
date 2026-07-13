import type { ShellLifecycle } from "./initialization/shell-lifecycle";
import type { ShellServices } from "./types/shell-types";

/**
 * Register shell resources in acquisition order. Effect closes them in reverse,
 * preserving the established shutdown contract while still running later
 * finalizers when an earlier one fails.
 */
export function registerShellServiceFinalizers(
  lifecycle: ShellLifecycle,
  services: ShellServices,
): void {
  // Databases are acquired first and must outlive every runtime service.
  lifecycle.addFinalizer(() => services.runtimeStateService.close());
  lifecycle.addFinalizer(() => services.conversationService.close());
  lifecycle.addFinalizer(() => services.jobQueueService.close());
  lifecycle.addFinalizer(() => services.entityService.close());

  lifecycle.addFinalizer(() => {
    for (const dispose of services.disposables.splice(0)) {
      try {
        dispose();
      } catch (error) {
        services.logger.warn("Failed to dispose shell subscription", error);
      }
    }
  });

  lifecycle.addFinalizer(async () => {
    for (const [pluginId] of services.pluginManager.getAllPlugins()) {
      await services.pluginManager.disablePlugin(pluginId);
    }
  });

  lifecycle.addFinalizer(() => services.jobQueueWorker.stop());
  lifecycle.addFinalizer(() => services.jobProgressMonitor.stop());
  lifecycle.addFinalizer(() => services.batchJobManager.stop());
}
