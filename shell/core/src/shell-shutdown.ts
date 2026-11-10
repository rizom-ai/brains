import type { ShellLifecycle } from "./initialization/shell-lifecycle";
import type { ShellServices } from "./types/shell-types";
import { HTTP_HOST_DAEMON } from "./http-host";

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
  // job runtime, the HTTP host, then plugins before package/database scopes
  // close.
  lifecycle.addFinalizer(() => services.pluginManager.shutdownPlugins());

  // The host stops admitting requests before the plugins whose routes it
  // serves shut down.
  lifecycle.addFinalizer(async () => {
    if (services.daemonRegistry.has(HTTP_HOST_DAEMON)) {
      await services.daemonRegistry.unregister(HTTP_HOST_DAEMON);
    }
  });

  lifecycle.addFinalizer(() => services.jobServicesLifecycle.closeRuntime());

  lifecycle.addFinalizer(() => services.agentService.shutdown?.());

  lifecycle.addFinalizer(() =>
    services.daemonRegistry.unregister("shell:guest-retention"),
  );

  // Abort cancellation-aware checks before active turns and the worker drain.
  // Their durable jobs remain retryable instead of holding remote I/O open.
  lifecycle.addFinalizer(() =>
    services.daemonRegistry.unregister("shell:recurring-checks"),
  );
}
