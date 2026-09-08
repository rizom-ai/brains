import { createExternalActorId, type ActorRef } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { uploadNamespaceFor } from "../internal/state-namespace";
import { emptyPluginState } from "../base/empty-state";
import type { ChatAttachment } from "../contracts/agent";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "../channel-registry";
import type { MessageInterfacePluginContext } from "../interface/context";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { createAccountDaemon } from "../operator/account-daemon-supervisor";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { createDeclarativeDaemon } from "../interface/declarative-daemon";
import { registerDeclaredSubscriptions } from "../interface/declared-subscriptions";
import { createInterfaceEntityAccess } from "../interface/interface-entity-access";
import { deriveConsoleSurfaces } from "../console-surfaces";
import { createRuntimeRoute } from "../interface/route-runtime";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";
import type { WebRouteDefinition } from "../types/web-routes";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type {
  InboundMessageAttachment,
  MessageInterfaceDefinitionInput,
  InterfaceJobStatus,
  MessageOutput,
  ApprovalOutcome,
  AuthenticatedCaller,
  InboundMessageSender,
  MessageChannel,
  PresentedConfirmation,
  PresentedMessage,
  ReceiveAuthenticatedInput,
  ResolveApprovalInput,
} from "../interface/interface-definition-contract";
import type {
  EditMessageRequest,
  MessageInterfaceOutput,
  SendMessageToChannelRequest,
  SendMessageWithIdRequest,
} from "./progress-message-coordinator";
import { MessageInterfacePlugin } from "./message-interface-plugin";
import { PendingApprovalTracker } from "./pending-approval-tracker";
import { routeConfirmationResponse } from "./confirmation-routing";
import { buildResponsePlan, getResponseJobIds } from "./response-render-plan";
import type { AgentResponse, ChatContext } from "../contracts/agent";
import type { JobContext, JobProgressEvent } from "@brains/job-queue";
import type { z } from "@brains/utils/zod";
import { collectDeniedArtifactCardIds } from "./artifact-access";
import type { ArtifactEntityRef } from "./artifact-entity";
import type { ContentVisibility } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { ToolStatusUpdate } from "./tool-status";
import { effectiveDisplayBaseUrl } from "../interface/display-base-url";

/** `present` posted the answer itself and named the message it became. */
function isPresentedMessage(
  presented: string | readonly string[] | PresentedMessage,
): presented is PresentedMessage {
  return typeof presented === "object" && "messageId" in presented;
}

/**
 * Who the turn is attributed to.
 *
 * An interface that verified a session names the person; one that only has a
 * sender id gets an external actor derived from it, so the turn is still
 * attributable to something stable.
 */
function callerIdentity(
  input: {
    sender: InboundMessageSender;
    caller?: AuthenticatedCaller | undefined;
  },
  interfaceType: string,
): ActorRef {
  const caller = input.caller;
  if (caller?.userId) {
    return {
      kind: "user",
      userId: caller.userId,
      ...(caller.canonicalId ? { canonicalId: caller.canonicalId } : {}),
    };
  }
  return {
    kind: "external",
    externalActorId: createExternalActorId(interfaceType, input.sender.id),
  };
}

/**
 * Whether the answer carries the approval that was resolved.
 *
 * Its absence is how the brain says it was not holding that approval any
 * more — the client drew it as a tool call and needs that call closed.
 */
function hasApprovalCard(
  response: Pick<AgentResponse, "cards">,
  input: { approvalId: string; toolCallId?: string | undefined },
): boolean {
  return Boolean(
    response.cards?.some(
      (card) =>
        card.kind === "tool-approval" &&
        (card.id === input.approvalId ||
          (input.toolCallId !== undefined &&
            card.toolCallId === input.toolCallId)),
    ),
  );
}

function normalizedOutput(message: MessageInterfaceOutput): MessageOutput {
  if (typeof message === "string") return { text: message };
  return {
    text: message.fallbackText ?? "Message update",
  };
}

/**
 * The attachment as the agent takes it.
 *
 * An interface that already holds the bytes says so and nothing is fetched;
 * one that received only a link gets it downloaded here, which is the case
 * every channel-shaped interface is in.
 */
