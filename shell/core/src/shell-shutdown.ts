import type { ShellLifecycle } from "./initialization/shell-lifecycle";
import {
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "./local-database-endpoint";
import type { ShellServices } from "./types/shell-types";

interface EntityJobOutboxOwner {
  flushJobOutbox(): Promise<number>;
}

function ownsEntityJobOutbox(service: object): service is EntityJobOutboxOwner {
  return (
    "flushJobOutbox" in service && typeof service.flushJobOutbox === "function"
  );
}

/**
 * Register runtime resources after transactional service acquisition. Effect
 * closes them before the database and subscription finalizers owned by the
 * service factory.
 */
export function registerShellRuntimeFinalizers(
  lifecycle: ShellLifecycle,
  services: ShellServices,
): void {
  // Scope finalizers run in reverse registration order. A worker must drain
  // its runtime before closing the shared endpoint client because worker-session
  // cleanup uses that client.
  const endpoint = services.localDatabaseEndpoint;
  if (endpoint instanceof LocalDatabaseRpcClient) {
    lifecycle.addFinalizer(() => endpoint.close());
  }

  // Register the outbox before runtime cleanup so it drains after runtime work
  // stops but before either owner database scope closes.
  const entityService = services.entityService;
  if (ownsEntityJobOutbox(entityService)) {
    lifecycle.addFinalizer(async () => {
      try {
        const delivered = await entityService.flushJobOutbox();
        if (delivered > 0) {
          services.logger.debug(
            "Flushed embedding job intents during shutdown",
            { delivered },
          );
        }
      } catch (error) {
        services.logger.error(
          "Failed to flush embedding job intents during shutdown; intents remain durable",
          error,
        );
      }
    });
  }

  // Dependents are added after their dependencies so shutdown runs recurring
  // checks, agent turns, job runtime, then plugins before package/database
  // scopes close.
  lifecycle.addFinalizer(() => services.pluginManager.shutdownPlugins());

  lifecycle.addFinalizer(() => services.jobServicesLifecycle.closeRuntime());

  lifecycle.addFinalizer(() => services.agentService.shutdown?.());

  // Abort cancellation-aware checks before active turns and the worker drain.
  // Their durable jobs remain retryable instead of holding remote I/O open.
  lifecycle.addFinalizer(() =>
    services.daemonRegistry.unregister("shell:recurring-checks"),
  );

  // The web owner rejects remote persistence traffic before runtime drains and
  // database cleanup. Unlike the worker client, the server is not needed to
  // stop local runtime services.
  if (endpoint instanceof LocalDatabaseRpcServer) {
    lifecycle.addFinalizer(() => endpoint.close());
  }
}
