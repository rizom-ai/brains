/** @jsxImportSource react */
import type { PropsWithChildren } from "react";

type MessageRole = "system" | "user" | "assistant" | "data";

const roleLabel: Record<MessageRole, string> = {
  user: "You",
  assistant: "Brain",
  system: "System",
  data: "Data",
};

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

export function MessageHeader({
  role,
  time,
}: {
  role: MessageRole;
  time?: string;
}): React.ReactElement {
  return (
    <span className="web-chat-message-header">
      {roleLabel[role]}
      {time ? <time>{time}</time> : null}
    </span>
  );
}

export function MessageBubble({
  children,
}: PropsWithChildren): React.ReactElement {
  return <div className="web-chat-message-bubble">{children}</div>;
}
