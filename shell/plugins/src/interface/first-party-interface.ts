import type { z } from "@brains/utils/zod";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
  ChannelDescriptor,
} from "../channel-registry";
import type { DaemonHealth } from "../manager/daemon-types";
import type { Tool } from "@brains/mcp-service";
import type { WebRouteDefinition } from "../types/web-routes";
import type { MessageInterfaceOutput } from "../message-interface/progress-message-coordinator";
import type { JobProgressEvent } from "@brains/job-queue";
import type { ToolActivityEvent } from "../message-interface/tool-event-handler";
import type { ToolStatusUpdate } from "../message-interface/tool-status";
import type { AgentResponse } from "../contracts/agent";
import type { PluginPackageDefinition } from "../package-definition";
import type { InterfaceConfigSchema } from "./interface-definition-contract";
import {
  isServicePackage,
  withServiceTools,
} from "../service/first-party-service";

/**
 * Internal, first-party only: what a first-party interface converted from a
 * class declares beside its public definition, as plain data and functions.
 * Each wrapper returns a new definition carrying the declaration; the class
 * bases are the runtime's, never the package's.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */

/**
 * What a first-party slot is given once: the parsed config and the state
 * setup returned, with the interface runtime attached
 * (`interfaceRuntime(context)`). The slot names the state its definition's
 * setup returns.
 */
export interface FirstPartySlotContext<TConfig, TState> {
  readonly config: TConfig;
  readonly state: TState;
}

/**
 * A daemon as its class registered it: started and stopped by the brain,
 * reporting its own health, under `<plugin id>:<id>`. It reports no
 * readiness and starting it does not wait for one, as the class's did not.
 */
export interface FirstPartyDaemon {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck?(): Promise<DaemonHealth>;
}

/**
 * A channel its class registered, in every process so background jobs can
 * send on it: what recipients are validated against and, when the interface
 * can send, how it delivers.
 */
