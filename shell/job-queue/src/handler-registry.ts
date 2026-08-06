import type { Logger } from "@brains/utils/logger";
import type {
  JobExecutionRegistration,
  JobHandler,
  JobHandlerRegistrationMode,
  JobValidator,
} from "./types";

interface OwnedHandler {
  readonly handler: JobHandler;
  readonly pluginId: string | undefined;
}

/** Process-local registry separating durable validation from execution. */
export class HandlerRegistry {
  private readonly declarations = new Map<string, OwnedHandler>();
  private readonly handlers = new Map<string, JobHandler>();
  private readonly validators = new Map<string, JobValidator>();
  private readonly logger: Logger;
  private readonly mode: JobHandlerRegistrationMode;
  private finalizedRegistrations:
    readonly JobExecutionRegistration[] | undefined;

  public constructor(logger: Logger, mode: JobHandlerRegistrationMode) {
    this.logger = logger.child("HandlerRegistry");
    this.mode = mode;
  }

  public registerHandler(
    type: string,
    handler: JobHandler,
    pluginId?: string,
  ): void {
    if (this.finalizedRegistrations) {
      throw new Error("Job handler registrations are finalized");
    }
    if (this.declarations.has(type)) {
      throw new Error(`Job handler is already registered for type: ${type}`);
    }

    this.declarations.set(type, { handler, pluginId });
    this.validators.set(type, handler);
    if (this.mode !== "validation-only") {
      this.handlers.set(type, handler);
    }
    this.logger.debug("Registered job execution declaration", {
      type,
      pluginId,
      mode: this.mode,
    });
  }

  public unregisterHandler(type: string): void {
    this.declarations.delete(type);
    this.handlers.delete(type);
    this.validators.delete(type);
    this.logger.debug("Unregistered job handler", { type });
  }

  public unregisterPluginHandlers(pluginId: string): void {
    const typesToRemove = [...this.declarations.entries()]
      .filter(([, registration]) => registration.pluginId === pluginId)
      .map(([type]) => type);

    for (const type of typesToRemove) {
      this.declarations.delete(type);
      this.handlers.delete(type);
      this.validators.delete(type);
    }

    if (typesToRemove.length > 0) {
      this.logger.debug("Unregistered plugin handlers", {
        pluginId,
        count: typesToRemove.length,
        types: typesToRemove,
      });
    }
  }

  public finalizeRegistrations(): readonly JobExecutionRegistration[] {
    this.finalizedRegistrations ??= Object.freeze(
      [...this.declarations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, registration]) =>
          Object.freeze({ type, pluginId: registration.pluginId }),
        ),
    );
    return this.finalizedRegistrations;
  }

  public getExecutionRegistrations(): readonly JobExecutionRegistration[] {
    if (!this.finalizedRegistrations) {
      throw new Error("Job handler registrations are not finalized");
    }
    return this.finalizedRegistrations;
  }

  public getRegisteredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  public getHandler(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }

  public getValidator(type: string): JobValidator | undefined {
    return this.validators.get(type);
  }
}
