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
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";

export function App(): React.ReactElement {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  return (
    <main
      data-web-chat-app="true"
      data-web-chat-ui="ai-elements-v0"
      aria-label="Brain chat"
    >
      <h1>Brain Chat</h1>
      <p data-web-chat-version="ai-elements-v0">AI Elements UI</p>
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
                        <MessageResponse key={index}>
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    if (part.type.startsWith("data-")) {
                      return (
                        <pre key={index}>{JSON.stringify(part, null, 2)}</pre>
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
      {status !== "ready" ? <p data-status={status}>{status}</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
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
