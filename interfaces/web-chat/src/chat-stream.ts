import {
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  buildResponsePlan,
  collectDeniedArtifactCardIds,
  redactUploadRefs,
  type AgentNamespace,
  type AgentResponse,
  type ChatAttachment,
  type ChatContext,
  type MessageArtifactEntity,
} from "@brains/plugins";
import type { UIMessage, UIMessageStreamWriter } from "ai";
import type { ApprovalResponse } from "./chat-input";
import { stripInternalEntityMemoryNote } from "./display-content";
import { writePlanCards, writeTextPart } from "./stream-writer";

export interface ActiveStream {
  writer: UIMessageStreamWriter<UIMessage>;
}

interface StreamDeps {
  activeStreams: Map<string, ActiveStream>;
  agent: AgentNamespace;
  startProcessingInput(conversationId: string): void;
  endProcessingInput(): void;
  handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void>;
  createId(prefix: string): string;
  /** Resolve site URL for artifact entity-ref parsing (denial check). */
  displayBaseUrl: string | undefined;
  /** Backs the permission-denied artifact check so restricted cards are not streamed. */
  entityService: {
    getEntity: (ref: {
      entityType: string;
      id: string;
      visibilityScope?: unknown;
    }) => Promise<MessageArtifactEntity | null | undefined>;
  };
}

async function deniedArtifactCardIds(
  deps: StreamDeps,
  response: Pick<AgentResponse, "cards">,
  userLevel: "anchor" | "public",
): Promise<Set<string>> {
  return collectDeniedArtifactCardIds({
    cards: response.cards,
    userLevel,
    displayBaseUrl: deps.displayBaseUrl,
    getEntity: (ref) => deps.entityService.getEntity(ref),
    getVisibleEntity: (ref, visibilityScope) =>
      deps.entityService.getEntity({ ...ref, visibilityScope }),
  });
}

interface StreamedChatInput {
  writer: UIMessageStreamWriter<UIMessage>;
  conversationId: string;
  message: string;
  permissionLevel: "anchor" | "public";
  attachments: ChatAttachment[];
  messageId?: string;
  interfaceType: string;
}

export async function handleStreamedChat(
  input: StreamedChatInput,
  deps: StreamDeps,
): Promise<void> {
  deps.activeStreams.set(input.conversationId, { writer: input.writer });
  deps.startProcessingInput(input.conversationId);
  input.writer.write({
    type: "data-status",
    id: deps.createId("status"),
    data: { status: "thinking" },
    transient: true,
  });

  try {
    const response = await deps.agent.chat(
      input.message,
      input.conversationId,
      {
        ...buildWebChatContext(input),
        attachments: input.attachments,
      },
    );

    await deps.handleAgentResponseToolStatuses(response, input.conversationId);
    const deniedCardIds = await deniedArtifactCardIds(
      deps,
      response,
      input.permissionLevel,
    );
    const plan = buildResponsePlan(response, { deniedCardIds });
    writeText(input.writer, response.text, "text", deps.createId);
    for (const toolResult of response.toolResults ?? []) {
      input.writer.write({
        type: "data-tool-result",
        id: deps.createId("tool"),
        data: redactUploadRefs(toolResult),
      });
    }
    writePlanCards(input.writer, plan);
  } finally {
    deps.endProcessingInput();
    deps.activeStreams.delete(input.conversationId);
  }
}

interface StreamedConfirmationsInput {
  writer: UIMessageStreamWriter<UIMessage>;
  conversationId: string;
  approvalResponses: ApprovalResponse[];
  permissionLevel: "anchor" | "public";
  interfaceType: string;
}

export async function handleStreamedConfirmations(
  input: StreamedConfirmationsInput,
  deps: StreamDeps,
): Promise<void> {
  deps.activeStreams.set(input.conversationId, { writer: input.writer });
  deps.startProcessingInput(input.conversationId);
  const allApproved = input.approvalResponses.every(
    (approvalResponse) => approvalResponse.approved,
  );
  input.writer.write({
    type: "data-status",
    id: deps.createId("status"),
    data: { status: allApproved ? "approving" : "resolving approvals" },
    transient: true,
  });

  try {
    for (const approvalResponse of input.approvalResponses) {
      const response = await deps.agent.confirmPendingAction(
        input.conversationId,
        approvalResponse.approved,
        approvalResponse.id,
        {
          ...buildWebChatContext(input, {
            trigger: "approval-response",
            approvalId: approvalResponse.id,
          }),
        },
      );
      await deps.handleAgentResponseToolStatuses(
        response,
        input.conversationId,
      );
      const deniedCardIds = await deniedArtifactCardIds(
        deps,
        response,
        input.permissionLevel,
      );
      const plan = buildResponsePlan(response, { deniedCardIds });
      writeText(input.writer, response.text, "text", deps.createId);
      writePlanCards(input.writer, plan);
    }
  } finally {
    deps.endProcessingInput();
    deps.activeStreams.delete(input.conversationId);
  }
}

function buildWebChatContext(
  input: {
    conversationId: string;
    interfaceType: string;
    permissionLevel: "anchor" | "public";
    messageId?: string;
  },
  metadata: Record<string, unknown> = { trigger: "message" },
): ChatContext {
  return {
    userPermissionLevel: input.permissionLevel,
    interfaceType: input.interfaceType,
    channelId: input.conversationId,
    channelName: "Web Chat",
    actor: buildMessageActorMetadata({
      actorId: `${input.interfaceType}:${input.conversationId}:operator`,
      interfaceType: input.interfaceType,
      role: "user",
      displayName: "Web Chat operator",
    }),
    source: buildMessageSourceMetadata({
      ...(input.messageId ? { messageId: input.messageId } : {}),
      channelId: input.conversationId,
      channelName: "Web Chat",
      metadata,
    }),
  };
}

export function writeText(
  writer: UIMessageStreamWriter<UIMessage>,
  text: string,
  prefix: string,
  createId: (prefix: string) => string,
): string {
  const id = createId(prefix);
  writeTextPart(writer, id, stripInternalEntityMemoryNote(text));
  return id;
}
