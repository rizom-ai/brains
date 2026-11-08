import type { BusContract, Channel } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { IMessagingNamespace } from "../base/context-types";
import type { ChannelDeliveryProvider } from "../channel-registry";
import type { SchemaValue } from "../internal/schema-value";
import {
  buildServiceTool,
  type ServiceBusDelivery,
  type ServiceInputSchema,
  type ServiceSchema,
  type ServiceToolDefinition,
} from "./service-definition-contract";

/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer. No public entry
 * exports it; a first-party package reaches the runtime with
 * `serviceRuntime(context)` on a slot context the brain built.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

const firstPartyToolName = /^[a-z][a-z0-9_-]*$/u;

/**
 * A tool as `defineTool` declares one, whose local name may also carry an
 * underscore, as a first-party class's tools were named
 * (`atproto-registry_check_contracts`). The public `defineTool` keeps its
 * kebab-case rule.
 */
export function firstPartyTool<
  const TName extends string,
  TInputSchema extends ServiceInputSchema,
  const TOutputSchema extends ServiceSchema,
>(
  definition: Omit<
    ServiceToolDefinition<TName, TInputSchema, TOutputSchema>,
    "kind"
  >,
): ServiceToolDefinition<TName, TInputSchema, TOutputSchema> {
  if (!firstPartyToolName.test(definition.name)) {
    throw new Error(
      `First-party tool name "${definition.name}" must start with a lowercase letter and contain only lowercase letters, numbers, hyphens and underscores`,
    );
  }
  return buildServiceTool(definition);
}

/**
 * Where a channel is heard, as a class subscribed to it: `subscribe` in the
 * main process only, `observe` from the main process for what every process
 * raises, and `execution` in every process, each hearing its own.
 */
export type ServiceListenMode = "subscribe" | "observe" | "execution";

/** What hearing a channel is handed: its payload. */
export type ServiceListenHandler<TPayload> = (context: {
  readonly payload: TPayload;
}) => void | Promise<void>;

export interface ServiceListenOptions {
  readonly mode?: ServiceListenMode | undefined;
}

/** The internal capabilities a first-party service's slot context carries. */
export interface ServiceRuntime {
  /** The package's logger, as its class logged. */
  readonly logger: Logger;
  /**
   * Answer a first-party contract under the channel it already has, such as
   * `notifications:send`, as the package; with `everyProcess`, in job
   * workers too, as the class answered it. The public `answer` answers only
   * channels its package names. Released when the package shuts down.
   */
  answer<const TRequest extends z.ZodType, const TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, ServiceBusDelivery>,
    handler: (context: {
      readonly request: z.output<TRequest>;
      readonly sender: string;
    }) => SchemaValue<TResponse> | Promise<SchemaValue<TResponse>>,
    options?: { readonly everyProcess?: boolean | undefined },
  ): void;
  /**
   * Hear a system or broadcast channel, as the package: through its typed
   * channel the payload is validated and a malformed one is never handed on;
   * by name it is handed on as sent. Released when the package shuts down.
   */
  listen<TPayload>(
    channel: Channel<TPayload>,
    handler: ServiceListenHandler<TPayload>,
    options?: ServiceListenOptions,
  ): void;
  listen(
    channel: string,
    handler: ServiceListenHandler<unknown>,
    options?: ServiceListenOptions,
  ): void;
  /** The transport registered for a recipient's channel type, if any. */
  deliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
}

/** What the runtime binds a first-party service's runtime to. */
export interface ServiceRuntimeBinding {
  readonly logger: Logger;
  readonly messaging: IMessagingNamespace;
  readonly deliveryProvider: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  /** Runs a handler as the package acting as itself. */
  readonly asPackage: <T>(run: () => Promise<T>) => Promise<T>;
  /** Keeps a release to run when the package shuts down. */
  readonly onRelease: (release: () => void) => void;
}

const serviceRuntimeKey = Symbol("rizom.first-party-service-runtime");

function bindServiceRuntime(binding: ServiceRuntimeBinding): ServiceRuntime {
  const { messaging, asPackage, onRelease } = binding;
  const runtime: ServiceRuntime = {
    logger: binding.logger,
    deliveryProvider: binding.deliveryProvider,
    answer(contract, handler, options = {}): void {
      // The bus checks the answer against the contract's own schema, as the
      // public answer does; erasing the response type is what lets a handler
      // typed by its contract hand the bus a value it parses.
      const erased: BusContract<typeof contract.schema, z.ZodType> = contract;
      onRelease(
        messaging.answer(
          erased,
          (request, { sender }) =>
            asPackage(async () => handler({ request, sender })),
          options.everyProcess === true ? { everyProcess: true } : {},
        ),
      );
    },
    listen(
      channel: Channel<unknown> | string,
      handler: ServiceListenHandler<unknown>,
      options: ServiceListenOptions = {},
    ): void {
      const mode = options.mode ?? "subscribe";
      const hear = async (payload: unknown): Promise<{ success: true }> => {
        await asPackage(async () => handler({ payload }));
        return { success: true };
      };
      onRelease(
        typeof channel === "string"
          ? // By name, the payload is handed on as sent.
            subscribeByName(messaging, mode, channel, (message) =>
              hear(message.payload),
            )
          : subscribeTyped(messaging, mode, channel, hear),
      );
    },
  };
  return Object.freeze(runtime);
}

function subscribeTyped<TPayload>(
  messaging: IMessagingNamespace,
  mode: ServiceListenMode,
  channel: Channel<TPayload>,
  handler: (payload: TPayload) => Promise<{ success: true }>,
): () => void {
  switch (mode) {
    case "observe":
      return messaging.observe(channel, handler);
    case "execution":
      return messaging.subscribeExecution(channel, handler);
    case "subscribe":
      return messaging.subscribe(channel, handler);
  }
}

function subscribeByName(
  messaging: IMessagingNamespace,
  mode: ServiceListenMode,
  channel: string,
  handler: (message: { readonly payload: unknown }) => Promise<{
    success: true;
  }>,
): () => void {
  switch (mode) {
    case "observe":
      return messaging.observe(channel, handler);
    case "execution":
      return messaging.subscribeExecution(channel, handler);
    case "subscribe":
      return messaging.subscribe(channel, handler);
  }
}

/**
 * A slot context the runtime hands a first-party service, with its internal
 * runtime attached under a key no public type names.
 */
export function withServiceRuntime<TContext extends object>(
  context: TContext,
  binding: ServiceRuntimeBinding,
): TContext {
  Object.defineProperty(context, serviceRuntimeKey, {
    value: bindServiceRuntime(binding),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return context;
}

function isServiceRuntime(value: unknown): value is ServiceRuntime {
  return typeof value === "object" && value !== null;
}

/**
 * The internal runtime a first-party service's slot context carries.
 * First-party packages only: a context the brain's runtime did not build,
 * such as a test double, has none, and is refused.
 */
export function serviceRuntime(context: object): ServiceRuntime {
  const runtime: unknown = Reflect.get(context, serviceRuntimeKey);
  if (!isServiceRuntime(runtime)) {
    throw new Error(
      "This context carries no service runtime: serviceRuntime() reaches internal capabilities of a slot context the brain's runtime built, for first-party packages only",
    );
  }
  return runtime;
}