async function attachmentFrom(
  attachment: InboundMessageAttachment,
  signal: AbortSignal,
): Promise<ChatAttachment> {
  const source = attachment.source ? { source: attachment.source } : {};
  if (attachment.text !== undefined) {
    return {
      kind: "text",
      filename: attachment.name,
      mediaType: attachment.mediaType,
      content: attachment.text,
      sizeBytes: new TextEncoder().encode(attachment.text).byteLength,
      ...source,
    };
  }
  const inline = attachment.data;
  const data = inline ?? (await downloadAttachment(attachment, signal));
  if (attachment.mediaType.startsWith("text/")) {
    return {
      kind: "text",
      filename: attachment.name,
      mediaType: attachment.mediaType,
      content: new TextDecoder().decode(data),
      sizeBytes: data.byteLength,
      ...source,
    };
  }
  return {
    kind: "file",
    filename: attachment.name,
    mediaType: attachment.mediaType,
    data,
    sizeBytes: data.byteLength,
    ...source,
  };
}

async function downloadAttachment(
  attachment: InboundMessageAttachment,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!attachment.url) {
    throw new Error(
      `Attachment "${attachment.name}" carries neither bytes nor a URL`,
    );
  }
  const response = await fetch(attachment.url, { signal });
  if (!response.ok) {
    throw new Error(
      `Attachment "${attachment.name}" could not be downloaded (${response.status})`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

class DeclarativeMessageInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TRecipientSchema extends z.ZodType<unknown, unknown>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends MessageInterfacePlugin<
  z.output<TConfigSchema>,
  z.output<TConfigSchema>
> {
  private readonly definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
  >;
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private hasRequiredDaemon = false;
  private routes: WebRouteDefinition[] = [];
  private state: TState | undefined;
  private approvalTracker: PendingApprovalTracker | undefined;

  constructor(
    definition: MessageInterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TRecipientSchema,
      TAccountSettings
    >,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.definition = definition;
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (this.definition.accountSettings) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.id,
        packageName: this.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }
    this.state = this.definition.setup
      ? await this.definition.setup({
          config: this.config,
          // Namespaced under the interface's own id, which is what the
          // stored keys already carry: a class wrote "email.inbound.cursor"
          // by hand. Changing the prefix here would orphan a live cursor, and
          // an inbound mailbox with no cursor re-reads from the beginning —
          // every message in it delivered again as new.
          runtimeState: (options) =>
            context.runtimeState.scoped({
              ...options,
              namespace: `${this.definition.id}.${options.namespace}`,
            }),
          uploads: (options) =>
            context.uploads.scoped({
              ...options,
              namespace: uploadNamespaceFor(
                this.definition.id,
                options.namespace,
              ),
            }),
          plugins: context.plugins,
          endpoints: context.endpoints,
          interactions: context.interactions,
          auth: context.auth,
          permissions: context.permissions,
          agent: context.agent,
          conversations: context.conversations,
          inbox: context.inbox,
          inboxFollowUps: context.inboxFollowUps,
          surfaces: (options) =>
            deriveConsoleSurfaces(context.webRoutes.getRoutes(), {
              activeId: this.definition.id,
              ...(options.permissionLevel !== undefined
                ? { permissionLevel: options.permissionLevel }
                : {}),
              ...(options.hasActiveSession !== undefined
                ? { hasActiveSession: options.hasActiveSession }
                : {}),
              ...(options.selfHref !== undefined
                ? { self: { id: this.definition.id, href: options.selfHref } }
                : {}),
            }),
          entities: createInterfaceEntityAccess(
            context.entityService,
            this.definition.id,
          ),
          identity: context.identity,
          profileKinds: context.profileKinds,
          tools: context.tools,
          publicSkills: context.publicSkills,
          spaces: context.spaces,
          domain: context.domain,
          displayBaseUrl: effectiveDisplayBaseUrl(context),
          themeCSS: context.themeCSS,
          messaging: {
            request: (message) =>
              context.messaging.send({
                type: message.type,
                payload: message.payload,
              }),
          },
          logger: this.logger,
        })
      : emptyPluginState<TState>();
    context.channels.registerDescriptor({
      type: this.definition.channel.type,
      displayName: this.definition.channel.displayName,
      subjectLabel: this.definition.channel.subjectLabel,
      ...(this.definition.channel.subjectPattern
        ? { subjectPattern: this.definition.channel.subjectPattern }
        : {}),
      ...(this.definition.deliver ? { manualDelivery: true } : {}),
    });

    const available = this.definition.available;
    // The channel is registered either way: an interface with no outbound
    // credential still runs inbound. Delivery is a separate question, and an
    // interface that answers "no" registers no provider — callers that read a
    // provider's presence as "delivery is possible" are then right.
    const deliverable =
      !available ||
      (await available({ config: this.config, state: this.requireState() }));
    if (this.definition.deliver && deliverable) {
      context.channels.registerDeliveryProvider({
        channelType: this.definition.channel.type,
        isAvailable: async () => {
          if (this.state === undefined) return false;
          if (!available) return true;
          return available({ config: this.config, state: this.state });
        },
        send: (input) => this.deliver(input),
      });
    }

    this.routes = (
      this.definition.routes?.({
        config: this.config,
        state: this.requireState(),
        // The same receiver `listen` gets: what carried the message in does
        // not change what the pipeline owes it.
        messages: {
          receiveAuthenticated: (received) =>
            // No abort signal here: a route holds the request's own, and the
            // turn outlives the response when the interface streams it.
            this.receiveAuthenticated(received, new AbortController().signal),
          resolveApproval: (received) =>
            this.resolveApproval(received, new AbortController().signal),
          pendingApprovals: (channel) => this.pendingApprovals(channel),
        },
        jobs: {
          enqueue: async <TDefinition extends AnyServiceJobDefinition>(
            definition: TDefinition,
            input: z.input<TDefinition["input"]>,
          ): Promise<{ readonly id: string }> =>
            Object.freeze({
              id: await context.jobs.enqueue({
                type: getServiceJobRuntimeType(definition),
                data: definition.input.parse(input),
              }),
            }),
          getStatus: async (jobId): Promise<InterfaceJobStatus | null> => {
            const job = await context.jobs.getStatus(jobId);
            return job
              ? Object.freeze({
                  id: job.id,
                  status: job.status,
                  lastError: job.lastError ?? null,
                })
              : null;
          },
        },
      }) ?? []
    ).map((route) =>
      createRuntimeRoute(route, {
        declarationId: this.definition.id,
        permissions: context.permissions,
        auth: () => context.auth,
      }),
    );

    const daemonDefinitions =
      this.definition.daemons?.({
        config: this.config,
        state: this.requireState(),
      }) ?? [];
    const daemonIds = new Set<string>();
    for (const daemon of daemonDefinitions) {
      if (daemonIds.has(daemon.id) || daemon.id === "listener") {
        throw new Error(
          `Message interface "${this.definition.id}" defines daemon "${daemon.id}" more than once`,
        );
      }
      daemonIds.add(daemon.id);
      this.hasRequiredDaemon ||= daemon.required;
      if (daemon.forAccounts) {
        if (daemon.forAccounts !== this.definition.accountSettings) {
          throw new Error(
            `Message interface "${this.definition.id}" account-bound daemon "${daemon.id}" must reference its attached account settings`,
          );
        }
        const registration = this.accountSettingsRegistration;
        if (!registration) {
          throw new Error(
            `Message interface "${this.definition.id}" account-bound daemon "${daemon.id}" has no registered account settings`,
          );
        }
        context.daemons.register(
          daemon.id,
          createAccountDaemon(daemon, registration, context.accountSettings),
        );
        continue;
      }
      context.daemons.register(daemon.id, createDeclarativeDaemon(daemon));
    }

    registerDeclaredSubscriptions({
      label: `Message interface "${this.definition.id}"`,
      subscriptions:
        this.definition.subscriptions?.({
          config: this.config,
          state: this.requireState(),
        }) ?? [],
      context,
    });

    if (this.definition.listen) {
      context.daemons.register(
        "listener",
        createDeclarativeDaemon({
          kind: "rizom-interface-daemon",
          id: "listener",
          required: false,
          run: ({ signal, health }) =>
            this.definition.listen?.({
              config: this.config,
              state: this.requireState(),
              signal,
              health,
              messages: {
                receiveAuthenticated: (input) =>
                  this.receiveAuthenticated(input, signal),
                resolveApproval: (input) => this.resolveApproval(input, signal),
                pendingApprovals: (channel) => this.pendingApprovals(channel),
              },
            }) ?? Promise.resolve(),
        }),
      );
    }
  }

  protected override async onRegistrationComplete(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    if (
      this.accountSettingsRegistration &&
      !context.accountSettings.hasBackend()
    ) {
      throw new Error(
        `Message interface "${this.definition.id}" account settings require auth-service and an account settings encryption key`,
      );
    }
  }

  override requiresDaemonStartup(): boolean {
    return this.hasRequiredDaemon;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [...this.routes];
  }

  /**
   * Progress, handed over whole when the declaration asked for it.
   *
   * The coordinator's job is turning an event into a message and tracking the
   * one it already sent, which is bookkeeping for a channel that posts and
   * edits. A channel that streams has neither problem: it writes a frame per
   * event and the client reconciles by id.
   */
  protected override async handleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    const progress = this.definition.progress;
    if (!progress) {
      await super.handleProgressEvent(event, context);
      return;
    }
    const channelId = event.metadata.channelId ?? event.metadata.conversationId;
    if (typeof channelId !== "string") return;
    await progress({
      config: this.config,
      state: this.requireState(),
      channel: { id: channelId },
      event,
    });
  }

  /**
   * Tool activity, for an interface that draws it.
   *
   * Unlike `progress` there is no rendered-sentence fallback to suppress: the
   * base default is silence, so tool activity was invisible to a declared
   * interface until it could ask for it.
   */
  protected override async handleToolStatusUpdate(
    update: ToolStatusUpdate,
  ): Promise<void> {
    const toolStatus = this.definition.toolStatus;
    if (!toolStatus) {
      await super.handleToolStatusUpdate(update);
      return;
    }
    const channelId = update.channelId ?? update.conversationId;
    await toolStatus({
      config: this.config,
      state: this.requireState(),
      channel: { id: channelId },
      update,
    });
  }

  protected override interfaceType(): string {
    return this.definition.channel.type;
  }

  protected override sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void {
    const channelId = request.channelId;
    // An interface that renders progress itself already drew this; sending
    // the rendered sentence too would show it twice.
    if (this.definition.progress) return;
    const send = this.definition.send;
    if (!channelId || !send) return;
    Promise.resolve()
      .then(() =>
        send({
          config: this.config,
          state: this.requireState(),
          channel: { id: channelId },
          message: normalizedOutput(request.message),
          // This path is the progress coordinator's; replies go through
          // sendMessageWithId, which is what an interface waits on for an id.
          origin: "progress",
          ...(request.event ? { event: request.event } : {}),
        }),
      )
      .catch((error: unknown) => {
        this.logger.error("Message delivery failed", { error });
      });
  }

  protected override async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    if (!request.channelId || !this.definition.send) return undefined;
    // The coordinator also sends its first progress message this way, for
    // the id it edits afterwards; the event is what tells the two apart.
    const id = await this.definition.send({
      config: this.config,
      state: this.requireState(),
      channel: { id: request.channelId },
      message: normalizedOutput(request.message),
      origin: request.event ? "progress" : "reply",
      ...(request.event ? { event: request.event } : {}),
    });
    return typeof id === "string" ? id : undefined;
  }

  protected override async editMessage(
    request: EditMessageRequest,
  ): Promise<boolean> {
    if (!request.channelId || !this.definition.edit) return false;
    await this.definition.edit({
      config: this.config,
      state: this.requireState(),
      channel: { id: request.channelId },
      messageId: request.messageId,
      message: normalizedOutput(request.newMessage),
      ...(request.event ? { event: request.event } : {}),
    });
    return true;
  }

  protected override supportsMessageEditing(): boolean {
    return this.definition.edit !== undefined;
  }

  protected override async onShutdown(): Promise<void> {
    this.accountSettingsRegistration = undefined;
    this.hasRequiredDaemon = false;
    this.state = undefined;
    await super.onShutdown();
  }

  private requireState(): TState {
    if (!this.state) {
      throw new Error(
        `Message interface "${this.definition.id}" has not completed setup`,
      );
    }
    return this.state;
  }

  private async deliver(
    input: ChannelDeliveryInput,
  ): Promise<ChannelDeliveryResult> {
    if (!this.definition.deliver) {
      return { status: "failed", failureCode: "delivery_not_supported" };
    }
    try {
      const recipient = this.parseRecipient(input.recipient);
      const outcome = await this.definition.deliver({
        config: this.config,
        state: this.requireState(),
        recipient,
        message: { text: input.text },
        delivery: {
          subject: input.subject,
          text: input.text,
          idempotencyKey: input.idempotencyKey,
          ...(input.html !== undefined ? { html: input.html } : {}),
          ...(input.sensitivity !== undefined
            ? { sensitivity: input.sensitivity }
            : {}),
          ...(input.threading !== undefined
            ? { threading: input.threading }
            : {}),
        },
      });
      if (outcome && typeof outcome === "object") {
        return outcome.status === "sent"
          ? {
              status: "sent",
              ...(outcome.providerDeliveryId
                ? { providerDeliveryId: outcome.providerDeliveryId }
                : {}),
            }
          : { status: "failed", failureCode: outcome.failureCode };
      }
      return {
        status: "sent",
        ...(typeof outcome === "string" ? { providerDeliveryId: outcome } : {}),
      };
    } catch (error) {
      this.logger.warn("Outbound channel delivery failed", { error });
      return { status: "failed", failureCode: "delivery_failed" };
    }
  }

  private parseRecipient(recipient: string): z.output<TRecipientSchema> {
    const direct = this.definition.channel.recipient.safeParse(recipient);
    if (direct.success) return direct.data;

    try {
      const parsed = this.definition.channel.recipient.safeParse(
        JSON.parse(recipient),
      );
      if (parsed.success) return parsed.data;
    } catch {
      // A plain subject may map to a single-field recipient object below.
    }

    const shape: unknown = Reflect.get(
      this.definition.channel.recipient,
      "shape",
    );
    const keys =
      shape !== null && typeof shape === "object" ? Object.keys(shape) : [];
    const key = keys.length === 1 ? keys[0] : undefined;
    if (key) {
      return this.definition.channel.recipient.parse({ [key]: recipient });
    }
    return this.definition.channel.recipient.parse(recipient);
  }

  /**
   * What this interface is waiting on, per conversation.
   *
   * Built lazily because most interfaces never see an approval, and restored
   * from stored messages when it does — a brain that restarted mid-approval
   * still knows what the next "yes" refers to.
   */
  private approvals(): PendingApprovalTracker {
    const context = this.getContext();
    this.approvalTracker ??= new PendingApprovalTracker({
      loadMessages: async (conversationId): Promise<readonly unknown[]> =>
        context.conversations.getMessages(conversationId),
      onRestoreError: (error, conversationId): void => {
        this.logger.warn("Could not restore pending approvals", {
          conversationId,
          error: getErrorMessage(error),
        });
      },
    });
    return this.approvalTracker;
  }

  /**
   * Send an answer the way this interface presents one.
   *
   * The runtime decides what the answer is made of and in what order; the
   * interface decides how each part reads. Without a `present` slot only the
   * text goes out, which is what happened before there was a way to say
   * otherwise.
   */
  /**
   * Artifact cards the caller's permission level may not receive.
   *
   * Checked here rather than in each interface: the level is resolved one
   * frame above, and an interface that forgot the check would expose a
   * restricted artifact's existence and metadata — not merely fail to serve
   * its bytes. An interface with no `present` slot never renders cards at
   * all, so this only runs when one is declared.
   */
  private async deniedArtifactCardIds(
    response: AgentResponse,
    userLevel: UserPermissionLevel,
  ): Promise<Set<string>> {
    const context = this.getContext();
    return collectDeniedArtifactCardIds({
      cards: response.cards,
      userLevel,
      displayBaseUrl: effectiveDisplayBaseUrl(context),
      getEntity: (ref: ArtifactEntityRef) =>
        context.entityService.getEntity({
          entityType: ref.entityType,
          id: ref.id,
        }),
      getVisibleEntity: (
        ref: ArtifactEntityRef,
        visibilityScope: ContentVisibility,
      ) =>
        context.entityService.getEntity({
          entityType: ref.entityType,
          id: ref.id,
          visibilityScope,
        }),
    });
  }

  private async deliverResponse(
    channel: { id: string; threadId?: string | undefined },
    response: AgentResponse,
    userLevel: UserPermissionLevel,
    confirmation?: PresentedConfirmation,
  ): Promise<string | undefined> {
    const present = this.definition.present;
    if (!present) {
      return this.sendMessageWithId({
        channelId: channel.id,
        message: response.text,
      });
    }
    const deniedCardIds = await this.deniedArtifactCardIds(response, userLevel);
    const plan = buildResponsePlan(response, { deniedCardIds });
    const presented = await present({
      config: this.config,
      state: this.requireState(),
      channel: {
        id: channel.id,
        ...(channel.threadId ? { threadId: channel.threadId } : {}),
      },
      directives: plan.directives,
      permissionLevel: userLevel,
      ...(confirmation ? { confirmation } : {}),
    });
    if (presented === undefined) return undefined;
    // The interface posted the answer itself; what it hands back is the
    // message to track, and there is nothing left to send.
    if (isPresentedMessage(presented)) return presented.messageId;
    const messages = typeof presented === "string" ? [presented] : presented;
    let firstMessageId: string | undefined;
    for (const message of messages) {
      if (message.length === 0) continue;
      const messageId = await this.sendMessageWithId({
        channelId: channel.id,
        message,
      });
      firstMessageId ??= messageId;
    }
    return firstMessageId;
  }

  /**
   * The conversation a turn on this channel belongs to.
   *
   * Derived from the channel by default, because a room id from somebody
   * else's service is only unique within that service. An interface that
   * mints its own session keys says so, and keeps the id it handed out.
   */
  private conversationIdFor(channel: {
    id: string;
    threadId?: string | undefined;
  }): string {
    const key = this.definition.channel.conversationKey;
    if (typeof key === "function") return key(channel);
    if (key === "channel") return channel.id;
    return [this.definition.channel.type, channel.id, channel.threadId]
      .filter((part): part is string => part !== undefined)
      .join(":");
  }

  /**
   * Who is asking, and at what level.
   *
   * An interface holding a verified session has already answered this better
   * than the configured rules can; one that has not falls back to them, which
   * is right for a sender who is just an id elsewhere.
   */
  private callerLevel(
    caller: AuthenticatedCaller | undefined,
    senderId: string,
  ): {
    permission: UserPermissionLevel;
    isAnchor: boolean;
  } {
    const context = this.getContext();
    const interfaceType = this.definition.channel.type;
    return {
      permission:
        caller?.permissionLevel ??
        context.permissions.getUserLevel(interfaceType, senderId),
      isAnchor:
        caller?.isAnchor ??
        context.permissions.isAnchor(interfaceType, senderId),
    };
  }

  /**
   * What every turn on this channel carries.
   *
   * Answering a question the brain asked is as much the person's act as
   * asking one, so a confirmation is attributed the same way — an approval
   * recorded without an actor loses who authorised the thing it did.
   */
  private turnContext(
    input: {
      sender: InboundMessageSender;
      channel: MessageChannel;
      caller?: AuthenticatedCaller | undefined;
    },
    permission: UserPermissionLevel,
    isAnchor: boolean,
  ): ChatContext {
    const interfaceType = this.definition.channel.type;
    const channelName =
      input.channel.name ?? this.definition.channel.displayName;
    return {
      userPermissionLevel: permission,
      isAnchor,
      interfaceType,
      channelId: input.channel.id,
      channelName,
      actor: {
        identity: callerIdentity(input, interfaceType),
        interfaceType,
        role: "user",
        ...(input.sender.displayName
          ? { displayName: input.sender.displayName }
          : {}),
      },
      source: {
        channelId: input.channel.id,
        channelName,
        ...(input.channel.threadId ? { threadId: input.channel.threadId } : {}),
      },
    };
  }

  /**
   * An approval the client named, rather than one spelled out in a reply.
   *
   * Everything a turn gets is the same — the input is marked as processing so
   * progress routes to this channel, the answer goes through `present`, tool
   * activity is reported. What differs is that nothing has to be parsed back
   * out of a sentence, and that an approval the brain is no longer holding is
   * reported rather than answered as a fresh question.
   */
  /** What is still pending here, restored from the conversation if need be. */
  private async pendingApprovals(
    channel: MessageChannel,
  ): Promise<readonly string[]> {
    return [
      ...(await this.approvals().getApprovalIds(
        this.conversationIdFor(channel),
      )),
    ];
  }

  private async resolveApproval(
    input: ResolveApprovalInput,
    signal: AbortSignal,
  ): Promise<ApprovalOutcome> {
    if (!input.sender.id.trim() || !input.channel.id.trim()) {
      throw new Error("Authenticated messages require sender and channel ids");
    }
    const context = this.getContext();
    const { permission, isAnchor } = this.callerLevel(
      input.caller,
      input.sender.id,
    );
    const conversationId = this.conversationIdFor(input.channel);

    this.startProcessingInput(input.channel.id);
    try {
      const resolved = await context.agent.confirmPendingAction(
        conversationId,
        input.approved,
        input.approvalId,
        this.turnContext(input, permission, isAnchor),
        signal,
      );
      // Answered, whatever the agent says next; the sync re-adds it only if
      // the answer says it is still pending.
      this.approvals().removeApproval(conversationId, input.approvalId);
      this.approvals().syncFromResponse(
        conversationId,
        resolved,
        input.approvalId,
      );
      await this.deliverResponse(input.channel, resolved, permission, {
        approvalId: input.approvalId,
        approved: input.approved,
        remaining: [...(await this.approvals().getApprovalIds(conversationId))],
      });
      await this.handleAgentResponseToolStatuses(resolved, conversationId);
      return hasApprovalCard(resolved, input)
        ? { kind: "resolved" }
        : { kind: "not-pending", text: resolved.text };
    } finally {
      this.endProcessingInput();
    }
  }

  private async receiveAuthenticated(
    input: ReceiveAuthenticatedInput,
    signal: AbortSignal,
  ): Promise<void> {
    if (!input.sender.id.trim() || !input.channel.id.trim()) {
      throw new Error("Authenticated messages require sender and channel ids");
    }
    const context = this.getContext();
    const { permission, isAnchor } = this.callerLevel(
      input.caller,
      input.sender.id,
    );
    const conversationId = this.conversationIdFor(input.channel);
    const attachments: ChatAttachment[] = [];
    if (input.attachments) {
      const pending = await input.attachments();
      for (const attachment of pending) {
        attachments.push(await attachmentFrom(attachment, signal));
      }
    }

    // A reply to a question the brain asked is not a new question. Routing
    // it here rather than in each interface is what keeps "yes" from being
    // answered as if nobody had asked anything.
    const approvalIds = await this.approvals().getApprovalIds(conversationId);
    const routed = routeConfirmationResponse({
      message: this.definition.interpret
        ? this.definition.interpret({
            config: this.config,
            state: this.requireState(),
            text: input.text,
            approvalIds: [...approvalIds],
          })
        : input.text,
      approvalIds,
    });
    if (routed.kind === "notice") {
      await this.sendMessageWithId({
        channelId: input.channel.id,
        message: routed.message,
      });
      return;
    }
    if (routed.kind === "confirm") {
      this.startProcessingInput(input.channel.id);
      try {
        const resolved = await context.agent.confirmPendingAction(
          conversationId,
          routed.confirmed,
          routed.approvalId,
          this.turnContext(input, permission, isAnchor),
          signal,
        );
        this.approvals().removeApproval(conversationId, routed.approvalId);
        this.approvals().syncFromResponse(
          conversationId,
          resolved,
          routed.approvalId,
        );
        await this.deliverResponse(input.channel, resolved, permission, {
          approvalId: routed.approvalId,
          approved: routed.confirmed,
          remaining: [
            ...(await this.approvals().getApprovalIds(conversationId)),
          ],
        });
      } finally {
        this.endProcessingInput();
      }
      return;
    }

    this.startProcessingInput(input.channel.id);
    try {
      const response = await context.agent.chat(
        input.text,
        conversationId,
        {
          ...this.turnContext(input, permission, isAnchor),
          ...(input.messageId
            ? {
                source: {
                  channelId: input.channel.id,
                  messageId: input.messageId,
                  channelName:
                    input.channel.name ?? this.definition.channel.displayName,
                  ...(input.channel.threadId
                    ? { threadId: input.channel.threadId }
                    : {}),
                },
              }
            : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
        },
        signal,
      );
      this.approvals().rememberFromResponse(conversationId, response);
      const messageId = await this.deliverResponse(
        input.channel,
        response,
        permission,
      );
      // Every job the answer started — a tool's, or the one an artifact card
      // is waiting on — reports back to the message that announced it.
      if (messageId) {
        for (const jobId of getResponseJobIds(response)) {
          this.trackAgentResponseForJob(jobId, messageId, input.channel.id);
        }
      }
      await this.handleAgentResponseToolStatuses(response, conversationId);
    } finally {
      this.endProcessingInput();
    }
  }
}

export function createDeclarativeMessageInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TRecipientSchema extends z.ZodType<unknown, unknown>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
  >,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
): MessageInterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  return new DeclarativeMessageInterfacePlugin(
    definition,
    config,
    metadata,
    id,
  );
}
