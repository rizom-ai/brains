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
  eyebrow,
  title,
}: {
  description: string;
  eyebrow?: string;
  title: string;
}): React.ReactElement {
  return (
    <div className="web-chat-empty-state">
      <svg
        className="web-chat-empty-state-glyph"
        viewBox="0 0 180 88"
        aria-hidden="true"
      >
        <path d="M4 60 C 30 60, 40 30, 70 30 S 110 60, 140 50 S 174 30, 178 28" />
        <path d="M70 30 C 78 22, 86 12, 96 10" />
        <path d="M70 30 C 68 44, 80 60, 92 70" />
        <path d="M120 56 C 128 64, 138 70, 152 72" />
        <circle cx="96" cy="10" r="2.5" />
        <circle cx="92" cy="70" r="2.5" />
        <circle cx="178" cy="28" r="2.5" />
      </svg>
      {eyebrow ? (
        <span className="web-chat-empty-state-eyebrow">{eyebrow}</span>
      ) : null}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