export interface FirstPartyChannel {
  readonly descriptor: ChannelDescriptor;
  readonly delivery?:
    | {
        isAvailable(): Promise<boolean>;
        send(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult>;
      }
    | undefined;
}

/**
 * What a channels slot is given: the parsed config, with the interface
 * runtime attached. It runs in the worker too, so there is no state.
 */
export interface FirstPartyChannelsContext<TConfig> {
  readonly config: TConfig;
}

/** A message the runtime sends on a message transport: job progress and completions. */
export interface MessageTransportSend {
  /** The channel the job was started from; none for a single-channel interface. */
  readonly channelId: string | null;
  readonly message: MessageInterfaceOutput;
}

/**
 * How a first-party interface talks once it is a message transport: the
 * runtime's message coordination (job progress, completions held back while
 * input is answered) sends through it.
 */
/** A message the runtime edits in place: progress, or a reply it tracks for a job. */
export interface MessageTransportEdit {
  readonly channelId: string | null;
  readonly messageId: string;
  readonly message: MessageInterfaceOutput;
}

export interface MessageTransport {
  send(request: MessageTransportSend): void;
  /**
   * Send and answer the sent message's id, so progress can be edited in
   * place; none means the interface edits nothing.
   */
  sendWithId?(request: MessageTransportSend): Promise<string | undefined>;
  /** Edit a sent message; declaring it means the interface edits progress. */
  edit?(request: MessageTransportEdit): Promise<boolean>;
  /** How a job's progress is rendered, in place of the runtime's text. */
  formatProgress?(event: JobProgressEvent): MessageInterfaceOutput;
  /** How a job's completion is rendered, in place of the runtime's text. */
  formatCompletion?(event: JobProgressEvent): MessageInterfaceOutput;
  /**
   * A job progress event, before the runtime handles it: the transport may
   * route it (`next`) as another event, or not at all.
   */
  progressEvent?(
    event: JobProgressEvent,
    next: (event: JobProgressEvent) => Promise<void>,
  ): Promise<void>;
  /** A tool event, before the runtime derives its status, routed by `next`. */
  toolActivity?(
    event: ToolActivityEvent,
    next: (event: ToolActivityEvent) => Promise<void>,
  ): Promise<void>;
  /** A tool's status as the runtime derived it, to show on the platform. */
  toolStatus?(update: ToolStatusUpdate): Promise<void>;
  /**
   * Tool completions the runtime held while input was answered, settled by
   * the reply: around the runtime's own settling (`next`).
   */
  agentResponseToolStatuses?(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
    next: () => Promise<void>,
  ): Promise<void>;
}

/**
 * A slot as the runtime keeps it, whatever config and state it declared: the
 * runtime hands it the config its schema parsed and the state its setup
 * returned, which is what the slot declares it reads. A method, so a slot
 * declared over its own config and state is one.
 */
export interface FirstPartySlot<TResult> {
  run(context: FirstPartySlotContext<unknown, unknown>): TResult;
}

/** What the wrappers have added to a definition, in the order they were added. */
export interface FirstPartyInterfaceDeclarations {
  readonly daemons: readonly FirstPartySlot<FirstPartyDaemon | undefined>[];
  readonly transport?: FirstPartySlot<MessageTransport> | undefined;
  readonly channels?: FirstPartyChannelsSlot | undefined;
  readonly webRoutes?:
    FirstPartySlot<readonly WebRouteDefinition[]> | undefined;
  readonly tools?: FirstPartySlot<readonly Tool[]> | undefined;
  readonly protocol?: FirstPartyProtocol | undefined;
}

/**
 * The protocol-only registration a hosted interface builds of itself: another
 * definition, instantiated under the same plugin id and package, with the
 * config the host's config gives it.
 */
export interface FirstPartyProtocol {
  readonly definition: PluginPackageDefinition;
  config(hostConfig: unknown): unknown;
}

/** A channels slot as the runtime keeps it, its declared config kept by the method. */
export interface FirstPartyChannelsSlot {
  run(
    context: FirstPartyChannelsContext<unknown>,
  ): readonly FirstPartyChannel[];
}

export const noFirstPartyDeclarations: FirstPartyInterfaceDeclarations =
  Object.freeze({ daemons: Object.freeze([]) });

type InterfacePackage<TConfigSchema extends InterfaceConfigSchema> =
  PluginPackageDefinition<TConfigSchema, "interface">;

type ServicePackage<TConfigSchema extends InterfaceConfigSchema> =
  PluginPackageDefinition<TConfigSchema, "service">;

/** An interface's definition, or the refusal a wrapper gives anything else. */
function asInterfacePackage<TConfigSchema extends InterfaceConfigSchema>(
  definition: PluginPackageDefinition<TConfigSchema>,
  wrapper: string,
): InterfacePackage<TConfigSchema> {
  if (!isFamily(definition, "interface")) {
    throw new Error(
      `${wrapper} takes a definition defineInterface returned; "${definition.id}" is not one`,
    );
  }
  return definition;
}

function isFamily<TConfigSchema extends InterfaceConfigSchema>(
  definition: PluginPackageDefinition<TConfigSchema>,
  family: "interface",
): definition is InterfacePackage<TConfigSchema> {
  return definition.family === family;
}

/** How each interface package is rebuilt with more first-party declarations. */
const rebuilders = new WeakMap<
  PluginPackageDefinition,
  {
    readonly declarations: FirstPartyInterfaceDeclarations;
    rebuild(
      declarations: FirstPartyInterfaceDeclarations,
    ): PluginPackageDefinition;
  }
>();

/** Called by defineInterface: how its result is rebuilt by a wrapper. */
export function registerInterfaceRebuilder(
  definition: PluginPackageDefinition,
  declarations: FirstPartyInterfaceDeclarations,
  rebuild: (
    declarations: FirstPartyInterfaceDeclarations,
  ) => PluginPackageDefinition,
): void {
  rebuilders.set(definition, { declarations, rebuild });
}

function rebuildWith<TConfigSchema extends InterfaceConfigSchema>(
  definition: InterfacePackage<TConfigSchema>,
  wrapper: string,
  add: (
    declarations: FirstPartyInterfaceDeclarations,
  ) => FirstPartyInterfaceDeclarations,
): InterfacePackage<TConfigSchema> {
  const entry = rebuilders.get(definition);
  if (!entry) {
    throw new Error(
      `${wrapper} takes a definition defineInterface returned; "${definition.id}" is not one`,
    );
  }
  const rebuilt = entry.rebuild(add(entry.declarations));
  // The rebuilt definition is the same package: same family, id and config.
  if (!isInterfacePackage(rebuilt, definition.config)) {
    throw new Error(`Interface "${definition.id}" did not rebuild as itself`);
  }
  return rebuilt;
}

function isInterfacePackage<TConfigSchema extends InterfaceConfigSchema>(
  definition: PluginPackageDefinition,
  config: TConfigSchema,
): definition is InterfacePackage<TConfigSchema> {
  return definition.family === "interface" && definition.config === config;
}

/** A slot as the runtime keeps it, its declared config and state kept by the method. */
function erased<TConfig, TState, TResult>(
  slot: (context: FirstPartySlotContext<TConfig, TState>) => TResult,
): FirstPartySlot<TResult> {
  return { run: slot };
}

/**
 * A daemon its class registered, started and stopped by the brain under
 * `<plugin id>:<id>`, reporting its own health. Each call adds one; an id
 * declared twice is refused when the interface registers. A slot that
 * returns none declares no daemon, as a class without one for its config.
 */
export function withDaemon<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: InterfacePackage<TConfigSchema>,
  daemon: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => FirstPartyDaemon | undefined,
): InterfacePackage<TConfigSchema> {
  return rebuildWith(definition, "withDaemon", (declarations) => ({
    ...declarations,
    daemons: [...declarations.daemons, erased(daemon)],
  }));
}

