/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

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
    <main data-web-chat-app="true" aria-label="Brain chat">
      <h1>Brain Chat</h1>
      <section aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} data-role={message.role}>
            <strong>{message.role}</strong>
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return <p key={index}>{part.text}</p>;
              }
              if (part.type.startsWith("data-")) {
                return <pre key={index}>{JSON.stringify(part, null, 2)}</pre>;
              }
              return null;
            })}
          </article>
        ))}
      </section>
      {status !== "ready" ? <p data-status={status}>{status}</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text) return;
          setInput("");
          void sendMessage({ text });
        }}
      >
        <label htmlFor="web-chat-input">Message</label>
        <textarea
          id="web-chat-input"
          value={input}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        <button type="submit" disabled={status === "submitted"}>
          Send
        </button>
      </form>
    </main>
  );
}
