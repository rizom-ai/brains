import type { IMessageBus, MessageHandler } from "@brains/messaging-service";
import type { AttachmentRegistrationNamespace } from "../service/attachment-registry";
import { Cause, Effect, Exit, Scope } from "@brains/utils/effect";
import type { IShell } from "../interfaces";
import { forwardHttpRouteSnapshot } from "@brains/plugins/internal/http-route-snapshot";

interface PluginIngress {
  stopAdmission(): void;
  drain(): Promise<void>;
}

/**
 * `Reflect.get` is declared to return `any`, which spreads through every Proxy
 * `get` trap below. Declaring the return as `unknown` here re-tightens it once,
 * so the traps get a checked value without asserting one each time.
 */
function reflectGet(target: object, property: PropertyKey): unknown {
  return Reflect.get(target, property, target);
}

/**
 * Call a trapped method. The result is `unknown` for the same reason as above;
 * callers that need a specific type must establish it themselves.
 */
function reflectApply(
  method: unknown,
  target: object,
  args: unknown[],
): unknown {
  if (typeof method !== "function") {
    throw new TypeError("Cannot apply a non-callable trapped member");
  }
  return Reflect.apply(method, target, args);
}

/** Internal resource scope for one plugin registration. */
export class PluginResourceScope {
  private readonly scope: Scope.CloseableScope;
  private readonly ingress = new Set<PluginIngress>();
  private closePromise: Promise<void> | null = null;
  private closed = false;

  public constructor() {
    this.scope = Effect.runSync(Scope.make());
  }

  public assertOpen(): void {
    if (this.closed) {
      throw new Error("Cannot register a resource after plugin teardown");
    }
  }

  /** Admit synchronous acquisition and own its release before returning it. */
  public acquire<T>(acquire: () => T, release: (resource: T) => void): T {
    this.assertOpen();
    const resource = acquire();
    try {
      this.addFinalizer(() => release(resource));
    } catch (error) {
      // Acquisition can re-enter teardown. Roll back the resource if ownership
      // could not be attached to the now-closed scope.
      try {
        release(resource);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Plugin acquisition rollback failed",
          { cause: cleanupError },
        );
      }
      throw error;
    }
    return resource;
  }

  public addFinalizer(finalizer: () => void | Promise<void>): void {
    this.assertOpen();
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.promise(async () => {
          await finalizer();
        }),
      ),
    );
  }

  /** Register Promise-based ingress that must stop admission and drain on close. */
  public addIngress(ingress: PluginIngress): void {
    this.assertOpen();
    this.ingress.add(ingress);
  }

  public close(exit: Exit.Exit<unknown, unknown> = Exit.void): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeScope(exit);
    return this.closePromise;
  }

  private async closeScope(exit: Exit.Exit<unknown, unknown>): Promise<void> {
    let firstFailure: unknown;
    let failed = false;
    const ingress = [...this.ingress].reverse();
    for (const entry of ingress) {
      try {
        entry.stopAdmission();
      } catch (error) {
        if (!failed) firstFailure = error;
        failed = true;
      }
    }

    const drainResults = await Promise.allSettled(
      ingress.map((entry) => Promise.resolve().then(() => entry.drain())),
    );
    this.ingress.clear();
    const drainFailure = drainResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (!failed && drainFailure) {
      firstFailure = drainFailure.reason;
      failed = true;
    }

    const scopeResult = await Effect.runPromiseExit(
      Scope.close(this.scope, exit),
    );
    if (!failed && Exit.isFailure(scopeResult)) {
      firstFailure = Cause.squash(scopeResult.cause);
      failed = true;
    }
    if (failed) throw firstFailure;
  }
}

/** Centralize reflective registration while preserving each registry's API. */
function scopeRegistry<T extends object>(
  target: T,
  methods: readonly Extract<keyof T, string>[],
  resources: PluginResourceScope,
  release: (args: unknown[], result: unknown) => void,
): T {
  return new Proxy(target, {
    get(registry, property): unknown {
      const value = reflectGet(registry, property);
      if (
        typeof property === "string" &&
        methods.some((method) => method === property) &&
        typeof value === "function"
      ) {
        return (...args: unknown[]): unknown =>
          resources.acquire(
            () => reflectApply(value, registry, args),
            (result) => release(args, result),
          );
      }
      return typeof value === "function" ? value.bind(registry) : value;
    },
  });
}

