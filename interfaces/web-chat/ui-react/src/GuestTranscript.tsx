/** @jsxImportSource react */
import type { ReactElement } from "react";
import { Streamdown } from "streamdown";
import { ASK_SOURCE_ATTRIBUTE } from "@brains/contracts";
import {
  getGuestSourceCards,
  type ChatCard,
  type ChatHistoryMessage,
} from "@brains/contracts/chat";
import { SourcesPart } from "./ai-elements/data-parts";

/** The same safe Markdown subset for authored welcome copy and public replies. */
export function GuestMarkdown({
  children,
}: {
  children: string;
}): ReactElement {
  return (
    <Streamdown
      className="web-chat-markdown-response"
      mode="static"
      controls={false}
      skipHtml
      plugins={{}}
      allowedElements={[
        "p",
        "a",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "h1",
        "h2",
        "h3",
        "h4",
        "hr",
        "br",
      ]}
      components={{
        a: ({ href, children }): ReactElement => (
          <a
            href={
              href && /^(https?:\/\/|\/[^/])/i.test(href) ? href : undefined
            }
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
      }}
    >
      {children}
    </Streamdown>
  );
}

/** An answer's sources as links to what it drew on, each marked for its host. */
function SourceLinks({
  card,
}: {
  card: Extract<ChatCard, { kind: "sources" }>;
}): ReactElement {
  return (
    <ul className="brain-box-sources" aria-label="Sources">
      {card.sources.map((source) => (
        <li key={source.id} {...{ [ASK_SOURCE_ATTRIBUTE]: source.id }}>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
          ) : (
            <span>{source.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function GuestTranscript({
  messages,
  assistantLabel = "Brain",
  sourceLinks = false,
}: {
  messages: ChatHistoryMessage[];
  /** Who answers, e.g. the site owner's name. */
  assistantLabel?: string;
  /** List sources as links rather than a collapsed card. */
  sourceLinks?: boolean;
}): ReactElement {
  return (
    <section className="guest-messages" aria-label="Conversation">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`guest-message guest-${message.role}`}
        >
          <h2>{message.role === "user" ? "You" : assistantLabel}</h2>
          {message.role === "user" ? (
            <p>{message.content}</p>
          ) : (
            <GuestMarkdown>{message.content}</GuestMarkdown>
          )}
          {message.role === "assistant" &&
            getGuestSourceCards(message.cards).map((card) =>
              sourceLinks ? (
                <SourceLinks key={card.id} card={card} />
              ) : (
                <SourcesPart key={card.id} data={card} openInNewTab />
              ),
            )}
        </article>
      ))}
    </section>
  );
}
