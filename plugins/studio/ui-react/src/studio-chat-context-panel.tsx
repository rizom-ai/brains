/** @jsxImportSource react */
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { typographyStyles } from "./studio-typography.styles";
import { type ChatCard, type ChatSession } from "@brains/contracts/chat";
import { type ReactElement } from "react";
import { type StudioChatStreamState } from "./chat-workspace-model";

export function ConversationContext(props: {
  cards: ChatCard[];
  progress: StudioChatStreamState["progress"];
  session: ChatSession | undefined;
}): ReactElement {
  return (
    <aside
      className={chatClass("studio-chat-context", chatLayout.contextBody)}
      tabIndex={0}
      aria-label="Conversation sources and attachments"
    >
      <div className={chatClass("studio-chat-context-list", chatLayout.cards)}>
        {props.session?.contextHandoff ? (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              Linked context
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
                typographyStyles.section,
              )}
            >
              {props.session.contextHandoff.titleSeed}
            </h3>
            <p
              className={chatClass(
                "studio-chat-context-card-text",
                chatLayout.cardText,
              )}
            >
              {props.session.contextHandoff.sourceId} ·{" "}
              {props.session.contextHandoff.itemId}
            </p>
          </section>
        ) : null}
        {props.cards.length === 0 && props.progress.length === 0 ? (
          <p className={chatClass("studio-chat-empty", chatLayout.empty)}>
            No sources or attachments in this conversation yet.
          </p>
        ) : null}
        {props.cards.map((card, index) => (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
            key={`${card.kind}-${card.id}-${index}`}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              {card.kind === "sources" ? "Sources" : "Artifact"}
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
                typographyStyles.section,
              )}
            >
              {card.kind === "sources"
                ? (card.title ?? `${card.sources.length} consulted`)
                : card.kind === "attachment"
                  ? card.title
                  : "Conversation context"}
            </h3>
            {card.kind === "sources" ? (
              <>
                <ul>
                  {card.sources.slice(0, 5).map((source) => (
                    <li key={source.id}>{source.title ?? source.source}</li>
                  ))}
                </ul>
                {card.sources.length > 5 ? (
                  <p
                    className={chatClass(
                      "studio-chat-context-card-text",
                      chatLayout.cardText,
                    )}
                  >
                    {card.sources.length - 5} more sources in the conversation.
                  </p>
                ) : null}
              </>
            ) : card.kind === "attachment" && card.description ? (
              <p
                className={chatClass(
                  "studio-chat-context-card-text",
                  chatLayout.cardText,
                )}
              >
                {card.description}
              </p>
            ) : null}
          </section>
        ))}
        {props.progress.map((item, index) => (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
            key={`${item.type}-${index}`}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              Durable job
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
                typographyStyles.section,
              )}
            >
              {item.operationTarget ?? item.operationType}
            </h3>
            <p
              className={chatClass(
                "studio-chat-context-card-text",
                chatLayout.cardText,
              )}
            >
              {item.message ?? item.status}
            </p>
          </section>
        ))}
      </div>
    </aside>
  );
}
