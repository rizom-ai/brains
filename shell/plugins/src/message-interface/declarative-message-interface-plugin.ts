import { createExternalActorId } from "@brains/contracts";
import { emptyPluginState } from "../base/empty-state";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "../channel-registry";
import {
  createMessageInterfacePluginContext,
  type MessageInterfacePluginContext,
} from "../interface/context";
import type {
  IShell,
  Plugin,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import { PluginCore } from "../plugin-core";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { createAccountDaemon } from "../operator/account-daemon-supervisor";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { createDeclarativeDaemon } from "../interface/declarative-daemon";
import { packageRuntimeState } from "../internal/state-namespace";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type {
  MessageChannel,
  MessageInterfaceDefinitionInput,
  MessageOutput,
  ReceiveAuthenticatedInput,
} from "../interface/interface-definition-contract";
import type {
  EditMessageRequest,
  MessageInterfaceOutput,
  ProgressMessageCoordinator,
  SendMessageToChannelRequest,
  SendMessageWithIdRequest,
} from "./progress-message-coordinator";
import {
  createMessageCoordinator,
  subscribeMessageCoordination,
} from "./message-coordination";
import { takeInboundAttachments } from "./inbound-attachment-intake";
import { sharedUploadScope } from "../service/upload-registry";
import type { UserPermissionLevel } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";

function normalizedOutput(message: MessageInterfaceOutput): MessageOutput {
  if (typeof message === "string") return { text: message };
  return {
    text: message.fallbackText ?? "Message update",
  };
}

/** Who may upload over a channel: as chat has it, a trusted sender or an admin. */
function mayUpload(permission: UserPermissionLevel): boolean {
  return permission === "admin" || permission === "trusted";
}

/** The notice a sender is shown for the uploads a message could not bring. */
function skippedUploads(notices: readonly string[]): string {
  return [
    "Some uploads were skipped:",
    ...[...new Set(notices)].map((notice) => `- ${notice}`),
  ].join("\n");
}

class DeclarativeMessageInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TRecipientSchema extends z.ZodType<unknown, unknown>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends PluginCore<
  z.output<TConfigSchema>,
  z.output<TConfigSchema>,
  MessageInterfacePluginContext
> {
  public readonly type = "interface" as const;
  /** Job progress and tool statuses, routed to the channel they belong to. */
  private readonly progress: ProgressMessageCoordinator;
  private readonly definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
  >;
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private hasRequiredDaemon = false;
  private state: TState | undefined;
  /** What setup acquired, released last first at shutdown. */
  private readonly cleanups: Array<() => void | Promise<void>> = [];

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
    this.progress = createMessageCoordinator({
      id,
      logger: (): Logger => this.logger,
      sendMessageToChannel: (request): void => {
        this.sendMessageToChannel(request);
      },
      sendMessageWithId: (request): Promise<string | undefined> =>
        this.sendMessageWithId(request),
      editMessage: (request): Promise<boolean> => this.editMessage(request),
      supportsMessageEditing: (): boolean => this.supportsMessageEditing(),
    });
  }

  override async register(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    const context = createMessageInterfacePluginContext(
      shell,
      this.id,
      registrationContext,
    );
    this.context = context;
    this.setupMessageHandlers(context);
    await this.onRegister(context);
    return this.getCapabilities();
  }

  /**
   * Worker registration: the channel and its sender, and nothing else of
   * the interface, so a background job can deliver on it.
   */
  async registerChannelsForExecution(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<void> {
    const context = createMessageInterfacePluginContext(shell, this.id, {
      ...registrationContext,
      executionOnly: true,
    });
    this.context = context;
    await this.registerChannels(context);
  }

  /**
   * The definition's channel and sender, with the state `setup` prepares for
   * them. This also runs in the worker, so background jobs can deliver.
   */
  private async registerChannels(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    this.state = this.definition.setup
      ? await this.definition.setup({
          config: this.config,
          lifecycle: {
            onCleanup: (cleanup): void => {
              this.cleanups.push(cleanup);
            },
          },
          runtimeState: packageRuntimeState(
            context.runtimeState,
            this.packageName,
          ),
        })
      : emptyPluginState<TState>();
    context.channels.registerDescriptor({
      type: this.definition.channel.type,
      displayName: this.definition.channel.displayName,
      subjectLabel: this.definition.channel.subjectLabel,
      ...(this.definition.deliver ? { manualDelivery: true } : {}),
    });

    if (this.definition.deliver) {
      context.channels.registerDeliveryProvider({
        channelType: this.definition.channel.type,
        isAvailable: () => Promise.resolve(this.state !== undefined),
        send: (input) => this.deliver(input),
      });
    }
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await this.registerChannels(context);
    subscribeMessageCoordination(context, {
      id: this.id,
      logger: (): Logger => this.logger,
      handleProgressEvent: (event) => this.progress.handleProgressEvent(event),
      handleToolActivityEvent: (event) =>
        this.progress.handleToolActivityEvent(event),
    });
    if (this.definition.accountSettings) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.id,
        packageName: this.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }

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

  requiresDaemonStartup(): boolean {
    return this.hasRequiredDaemon;
  }

  private sendMessageToChannel(request: SendMessageToChannelRequest): void {
    const channelId = request.channelId;
    const send = this.definition.send;
    if (!channelId || !send) return;
    Promise.resolve()
      .then(() =>
        send({
          config: this.config,
          state: this.requireState(),
          channel: { id: channelId },
          message: normalizedOutput(request.message),
        }),
      )
      .catch((error: unknown) => {
        this.logger.error("Message delivery failed", { error });
      });
  }

  private async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    if (!request.channelId) return undefined;
    return this.reply({ id: request.channelId }, request.message);
  }

  /** Sends to a channel as the message came in, its thread included. */
  private async reply(
    channel: MessageChannel,
    message: MessageInterfaceOutput,
  ): Promise<string | undefined> {
    if (!this.definition.send) return undefined;
    const id = await this.definition.send({
      config: this.config,
      state: this.requireState(),
      channel: {
        id: channel.id,
        ...(channel.threadId ? { threadId: channel.threadId } : {}),
      },
      message: normalizedOutput(message),
    });
    return typeof id === "string" ? id : undefined;
  }

  private async editMessage(request: EditMessageRequest): Promise<boolean> {
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

  private supportsMessageEditing(): boolean {
    return this.definition.edit !== undefined;
  }

  protected override async onShutdown(): Promise<void> {
    this.accountSettingsRegistration = undefined;
    this.hasRequiredDaemon = false;
    this.state = undefined;
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      await cleanup();
    }
    // Interrupt delayed cleanup before the progress state is released.
    await this.progress.close();
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
      const deliveryId = await this.definition.deliver({
        config: this.config,
        state: this.requireState(),
        recipient,
        message: { text: input.text },
      });
      return {
        status: "sent",
        ...(typeof deliveryId === "string"
          ? { providerDeliveryId: deliveryId }
          : {}),
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
    // A sender who may not upload brings no files; nothing of theirs is read.
    const list = mayUpload(permission) ? input.attachments : undefined;
    const { attachments, notices } = list
      ? await takeInboundAttachments({
          list,
          store: context.uploads.scoped(sharedUploadScope),
          metadata: {
            interfaceType,
            channelId: input.channel.id,
            ...(input.channel.threadId
              ? { threadId: input.channel.threadId }
              : {}),
            uploaderId: input.sender.id,
            ...(input.sender.displayName
              ? { uploaderUsername: input.sender.displayName }
              : {}),
          },
          signal,
          logger: this.logger,
        })
      : { attachments: [], notices: [] };
    if (notices.length > 0) {
      await this.reply(input.channel, skippedUploads(notices));
    }
    // Nothing left to answer: no words, and no file that could be taken.
    if (!input.text.trim() && attachments.length === 0) return;

    this.progress.startProcessingInput(input.channel.id);
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
          ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        },
        signal,
      );
      const messageId = await this.reply(input.channel, response.text);
      if (messageId) {
        for (const result of response.toolResults ?? []) {
          if (result.jobId) {
            this.progress.trackAgentResponseForJob(
              result.jobId,
              messageId,
              input.channel.id,
            );
          }
        }
      }
      await this.progress.handleAgentResponseToolStatuses(
        response,
        conversationId,
      );
    } finally {
      this.progress.endProcessingInput();
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
): Plugin {
  return new DeclarativeMessageInterfacePlugin(
    definition,
    config,
    metadata,
    id,
  );
}
