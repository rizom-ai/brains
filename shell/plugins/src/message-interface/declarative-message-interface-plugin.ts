import { createExternalActorId } from "@brains/contracts";
import type { ChatAttachment } from "../contracts/agent";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "../channel-registry";
import type { MessageInterfacePluginContext } from "../interface/context";
import { createDeclarativeDaemon } from "../interface/declarative-daemon";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type {
  InboundMessageAttachment,
  MessageInterfaceDefinitionInput,
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
import type { z } from "@brains/utils/zod";

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
> extends MessageInterfacePlugin<
  z.output<TConfigSchema>,
  z.output<TConfigSchema>
> {
  private readonly definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema
  >;
  private state: TState | undefined;

  constructor(
    definition: MessageInterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TRecipientSchema
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
    this.state = this.definition.setup
      ? await this.definition.setup({ config: this.config })
      : (Object.freeze({}) as TState);
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

  protected override sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void {
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

  protected override async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    if (!request.channelId || !this.definition.send) return undefined;
    const id = await this.definition.send({
      config: this.config,
      state: this.requireState(),
      channel: { id: request.channelId },
      message: normalizedOutput(request.message),
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
    const attachments: ChatAttachment[] = [];
    if (input.attachments) {
      const pending = await input.attachments();
      for (const attachment of pending) {
        attachments.push(await attachmentFrom(attachment, signal));
      }
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
      const messageId = await this.sendMessageWithId({
        channelId: input.channel.id,
        message: response.text,
      });
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
>(
  definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema
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
