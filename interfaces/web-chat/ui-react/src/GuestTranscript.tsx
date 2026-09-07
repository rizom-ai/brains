/** @jsxImportSource react */
import type { ReactElement } from "react";
import { Streamdown } from "streamdown";
import {
  getGuestSourceCards,
  type ChatHistoryMessage,
} from "@brains/contracts/chat";
import { SourcesPart } from "./ai-elements/data-parts";

export function GuestTranscript({
  messages,
}: {
  messages: ChatHistoryMessage[];
}): ReactElement {
  return (
    <section className="guest-messages" aria-label="Conversation">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`guest-message guest-${message.role}`}
        >
          <h2>{message.role === "user" ? "You" : "Brain"}</h2>
          {message.role === "user" ? (
            <p>{message.content}</p>
          ) : (
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
                      href && /^(https?:\/\/|\/[^/])/i.test(href)
                        ? href
                        : undefined
                    }
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </Streamdown>
          )}
          {message.role === "assistant" &&
            getGuestSourceCards(message.cards).map((card) => (
              <SourcesPart key={card.id} data={card} openInNewTab />
            ))}
        </article>
      ))}
    </section>
  );
}
