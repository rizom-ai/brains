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
  lifecycle.addFinalizer(() => services.agentService.shutdown?.());

  lifecycle.addFinalizer(() => services.pluginManager.shutdownPlugins());

  lifecycle.addFinalizer(() =>
    services.daemonRegistry.unregister("shell:recurring-checks"),
  );

  lifecycle.addFinalizer(() => services.jobServicesLifecycle.closeRuntime());
}
