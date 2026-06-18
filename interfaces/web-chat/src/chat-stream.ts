import type {
  AgentNamespace,
  AgentResponse,
  ChatAttachment,
} from "@brains/plugins";
import type { UIMessage, UIMessageStreamWriter } from "ai";
import type { ApprovalResponse } from "./chat-input";
import {
  redactUploadRefs,
  writeStructuredCards,
  writeTextPart,
} from "./stream-writer";

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
}

interface StreamedChatInput {
  writer: UIMessageStreamWriter<UIMessage>;
  conversationId: string;
  message: string;
  permissionLevel: "anchor" | "public";
  attachments: ChatAttachment[];
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
        userPermissionLevel: input.permissionLevel,
        interfaceType: input.interfaceType,
        channelId: input.conversationId,
        channelName: "Web Chat",
        attachments: input.attachments,
      },
    );

    await deps.handleAgentResponseToolStatuses(response, input.conversationId);
    writeText(input.writer, response.text, "text", deps.createId);
    for (const toolResult of response.toolResults ?? []) {
      input.writer.write({
        type: "data-tool-result",
        id: deps.createId("tool"),
        data: redactUploadRefs(toolResult),
      });
    }
    writeStructuredCards(input.writer, response.cards ?? []);
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
          userPermissionLevel: input.permissionLevel,
          interfaceType: input.interfaceType,
          channelId: input.conversationId,
          channelName: "Web Chat",
        },
      );
      await deps.handleAgentResponseToolStatuses(
        response,
        input.conversationId,
      );
      writeText(input.writer, response.text, "text", deps.createId);
      writeStructuredCards(input.writer, response.cards ?? []);
    }
  } finally {
    deps.endProcessingInput();
    deps.activeStreams.delete(input.conversationId);
  }
}

export function writeText(
  writer: UIMessageStreamWriter<UIMessage>,
  text: string,
  prefix: string,
  createId: (prefix: string) => string,
): string {
  const id = createId(prefix);
  writeTextPart(writer, id, text);
  return id;
}
