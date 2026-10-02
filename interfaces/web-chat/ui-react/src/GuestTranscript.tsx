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

/** "Rizom, with Becca and Jo": the brains an answer drew on, after the one answering. */
export function answeredBy(owner: string, brains: readonly string[]): string {
  const names = brains.filter((name, i) => brains.indexOf(name) === i);
  if (names.length === 0) return owner;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${owner}, with ${list}`;
}

/** An answer's sources as links to what it drew on, each marked for its host
 * with its key and, when it came from another brain, that brain. */
function SourceLinks({
  card,
  owner,
}: {
  card: Extract<ChatCard, { kind: "sources" }>;
  owner: string;
}): ReactElement {
  const brains = card.sources.flatMap((source) =>
    source.brain ? [source.brain.name] : [],
  );
  return (
    <ul
      className="brain-box-sources"
      aria-label={
        brains.length ? `Sources, ${answeredBy(owner, brains)}` : "Sources"
      }
    >
      {brains.length > 0 && (
        <li className="brain-box-answered-by">{answeredBy(owner, brains)}</li>
      )}
      {card.sources.map((source) => (
        <li
          key={source.id}
          {...{ [ASK_SOURCE_ATTRIBUTE]: source.id }}
          {...(source.brain ? { "data-ask-brain": source.brain.name } : {})}
        >
          <span className="brain-box-source-mark" aria-hidden="true" />
          {source.brain && (
            <b className="brain-box-source-brain">{source.brain.name}</b>
          )}
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
                <SourceLinks key={card.id} card={card} owner={assistantLabel} />
              ) : (
                <SourcesPart key={card.id} data={card} openInNewTab />
              ),
            )}
        </article>
      ))}
    </section>
  );
}
