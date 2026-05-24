/** @jsxImportSource react */
import type { PropsWithChildren } from "react";

export function Conversation({
  children,
}: PropsWithChildren): React.ReactElement {
  return <section className="web-chat-conversation">{children}</section>;
}

export function ConversationContent({
  children,
}: PropsWithChildren): React.ReactElement {
  return <div className="web-chat-conversation-content">{children}</div>;
}

export function ConversationEmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}): React.ReactElement {
  return (
    <div className="web-chat-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