function scopePluginRegistry<
  T extends { unregisterPlugin(pluginId: string): void },
>(
  target: T,
  methods: readonly Extract<keyof T, string>[],
  resources: PluginResourceScope,
): T {
  return scopeRegistry(target, methods, resources, (args): void => {
    const pluginId = args[0];
    if (typeof pluginId === "string") target.unregisterPlugin(pluginId);
  });
}

/**
 * Restrict plugin-visible resource acquisition to the plugin scope. The proxy
 * preserves the existing IShell API while owning every message subscription.
 */
export function createPluginScopedShell(
  shell: IShell,
  resources: PluginResourceScope,
): IShell {
  const messageBus = shell.getMessageBus();
  const messageSubscriptions = new Set<{
    type: string;
    originalHandler: unknown;
    stopAdmission(): void;
  }>();
  const scopedMessageBus: IMessageBus = {
    send: (request) => messageBus.send(request),
    hasHandlers: (type) => messageBus.hasHandlers?.(type) ?? false,
    subscribe: <T = unknown, R = unknown>(
      type: string,
      handler: MessageHandler<T, R>,
      filter?: Parameters<IMessageBus["subscribe"]>[2],
    ): (() => void) => {
      resources.assertOpen();
      let accepting = true;
      const inFlight = new Set<Promise<void>>();
      const scopedHandler: MessageHandler<T, R> = (message) => {
        if (!accepting) return { noop: true };

        // Message handlers have no cancellation contract. Track the admitted
        // Promise so plugin teardown drains it instead of interrupting work
        // that may already be mutating plugin-owned state.
        let settleAdmitted!: () => void;
        const admitted = new Promise<void>((resolve) => {
          settleAdmitted = resolve;
        });
        inFlight.add(admitted);
        const settle = (): void => {
          inFlight.delete(admitted);
          settleAdmitted();
        };

        let operation: Promise<Awaited<ReturnType<typeof handler>>>;
        try {
          operation = Promise.resolve(handler(message));
        } catch (error) {
          settle();
          throw error;
        }
        return operation.then(
          (result) => {
            settle();
            return result;
          },
          (error: unknown) => {
            settle();
            throw error;
          },
        );
      };
      const unsubscribe = messageBus.subscribe(type, scopedHandler, filter);
      const subscription = {
        type,
        originalHandler: handler,
        stopAdmission: (): void => {
          if (!accepting) return;
          accepting = false;
          unsubscribe();
          messageSubscriptions.delete(subscription);
        },
      };
      messageSubscriptions.add(subscription);
      try {
        resources.addIngress({
          stopAdmission: subscription.stopAdmission,
          drain: async (): Promise<void> => {
            await Promise.all(inFlight);
          },
        });
      } catch (error) {
        subscription.stopAdmission();
        throw error;
      }
      return subscription.stopAdmission;
    },
    unsubscribe: (type, handler): void => {
      const subscriptions = [...messageSubscriptions].filter(
        (subscription) =>
          subscription.type === type &&
          subscription.originalHandler === handler,
      );
      if (subscriptions.length === 0) {
        messageBus.unsubscribe(type, handler);
        return;
      }
      for (const subscription of subscriptions) {
        subscription.stopAdmission();
      }
    },
    // Scoping is about admission and teardown, not about what the bus can be
    // asked; these pass straight through to it.
    collect: (request) => messageBus.collect(request),
    validateMessage: (message, schema) =>
      messageBus.validateMessage(message, schema),
    getHandlerCount: (messageType) => messageBus.getHandlerCount(messageType),
    getTargetedHandlerCount: (messageType, target) =>
      messageBus.getTargetedHandlerCount(messageType, target),
    clearHandlers: (messageType) => messageBus.clearHandlers(messageType),
    clearAllHandlers: () => messageBus.clearAllHandlers(),
  };

  const attachments = shell.getAttachmentRegistry();
  const scopedAttachments: AttachmentRegistrationNamespace = {
    ...attachments,
    register: (sourceEntityType, attachmentType, provider): (() => void) =>
      resources.acquire(
        () => attachments.register(sourceEntityType, attachmentType, provider),
        (release) => release(),
      ),
  };

  const entityRegistry = shell.getEntityRegistry();
  const scopedEntityRegistry = scopeRegistry(
    entityRegistry,
    ["registerEntityType"],
    resources,
    (args): void => {
      const entityType = args[0];
      if (typeof entityType === "string")
        entityRegistry.unregisterEntityType(entityType);
    },
  );
  const scopedProfileKindRegistry = scopePluginRegistry(
    shell.getProfileKindRegistry(),
    ["register"],
    resources,
  );
  const scopedChannelRegistry = scopePluginRegistry(
    shell.getChannelRegistry(),
    ["registerDescriptor", "registerDeliveryProvider"],
    resources,
  );
  const scopedInboxRegistry = scopePluginRegistry(
    shell.getInboxRegistry(),
    ["registerSource"],
    resources,
  );
  const scopedInboxFollowUpRegistry = scopePluginRegistry(
    shell.getInboxFollowUpRegistry(),
    ["registerKind"],
    resources,
  );

  const accountSettingsRegistry = shell.getAccountSettingsRegistry();
  const scopedAccountSettingsRegistry = scopeRegistry(
    accountSettingsRegistry,
    ["register"],
    resources,
    (_args, registration): void => {
      // The registration stays an opaque token, handed directly back to its owner.
      reflectApply(
        accountSettingsRegistry.unregister,
        accountSettingsRegistry,
        [registration],
      );
    },
  );
  const scopedOperationalHealthRegistry = scopePluginRegistry(
    shell.getOperationalHealthRegistry(),
    ["register"],
    resources,
  );

  const dataSourceRegistry = shell.getDataSourceRegistry();
  const scopedDataSourceRegistry = scopeRegistry(
    dataSourceRegistry,
    ["register"],
    resources,
    (args): void => {
      const dataSource = args[0];
      if (
        typeof dataSource === "object" &&
        dataSource !== null &&
        "id" in dataSource &&
        typeof dataSource.id === "string"
      ) {
        const id = dataSource.id.includes(":")
          ? dataSource.id
          : `shell:${dataSource.id}`;
        dataSourceRegistry.unregister(id);
      }
    },
  );
  const insightsRegistry = shell.getInsightsRegistry();
  const scopedInsightsRegistry = scopeRegistry(
    insightsRegistry,
    ["register"],
    resources,
    (args): void => {
      const insightType = args[0];
      if (typeof insightType === "string")
        insightsRegistry.unregister(insightType);
    },
  );

  const scopedShell = new Proxy(shell, {
    get(target, property): unknown {
      if (property === "getMessageBus") {
        return (): IMessageBus => scopedMessageBus;
      }
      if (property === "getAttachmentRegistry") {
        return (): AttachmentRegistrationNamespace => scopedAttachments;
      }
      if (property === "getEntityRegistry") {
        return () => scopedEntityRegistry;
      }
      if (property === "getDataSourceRegistry") {
        return () => scopedDataSourceRegistry;
      }
      if (property === "getProfileKindRegistry") {
        return () => scopedProfileKindRegistry;
      }
      if (property === "getChannelRegistry") {
        return () => scopedChannelRegistry;
      }
      if (property === "getInboxRegistry") {
        return () => scopedInboxRegistry;
      }
      if (property === "getInboxFollowUpRegistry") {
        return () => scopedInboxFollowUpRegistry;
      }
      if (property === "getOperationalHealthRegistry") {
        return () => scopedOperationalHealthRegistry;
      }
      if (property === "getAccountSettingsRegistry") {
        return () => scopedAccountSettingsRegistry;
      }
      if (property === "getInsightsRegistry") {
        return () => scopedInsightsRegistry;
      }
      const value = reflectGet(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  forwardHttpRouteSnapshot(shell, scopedShell);
  return scopedShell;
}
