import type { Logger } from "@brains/utils/logger";
import type { JobProgressEvent } from "@brains/job-queue";
import type { AgentNamespace, AgentResponse } from "../contracts/agent";
import type { BusCollection, BusContract, BusResult } from "@brains/contracts";
import {
  sharedUploadScope,
  type IRuntimeUploadsNamespace,
  type ScopedRuntimeUploadStore,
} from "../service/upload-registry";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { z } from "@brains/utils/zod";
import type {
  IEndpointsNamespace,
  IIdentityNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IProfileKindsNamespace,
} from "../base/context-types";
import type { IPublicSkillsNamespace } from "../a2a/public-skills";
import type { ICoreEntityService } from "@brains/entity-service";
import type { ToolInfo } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { Channel } from "@brains/contracts";
import type { IMCPTransport } from "@brains/mcp-service";
import type { AuthBackend } from "../contracts/auth";
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
  /**
   * A conversation's stored messages, and the conversations and messages a
   * platform's shared space records, as the class read and wrote them.
   */
  readonly conversations: Pick<
    IInterfaceConversationsNamespace,
    "getMessages" | "start" | "addMessage"
  >;
  /**
   * A sender's permission level on an interface and whether they stand for
   * the brain's anchor, as the class asked.
   */
  readonly permissions: Pick<
    IPermissionsNamespace,
    "getUserLevel" | "isAnchor"
  >;
  /** Whether the brain runs in production, as the class read it. */
  readonly production: boolean;
  /** The brain's bare domain, when it has one. */
  readonly domain: string | undefined;
  /** Whether a plugin is registered on the brain, as the class asked. */
  hasPlugin(pluginId: string): boolean;
  /**
   * The auth backend the brain bound, read when asked, as the class read
   * `context.auth.get()`: none while the brain runs without auth-service.
   */
  auth(): AuthBackend | undefined;
  /** The brain's MCP service, which a protocol transport connects to. */
  readonly mcpTransport: IMCPTransport;
  /** Advertise a URL of the interface, as the class registered one. */
  endpoint(endpoint: Parameters<IEndpointsNamespace["register"]>[0]): void;
  /** Offer a way into the brain, as the class registered one. */
  interaction(
    interaction: Parameters<IInteractionsNamespace["register"]>[0],
  ): void;
  /**
   * Hear a typed channel, as the class subscribed to it in the main process:
   * the payload is validated and a malformed one is never handed on.
   * Released when the interface shuts down.
   */
  listen<TPayload>(
    channel: Channel<TPayload>,
    handler: (context: { readonly payload: TPayload }) => void | Promise<void>,
  ): void;
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
  /**
   * Run once the brain is ready, where the class's onReady ran: after every
   * plugin has registered and the shell prepared its ready state. Handlers
   * run in the order they were given.
   */
  ready(handler: () => void | Promise<void>): void;
  /** The brain's character and its anchor's profile, as the shell keeps them. */
  readonly identity: Pick<IIdentityNamespace, "get" | "getProfile">;
  /** The profile kind the brain resolved, as the class read it. */
  readonly profileKinds: Pick<IProfileKindsNamespace, "getResolved">;
  /** The brain's public skills, as an Agent Card lists them. */
  readonly publicSkills: IPublicSkillsNamespace;
  /** The registered tools a permission level may call. */
  readonly tools: {
    listForPermissionLevel(level: UserPermissionLevel): ToolInfo[];
  };
  /**
   * Read-only reads of the brain's entities, passed through to the entity
   * service at the scope each call names, as the class read them.
   */
  readonly entityReads: Pick<
    ICoreEntityService,
    "hasEntityType" | "listEntities" | "getEntity"
  >;
  /**
   * The runtime's shared upload store (`upload`), which create requests,
   * attachment restore and entity promotion read: the store an interface
   * that accepts files writes, served at `routePath` (by default
   * `/api/chat/uploads`).
   */
  sharedUploads(options?: {
    readonly routePath?: string | undefined;
  }): ScopedRuntimeUploadStore;
  /**
   * Delete a retired upload namespace's directory and nothing beside it;
   * answers whether there was one. The shared store is never retired.
   */
  retireUploads(namespace: string): Promise<boolean>;
  /** Ask every owner of a collect contract, as the class gathered. */
  gather<TRequest extends z.ZodType, TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, "collect">,
    request: z.input<TRequest>,
  ): Promise<BusCollection<z.output<TResponse>>>;
  /** The shared conversation spaces the brain is configured with. */
  readonly spaces: readonly string[];
  /** The brain's site URL, when it has a domain. */
  readonly siteUrl: string | undefined;
  /** The site's local URL, and whether links prefer it, as the class read them. */
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
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
  /** Edit a sent reply in place when the job it started completes. */
  trackAgentResponseForJob(
    jobId: string,
    messageId: string,
    channelId: string,
  ): void;
  /**
   * Settle the tool completions held while input was answered, by the
   * reply: through the transport's hook when it declares one.
   */
  handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void>;
}