/**
 * A generic interface that is also a message transport, as its class
 * extended the message interface base: the runtime's message coordination
 * runs for it, sends through the transport the slot returns, and its slots
 * reach `interfaceRuntime(context).messages`. Declared once.
 */
export function withMessageTransport<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: InterfacePackage<TConfigSchema>,
  transport: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => MessageTransport,
): InterfacePackage<TConfigSchema> {
  return rebuildWith(definition, "withMessageTransport", (declarations) => {
    if (declarations.transport) {
      throw new Error(
        `Interface "${definition.id}" declares a message transport more than once`,
      );
    }
    return { ...declarations, transport: erased(transport) };
  });
}

/**
 * The channels its class registered, in the worker as in the main process,
 * so background jobs can send on them: each descriptor as written and, when
 * it declares one, its delivery. The interface becomes a message interface,
 * as its class was. Declared once.
 */
export function withChannels<TConfigSchema extends InterfaceConfigSchema>(
  definition: InterfacePackage<TConfigSchema>,
  channels: (
    context: FirstPartyChannelsContext<z.output<TConfigSchema>>,
  ) => readonly FirstPartyChannel[],
): InterfacePackage<TConfigSchema> {
  return rebuildWith(definition, "withChannels", (declarations) => {
    if (declarations.channels) {
      throw new Error(
        `Interface "${definition.id}" declares its channels more than once`,
      );
    }
    const slot: FirstPartyChannelsSlot = { run: channels };
    return { ...declarations, channels: slot };
  });
}

/**
 * The HTTP routes its class served, as written: any response, a page, a
 * stream, with the class's public, preview, role and match settings. Served
 * once the interface registers, after the routes its definition declares.
 * Declared once.
 */
export function withWebRoutes<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: InterfacePackage<TConfigSchema>,
  routes: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly WebRouteDefinition[],
): InterfacePackage<TConfigSchema> {
  return rebuildWith(definition, "withWebRoutes", (declarations) => {
    if (declarations.webRoutes) {
      throw new Error(
        `Interface "${definition.id}" declares its web routes more than once`,
      );
    }
    return { ...declarations, webRoutes: erased(routes) };
  });
}

/**
 * The tools its class registered, under their names as written, with the
 * class's visibility, side effects and MCP exposure, run with the call the
 * brain hands them. Declared once. An interface's run through its plugin's
 * tool-execute channel; a service's beside the tools its definition
 * declares, each run as its caller, as a declared tool is.
 */
export function withTools<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: InterfacePackage<TConfigSchema>,
  tools: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly Tool[],
): InterfacePackage<TConfigSchema>;
export function withTools<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: ServicePackage<TConfigSchema>,
  tools: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly Tool[],
): ServicePackage<TConfigSchema>;
export function withTools<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: PluginPackageDefinition<TConfigSchema>,
  tools: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly Tool[],
): PluginPackageDefinition<TConfigSchema> {
  if (isServicePackage(definition)) {
    return withServiceTools(definition, tools);
  }
  return rebuildWith(
    asInterfacePackage(definition, "withTools"),
    "withTools",
    (declarations) => {
      if (declarations.tools) {
        throw new Error(
          `Interface "${definition.id}" declares its tools more than once`,
        );
      }
      return { ...declarations, tools: erased(tools) };
    },
  );
}

/**
 * A protocol-only registration of the interface, as its class built one for
 * a host that serves the protocol itself (the eval harness): `protocol`,
 * instantiated under the same plugin id and package, configured from the
 * host's parsed config. Declared once.
 */
export function withProtocolPlugin<
  TConfigSchema extends InterfaceConfigSchema,
  TProtocolSchema extends InterfaceConfigSchema,
>(
  definition: InterfacePackage<TConfigSchema>,
  protocol: InterfacePackage<TProtocolSchema>,
  config: (hostConfig: z.output<TConfigSchema>) => z.input<TProtocolSchema>,
): InterfacePackage<TConfigSchema> {
  return rebuildWith(definition, "withProtocolPlugin", (declarations) => {
    if (declarations.protocol) {
      throw new Error(
        `Interface "${definition.id}" declares a protocol plugin more than once`,
      );
    }
    const declared: { config(hostConfig: z.output<TConfigSchema>): unknown } = {
      config,
    };
    const kept: FirstPartyProtocol = { definition: protocol, ...declared };
    return { ...declarations, protocol: kept };
  });
}
