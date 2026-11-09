import type { Logger } from "@brains/utils/logger";
import type { JobProgressEvent } from "@brains/job-queue";
import type { AgentNamespace } from "../contracts/agent";
import type { BusContract, BusResult } from "@brains/contracts";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { z } from "@brains/utils/zod";
import type { IMessagingNamespace } from "../base/context-types";
import type { SchemaValue } from "../internal/schema-value";
import {
  attachFirstPartyRuntime,
  firstPartyRuntimeOf,
} from "../internal/first-party-runtime";
import type {
  IInterfaceConversationsNamespace,
  IPermissionsNamespace,
} from "./context";

/**
 * Internal, first-party only: what a first-party interface converted from a
 * class needs and the public interface contract does not offer, reached with
 * `interfaceRuntime(context)` on a setup or slot context the brain built. No
 * public entry exports it. Each capability is here because a converted
 * interface calls it.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */
export interface InterfaceRuntime {
  /** The interface's logger, as its class logged. */
  readonly logger: Logger;
  /**
   * The brain's agent, as the class reached it through `context.agent`: a
   * turn in a conversation, and the answer to an approval it is waiting on.
   */
  readonly agent: Pick<AgentNamespace, "chat" | "confirmPendingAction">;
  /** A conversation's stored messages, as the class read them. */
  readonly conversations: Pick<IInterfaceConversationsNamespace, "getMessages">;
  /** Whether a sender stands for the brain's anchor, as the class asked. */
  readonly permissions: Pick<IPermissionsNamespace, "isAnchor">;
  /**
   * The message coordination a message transport's class inherited: the
   * input it is answering, which holds job completions back until the reply
   * is out, and the job progress a terminal UI follows. Only an interface
   * with a message transport has it; any other is refused.
   */
  readonly messages: InterfaceMessages;
  /**
   * Answer a first-party contract under the channel it already has, such as
   * `email:source-read`, as the class answered it, in the main process.
   * Released when the interface shuts down.
   */
  answer<const TRequest extends z.ZodType, const TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse>,
    handler: (context: {
      readonly request: z.output<TRequest>;
      readonly sender: string;
    }) => SchemaValue<TResponse> | Promise<SchemaValue<TResponse>>,
  ): void;
  /** Ask a contract's owner, as the class asked through its messaging. */
  request<TRequest extends z.ZodType, TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, "request">,
    request: z.input<TRequest>,
  ): Promise<BusResult<z.output<TResponse>>>;
  /**
   * The runtime state the class stored, under the namespace the class named
   * (`email.inbound.uid-cursor`) rather than one qualified by the package,
   * so the records stored before the conversion are the ones it reads after.
   */
  readonly classRuntimeState: Pick<IRuntimeStateNamespace, "scoped">;
}

/** How a first-party message transport coordinates replies and job progress. */
export interface InterfaceMessages {
  /** Answering input from a channel: job completions wait until it ends. */
  startProcessingInput(channelId?: string | null): void;
  /** Done answering: the job completions held back are sent. */
  endProcessingInput(): void;
  /** Follow job progress; the current progress is handed over at once. */
  registerProgressCallback(
    callback: (events: JobProgressEvent[]) => void,
  ): void;
  unregisterProgressCallback(): void;
  /** Whether anything follows job progress now. */
  hasProgressCallback(): boolean;
}

/** What the runtime binds a first-party interface's runtime to. */
export interface InterfaceRuntimeBinding {
  readonly logger: Logger;
  readonly agent: AgentNamespace;
  readonly conversations: Pick<IInterfaceConversationsNamespace, "getMessages">;
  readonly permissions: Pick<IPermissionsNamespace, "isAnchor">;
  /** None unless the interface has a message transport. */
  readonly messages: InterfaceMessages | undefined;
  readonly messaging: Pick<IMessagingNamespace, "answer" | "request">;
  readonly runtimeState: Pick<IRuntimeStateNamespace, "scoped">;
  /** Keeps a release to run when the interface shuts down. */
  readonly onRelease: (release: () => void) => void;
  /** The interface's id, to name it in a refusal. */
  readonly interfaceId: string;
}

const interfaceRuntimeKey = Symbol("rizom.first-party-interface-runtime");

/** Every runtime the brain bound, so one read back is known to be one. */
const boundInterfaceRuntimes = new WeakSet<object>();

function bindInterfaceRuntime(
  binding: InterfaceRuntimeBinding,
): InterfaceRuntime {
  const { agent, conversations, permissions, messages } = binding;
  const runtime: InterfaceRuntime = {
    logger: binding.logger,
    agent: Object.freeze({
      chat: (message, conversationId, context, signal) =>
        agent.chat(message, conversationId, context, signal),
      confirmPendingAction: (
        conversationId,
        confirmed,
        approvalId,
        context,
        signal,
      ) =>
        agent.confirmPendingAction(
          conversationId,
          confirmed,
          approvalId,
          context,
          signal,
        ),
    }),
    conversations: Object.freeze({
      getMessages: (conversationId, options) =>
        conversations.getMessages(conversationId, options),
    }),
    permissions: Object.freeze({
      isAnchor: (interfaceType, userId) =>
        permissions.isAnchor(interfaceType, userId),
    }),
    answer(contract, handler): void {
      // The bus checks the answer against the contract's own schema; erasing
      // the response type lets a handler typed by its contract hand it a
      // value it parses, as the service runtime's answer does.
      const erased: BusContract<typeof contract.schema, z.ZodType> = contract;
      binding.onRelease(
        binding.messaging.answer(erased, async (request, { sender }) =>
          handler({ request, sender }),
        ),
      );
    },
    request: (contract, request) =>
      binding.messaging.request(contract, request),
    classRuntimeState: Object.freeze({
      scoped: binding.runtimeState.scoped.bind(binding.runtimeState),
    }),
    get messages(): InterfaceMessages {
      if (!messages) {
        throw new Error(
          `Interface "${binding.interfaceId}" has no message transport: interfaceRuntime(context).messages coordinates replies only for an interface declared withMessageTransport`,
        );
      }
      return messages;
    },
  };
  return Object.freeze(runtime);
}

/**
 * A setup or slot context the runtime hands a first-party interface, with
 * its internal runtime attached under a key no public type names.
 */
export function withInterfaceRuntime<TContext extends object>(
  context: TContext,
  runtime: InterfaceRuntime,
): TContext {
  return attachFirstPartyRuntime(context, interfaceRuntimeKey, runtime);
}

/** One runtime per registration, attached to each context it hands out. */
export function createInterfaceRuntime(
  binding: InterfaceRuntimeBinding,
): InterfaceRuntime {
  const runtime = bindInterfaceRuntime(binding);
  boundInterfaceRuntimes.add(runtime);
  return runtime;
}

function isInterfaceRuntime(
  value: object | undefined,
): value is InterfaceRuntime {
  return value !== undefined && boundInterfaceRuntimes.has(value);
}

/**
 * The internal runtime a first-party interface's setup or slot context
 * carries. First-party packages only: a context the brain's runtime did not
 * build, such as a test double, has none, and is refused.
 */
export function interfaceRuntime(context: object): InterfaceRuntime {
  const runtime = firstPartyRuntimeOf(context, interfaceRuntimeKey);
  if (!isInterfaceRuntime(runtime)) {
    throw new Error(
      "This context carries no interface runtime: interfaceRuntime() reaches internal capabilities of a setup or slot context the brain's runtime built, for first-party packages only",
    );
  }
  return runtime;
}
