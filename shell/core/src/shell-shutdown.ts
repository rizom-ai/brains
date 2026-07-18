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
  // Scope finalizers run in reverse registration order. Dependents are added
  // after their dependencies so shutdown runs recurring checks, agent turns,
  // job runtime, then plugins before package/database scopes close.
  lifecycle.addFinalizer(() => services.pluginManager.shutdownPlugins());

  lifecycle.addFinalizer(() => services.jobServicesLifecycle.closeRuntime());

  lifecycle.addFinalizer(() => services.agentService.shutdown?.());

  // Abort cancellation-aware checks before active turns and the worker drain.
  // Their durable jobs remain retryable instead of holding remote I/O open.
  lifecycle.addFinalizer(() =>
    services.daemonRegistry.unregister("shell:recurring-checks"),
  );
}
