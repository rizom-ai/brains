import type { IMessageBus, MessageHandler } from "@brains/messaging-service";
import type { IAttachmentsNamespace } from "../service/attachment-registry";
import { Cause, Effect, Exit, Scope } from "effect";
import type { IShell } from "../interfaces";

/** Internal resource scope for one plugin registration. */
export class PluginResourceScope {
  private readonly scope: Scope.CloseableScope;
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

  public close(exit: Exit.Exit<unknown, unknown> = Exit.void): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeScope(exit);
    return this.closePromise;
  }

  private async closeScope(exit: Exit.Exit<unknown, unknown>): Promise<void> {
    const result = await Effect.runPromiseExit(Scope.close(this.scope, exit));
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
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
  const scopedMessageBus: IMessageBus = {
    send: (request) => messageBus.send(request),
    subscribe: <T = unknown, R = unknown>(
      type: string,
      handler: MessageHandler<T, R>,
      filter?: Parameters<IMessageBus["subscribe"]>[2],
    ): (() => void) => {
      let active = true;
      const unsubscribe = messageBus.subscribe(type, handler, filter);
      const release = (): void => {
        if (!active) return;
        active = false;
        unsubscribe();
      };
      resources.addFinalizer(release);
      return release;
    },
    unsubscribe: (type, handler) => messageBus.unsubscribe(type, handler),
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
