import type { ShellServices } from "./initialization/shellInitializer";

export async function shutdownShellServices(
  services: ShellServices,
): Promise<void> {
  // Stop background services in reverse order of initialization
  services.batchJobManager.stop();
  services.jobProgressMonitor.stop();
  await services.jobQueueWorker.stop();

  for (const [pluginId] of services.pluginManager.getAllPlugins()) {
    await services.pluginManager.disablePlugin(pluginId);
  }

  for (const dispose of services.disposables.splice(0)) {
    try {
      dispose();
    } catch (error) {
      services.logger.warn("Failed to dispose shell subscription", error);
    }
  }

  // Close all database connections
  services.entityService.close();
  services.jobQueueService.close();
  services.conversationService.close();
}
