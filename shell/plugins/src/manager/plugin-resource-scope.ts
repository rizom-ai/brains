import type { IMessageBus, MessageHandler } from "@brains/messaging-service";
import type { IAttachmentsNamespace } from "../service/attachment-registry";
import { Cause, Effect, Exit, Scope } from "@brains/utils/effect";
import type { IShell } from "../interfaces";

interface PluginIngress {
  stopAdmission(): void;
  drain(): Promise<void>;
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

  public addFinalizer(finalizer: () => void | Promise<void>): void {
    if (this.closed) {
      throw new Error("Cannot register a resource after plugin teardown");
    }
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
    if (this.closed) {
      throw new Error("Cannot register ingress after plugin teardown");
    }
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
    subscribe: <T = unknown, R = unknown>(
      type: string,
      handler: MessageHandler<T, R>,
      filter?: Parameters<IMessageBus["subscribe"]>[2],
    ): (() => void) => {
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
  };

  const attachments = shell.getAttachmentRegistry();
  const scopedAttachments: IAttachmentsNamespace = {
    ...attachments,
    register: (sourceEntityType, attachmentType, provider): (() => void) => {
      let active = true;
      const unregister = attachments.register(
        sourceEntityType,
        attachmentType,
        provider,
      );
      const release = (): void => {
        if (!active) return;
        active = false;
        unregister();
      };
      resources.addFinalizer(release);
      return release;
    },
  };

  const entityRegistry = shell.getEntityRegistry();
  const scopedEntityRegistry = new Proxy(entityRegistry, {
    get(target, property): unknown {
      const value = Reflect.get(target, property, target) as unknown;
      if (property === "registerEntityType" && typeof value === "function") {
        return (...args: unknown[]): unknown => {
          const result = Reflect.apply(value, target, args);
          const entityType = args[0];
          if (typeof entityType === "string") {
            resources.addFinalizer(() =>
              target.unregisterEntityType(entityType),
            );
          }
          return result;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const dataSourceRegistry = shell.getDataSourceRegistry();
  const scopedDataSourceRegistry = new Proxy(dataSourceRegistry, {
    get(target, property): unknown {
      const value = Reflect.get(target, property, target) as unknown;
      if (property === "register" && typeof value === "function") {
        return (...args: unknown[]): unknown => {
          const result = Reflect.apply(value, target, args);
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
            resources.addFinalizer(() => target.unregister(id));
          }
          return result;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const insightsRegistry = shell.getInsightsRegistry();
  const scopedInsightsRegistry = new Proxy(insightsRegistry, {
    get(target, property): unknown {
      const value = Reflect.get(target, property, target) as unknown;
      if (property === "register" && typeof value === "function") {
        return (...args: unknown[]): unknown => {
          const result = Reflect.apply(value, target, args);
          const insightType = args[0];
          if (typeof insightType === "string") {
            resources.addFinalizer(() => target.unregister(insightType));
          }
          return result;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(shell, {
    get(target, property): unknown {
      if (property === "getMessageBus") {
        return (): IMessageBus => scopedMessageBus;
      }
      if (property === "getAttachmentRegistry") {
        return (): IAttachmentsNamespace => scopedAttachments;
      }
      if (property === "getEntityRegistry") {
        return () => scopedEntityRegistry;
      }
      if (property === "getDataSourceRegistry") {
        return () => scopedDataSourceRegistry;
      }
      if (property === "getInsightsRegistry") {
        return () => scopedInsightsRegistry;
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
