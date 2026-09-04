import { createExternalActorId } from "@brains/contracts";
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
  ReceiveAuthenticatedInput,
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
import { buildResponsePlan } from "./response-render-plan";
import type { AgentResponse } from "../contracts/agent";
import type { JobContext, JobProgressEvent } from "@brains/job-queue";
import type { z } from "@brains/utils/zod";
import { collectDeniedArtifactCardIds } from "./artifact-access";
import type { ArtifactEntityRef } from "./artifact-entity";
import type { ContentVisibility } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";

function normalizedOutput(message: MessageInterfaceOutput): MessageOutput {
  if (typeof message === "string") return { text: message };
  return {
    text: message.fallbackText ?? "Message update",
  };
}

async function attachmentFrom(
  attachment: InboundMessageAttachment,
  signal: AbortSignal,
): Promise<ChatAttachment> {
  const response = await fetch(attachment.url, { signal });
  if (!response.ok) {
    throw new Error(
      `Attachment "${attachment.name}" could not be downloaded (${response.status})`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (attachment.mediaType.startsWith("text/")) {
    return {
      kind: "text",
      filename: attachment.name,
      mediaType: attachment.mediaType,
      content: new TextDecoder().decode(data),
      sizeBytes: data.byteLength,
    };
  }
  return {
    kind: "file",
    filename: attachment.name,
    mediaType: attachment.mediaType,
    data,
    sizeBytes: data.byteLength,
  };
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
          domain: context.domain,
          messaging: {
            send: (message) =>
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

    const subscriptions =
      this.definition.subscriptions?.({
        config: this.config,
        state: this.requireState(),
      }) ?? [];
    const topics = new Set<string>();
    for (const subscription of subscriptions) {
      if (topics.has(subscription.topic)) {
        throw new Error(
          `Message interface "${this.definition.id}" subscribes to "${subscription.topic}" more than once`,
        );
      }
      topics.add(subscription.topic);
      context.messaging.subscribe(subscription.topic, async (message) => {
        const payload = subscription.payload.safeParse(message.payload);
        if (!payload.success) {
          return {
            success: false,
            error: `Message interface "${this.definition.id}" rejected a malformed "${subscription.topic}" request`,
          };
        }
        try {
          return {
            success: true,
            data: await subscription.handle({
              payload: payload.data,
              source: message.source,
              entities: context.entityService,
              identity: context.identity,
              messaging: {
                send: (message) =>
                  context.messaging.send({
                    type: message.type,
                    payload: message.payload,
                  }),
              },
            }),
          };
        } catch (error) {
          // A handler that cannot answer says so by throwing; the caller sees
          // a failed response rather than a successful one wrapping a refusal.
          return { success: false, error: getErrorMessage(error) };
        }
      });
    }

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
    const id = await this.definition.send({
      config: this.config,
      state: this.requireState(),
      channel: { id: request.channelId },
      message: normalizedOutput(request.message),
      origin: "reply",
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
      displayBaseUrl: context.domain,
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
    });
    if (presented === undefined) return undefined;
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

  private async receiveAuthenticated(
    input: ReceiveAuthenticatedInput,
    signal: AbortSignal,
  ): Promise<void> {
    if (!input.sender.id.trim() || !input.channel.id.trim()) {
      throw new Error("Authenticated messages require sender and channel ids");
    }
    const context = this.getContext();
    const interfaceType = this.definition.channel.type;
    const permission = context.permissions.getUserLevel(
      interfaceType,
      input.sender.id,
    );
    const isAnchor = context.permissions.isAnchor(
      interfaceType,
      input.sender.id,
    );
    const conversationId = [
      interfaceType,
      input.channel.id,
      input.channel.threadId,
    ]
      .filter((part): part is string => part !== undefined)
      .join(":");
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
          { userPermissionLevel: permission, isAnchor, interfaceType },
          signal,
        );
        this.approvals().syncFromResponse(
          conversationId,
          resolved,
          routed.approvalId,
        );
        await this.deliverResponse(input.channel, resolved, permission);
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
          userPermissionLevel: permission,
          isAnchor,
          interfaceType,
          channelId: input.channel.id,
          actor: {
            identity: {
              kind: "external",
              externalActorId: createExternalActorId(
                interfaceType,
                input.sender.id,
              ),
            },
            interfaceType,
            role: "user",
            ...(input.sender.displayName
              ? { displayName: input.sender.displayName }
              : {}),
          },
          source: {
            channelId: input.channel.id,
            ...(input.channel.threadId
              ? { threadId: input.channel.threadId }
              : {}),
          },
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
      if (messageId) {
        for (const result of response.toolResults ?? []) {
          if (result.jobId) {
            this.trackAgentResponseForJob(
              result.jobId,
              messageId,
              input.channel.id,
            );
          }
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
