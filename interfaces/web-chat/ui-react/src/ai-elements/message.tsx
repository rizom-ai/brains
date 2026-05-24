/** @jsxImportSource react */
import type { PropsWithChildren } from "react";

type MessageRole = "system" | "user" | "assistant" | "data";

export function Message({
  children,
  from,
}: PropsWithChildren<{ from: MessageRole }>): React.ReactElement {
  return (
    <article className="web-chat-message" data-role={from}>
      {children}
    </article>
  );
}

export function MessageContent({
  children,
}: PropsWithChildren): React.ReactElement {
  return <div className="web-chat-message-content">{children}</div>;
}

export function MessageResponse({
  children,
}: PropsWithChildren): React.ReactElement {
  return <p className="web-chat-message-response">{children}</p>;
}
