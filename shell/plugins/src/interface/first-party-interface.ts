import type { z } from "@brains/utils/zod";
import type { DaemonHealth } from "../manager/daemon-types";
import type { MessageInterfaceOutput } from "../message-interface/progress-message-coordinator";
import type { PluginPackageDefinition } from "../package-definition";
import type { InterfaceConfigSchema } from "./interface-definition-contract";

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
export interface MessageTransport {
  send(request: MessageTransportSend): void;
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
  readonly daemons: readonly FirstPartySlot<FirstPartyDaemon>[];
  readonly transport?: FirstPartySlot<MessageTransport> | undefined;
}

export const noFirstPartyDeclarations: FirstPartyInterfaceDeclarations =
  Object.freeze({ daemons: Object.freeze([]) });

type InterfacePackage<TConfigSchema extends InterfaceConfigSchema> =
  PluginPackageDefinition<TConfigSchema, "interface">;

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
 * declared twice is refused when the interface registers.
 */
export function withDaemon<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
>(
  definition: InterfacePackage<TConfigSchema>,
  daemon: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => FirstPartyDaemon,
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
