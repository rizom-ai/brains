/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./ai-elements/conversation";
import {
  ConfirmationPart,
  GenericDataPart,
  ToolResultPart,
} from "./ai-elements/data-parts";
import { MarkdownResponse } from "./ai-elements/markdown-response";
import { Message, MessageContent } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";

const conversationStorageKey = "brain:web-chat:conversation-id";

function createConversationId(): string {
  return `web-${crypto.randomUUID()}`;
}

function getBrowserConversationId(): string {
  try {
    const stored = localStorage.getItem(conversationStorageKey);
    if (stored) return stored;
    const next = createConversationId();
    localStorage.setItem(conversationStorageKey, next);
    return next;
  } catch {
    return createConversationId();
  }
}

function getPartData(part: unknown): unknown {
  if (typeof part !== "object" || part === null || !("data" in part)) {
    return undefined;
  }
  return part.data;
}

export function App(): React.ReactElement {
  const [input, setInput] = useState("");
  const conversationId = useMemo(() => getBrowserConversationId(), []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport,
  });

  return (
    <main
      className="web-chat-app"
      data-web-chat-app="true"
      data-web-chat-ui="ai-elements-v0"
      data-conversation-id={conversationId}
      aria-label="Brain chat"
    >
      <header className="web-chat-header">
        <h1>Brain Chat</h1>
        <p className="web-chat-version" data-web-chat-version="ai-elements-v0">
          AI Elements UI
        </p>
      </header>
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Ask this brain for help."
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  <strong>{message.role}</strong>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MarkdownResponse key={index}>
                          {part.text}
                        </MarkdownResponse>
                      );
                    }
                    if (part.type === "data-tool-result") {
                      return (
                        <ToolResultPart key={index} data={getPartData(part)} />
                      );
                    }
                    if (part.type === "data-confirmation") {
                      return (
                        <ConfirmationPart
                          key={index}
                          conversationId={conversationId}
                          data={getPartData(part)}
                        />
                      );
                    }
                    if (part.type.startsWith("data-")) {
                      return (
                        <GenericDataPart
                          key={index}
                          type={part.type}
                          data={getPartData(part)}
                        />
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
      </Conversation>
      {status !== "ready" ? (
        <p className="web-chat-status" data-status={status}>
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="web-chat-error" role="alert">
          {error.message}
        </p>
      ) : null}
      <PromptInput
        onSubmit={() => {
          const text = input.trim();
          if (!text) return;
          setInput("");
          void sendMessage({ text });
        }}
      >
        <label htmlFor="web-chat-input">Message</label>
        <PromptInputTextarea
          id="web-chat-input"
          value={input}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        <PromptInputSubmit status={status} />
      </PromptInput>
    </main>
  );
}