/** What the runtime binds a first-party interface's runtime to. */
export interface InterfaceRuntimeBinding {
  readonly logger: Logger;
  readonly agent: AgentNamespace;
  readonly conversations: Pick<
    IInterfaceConversationsNamespace,
    "getMessages" | "start" | "addMessage"
  >;
  readonly permissions: Pick<
    IPermissionsNamespace,
    "getUserLevel" | "isAnchor"
  >;
  readonly uploads: IRuntimeUploadsNamespace;
  readonly spaces: readonly string[];
  readonly siteUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  readonly production: boolean;
  readonly domain: string | undefined;
  readonly hasPlugin: (pluginId: string) => boolean;
  readonly auth: () => AuthBackend | undefined;
  readonly mcpTransport: IMCPTransport;
  readonly endpoints: Pick<IEndpointsNamespace, "register">;
  readonly interactions: Pick<IInteractionsNamespace, "register">;
  /** None unless the interface has a message transport. */
  readonly messages: InterfaceMessages | undefined;
  readonly messaging: Pick<
    IMessagingNamespace,
    "answer" | "request" | "gather" | "subscribe"
  >;
  readonly runtimeState: Pick<IRuntimeStateNamespace, "scoped">;
  /** Keeps a release to run when the interface shuts down. */
  readonly onRelease: (release: () => void) => void;
  /** Keeps a handler to run once the brain is ready. */
  readonly onReady: (handler: () => Promise<void>) => void;
  readonly identity: Pick<IIdentityNamespace, "get" | "getProfile">;
  readonly profileKinds: Pick<IProfileKindsNamespace, "getResolved">;
  readonly publicSkills: IPublicSkillsNamespace;
  readonly tools: {
    listForPermissionLevel(level: UserPermissionLevel): ToolInfo[];
  };
  readonly entityReads: Pick<
    ICoreEntityService,
    "hasEntityType" | "listEntities" | "getEntity"
  >;
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
      start: (request) => conversations.start(request),
      addMessage: (request) => conversations.addMessage(request),
    }),
    sharedUploads: (options = {}) =>
      binding.uploads.scoped({
        ...sharedUploadScope,
        ...(options.routePath ? { routePath: options.routePath } : {}),
      }),
    retireUploads: (namespace) => binding.uploads.retire(namespace),
    gather: (contract, request) => binding.messaging.gather(contract, request),
    spaces: Object.freeze([...binding.spaces]),
    siteUrl: binding.siteUrl,
    localSiteUrl: binding.localSiteUrl,
    preferLocalUrls: binding.preferLocalUrls,
    permissions: Object.freeze({
      getUserLevel: (interfaceType, userId, lookup) =>
        permissions.getUserLevel(interfaceType, userId, lookup),
      isAnchor: (interfaceType, userId) =>
        permissions.isAnchor(interfaceType, userId),
    }),
    production: binding.production,
    domain: binding.domain,
    hasPlugin: (pluginId) => binding.hasPlugin(pluginId),
    auth: () => binding.auth(),
    mcpTransport: binding.mcpTransport,
    endpoint(endpoint): void {
      binding.endpoints.register(endpoint);
    },
    interaction(interaction): void {
      binding.interactions.register(interaction);
    },
    listen(channel, handler): void {
      binding.onRelease(
        binding.messaging.subscribe(channel, async (payload) => {
          await handler({ payload });
          return { success: true };
        }),
      );
    },
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
    ready(handler): void {
      binding.onReady(async () => handler());
    },
    identity: Object.freeze({
      get: () => binding.identity.get(),
      getProfile: () => binding.identity.getProfile(),
    }),
    profileKinds: Object.freeze({
      getResolved: () => binding.profileKinds.getResolved(),
    }),
    publicSkills: Object.freeze({
      list: () => binding.publicSkills.list(),
    }),
    tools: Object.freeze({
      listForPermissionLevel: (level: UserPermissionLevel) =>
        binding.tools.listForPermissionLevel(level),
    }),
    entityReads: Object.freeze({
      hasEntityType: (type: string) => binding.entityReads.hasEntityType(type),
      listEntities: binding.entityReads.listEntities.bind(binding.entityReads),
      getEntity: binding.entityReads.getEntity.bind(binding.entityReads),
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
