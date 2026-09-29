/** @jsxImportSource react */
import { StudioChatAttachment } from "./studio-chat-attachment";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import {
  type ChatCard,
  type ChatClient,
  type ChatHistoryMessage,
} from "@brains/contracts/chat";
import { type ReactElement } from "react";
import { type StudioChatApproval } from "./chat-workspace-model";
import { StudioMarkdown } from "./studio-markdown";
import type { ChatSuggestedAction } from "./studio-chat-contracts";

export function ChatEmptyState(): ReactElement {
  return (
    <section
      className={chatClass(
        "studio-chat-empty",
        chatLayout.empty,
        chatLayout.emptyConversation,
      )}
      aria-label="New conversation"
    >
      <p className={chatClass("", chatLayout.cardText)}>
        No messages yet. Your draft stays in the composer until you send it.
      </p>
    </section>
  );
}

export function ChatTurn(props: {
  disabled: boolean;
  message: ChatHistoryMessage;
  client: ChatClient;
  onAction: (action: ChatSuggestedAction) => Promise<void>;
  onApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  return (
    <article
      className={chatClass(
        "studio-chat-turn",
        chatLayout.turn,
        props.message.role === "user" && chatLayout.userTurn,
      )}
      data-role={props.message.role}
    >
      <span className={chatClass("studio-chat-turn-label", chatLayout.speaker)}>
        {props.message.role === "user" ? "You" : "Brain"}
      </span>
      <div
        className={chatClass(
          "studio-chat-turn-body",
          chatLayout.turnBody,
          props.message.role === "user" && chatLayout.userBody,
        )}
      >
        {props.message.content ? (
          props.message.role === "assistant" ? (
            <StudioMarkdown
              className={chatClass("studio-chat-prose", chatLayout.cards)}
              presentation="chat"
            >
              {props.message.content}
            </StudioMarkdown>
          ) : (
            <p className={chatClass("studio-chat-text", chatLayout.paragraph)}>
              {props.message.content}
            </p>
          )
        ) : null}
        {props.message.attachments?.map((attachment) => (
          <p
            className={chatClass("studio-chat-upload", chatLayout.upload)}
            key={`${attachment.filename}-${attachment.createdAt}`}
          >
            {attachment.filename}
          </p>
        ))}
        {props.message.cards?.length ? (
          <div className={chatClass("studio-chat-cards", chatLayout.cards)}>
            {props.message.cards.map((card) => (
              <MessageCard
                card={card}
                client={props.client}
                disabled={props.disabled}
                key={`${card.kind}-${card.id}`}
                onAction={props.onAction}
                onApproval={props.onApproval}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MessageCard(props: {
  disabled: boolean;
  card: ChatCard;
  client: ChatClient;
  onAction: (action: ChatSuggestedAction) => Promise<void>;
  onApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  const { card } = props;
  if (card.kind === "actions") {
    return (
      <section className={chatClass("studio-chat-card", chatLayout.card)}>
        <span
          className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}
        >
          Actions
        </span>
        {card.title ? <strong>{card.title}</strong> : null}
        <div
          className={chatClass("studio-chat-card-actions", chatLayout.actions)}
        >
          {card.actions.map((action) => (
            <button
              className={chatClass(
                "studio-chat-card-action",
                chatLayout.button,
              )}
              type="button"
              key={action.id}
              disabled={props.disabled}
              onClick={() => void props.onAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    );
  }
  if (card.kind === "sources") {
    return (
      <details className={chatClass("studio-chat-sources", chatLayout.card)}>
        <summary>{card.title ?? `${card.sources.length} sources`}</summary>
        <ul>
          {card.sources.map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a href={source.url}>{source.title ?? source.source}</a>
              ) : (
                (source.title ?? source.source)
              )}
              {source.excerpt && (
                <p className={chatClass("", chatLayout.paragraph)}>
                  {source.excerpt}
                </p>
              )}
              <details>
                <summary>Source details</summary>
                <pre className={chatClass("", chatLayout.source)}>
                  {JSON.stringify(source, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  if (card.kind === "attachment") {
    return <StudioChatAttachment card={card} client={props.client} />;
  }
  const pending = card.state === "approval-requested";
  const approval: StudioChatApproval = {
    approvalId: card.id,
    toolCallId: card.toolCallId ?? card.id,
    toolName: card.toolName,
    ...(card.input ? { input: card.input } : {}),
    ...(card.summary ? { title: card.summary } : {}),
  };
  return (
    <section className={chatClass("studio-chat-card", chatLayout.card)}>
      <span className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}>
        {pending
          ? "Approval required"
          : card.state === "approval-responded"
            ? "Decision received · awaiting result"
            : card.state === "output-available"
              ? "Completed"
              : card.state === "output-denied"
                ? "Declined"
                : "Action failed"}
      </span>
      <strong>{card.summary}</strong>
      {card.completionSummary && <p>{card.completionSummary}</p>}
      {card.error !== undefined && <p role="alert">{card.error}</p>}
      {(card.preview !== undefined || card.input !== undefined) && (
        <details>
          <summary>Review exact action</summary>
          <pre
            className={chatClass("studio-chat-card-preview", chatLayout.source)}
          >
            {card.preview ?? JSON.stringify(card.input, null, 2)}
          </pre>
          {card.preview !== undefined && card.input !== undefined && (
            <details>
              <summary>Tool input</summary>
              <pre className={chatClass("", chatLayout.source)}>
                {JSON.stringify(card.input, null, 2)}
              </pre>
            </details>
          )}
          <p className={chatClass("", chatLayout.cardText)}>
            Tool: {card.toolName}
          </p>
        </details>
      )}
      {card.output !== undefined && (
        <details>
          <summary>Action result</summary>
          <pre className={chatClass("", chatLayout.source)}>
            {typeof card.output === "string"
              ? card.output
              : JSON.stringify(card.output, null, 2)}
          </pre>
        </details>
      )}
      {pending ? (
        <div
          className={chatClass(
            "studio-chat-approval-actions",
            chatLayout.actions,
          )}
        >
          <button
            className={chatClass(
              "studio-chat-approval-action",
              chatLayout.button,
            )}
            type="button"
            disabled={props.disabled}
            onClick={() => void props.onApproval(approval, false)}
          >
            Decline
          </button>
          <button
            className={chatClass(
              "studio-chat-approval-action",
              chatLayout.button,
              chatLayout.primaryButton,
            )}
            data-primary="true"
            type="button"
            disabled={props.disabled}
            onClick={() => void props.onApproval(approval, true)}
          >
            Approve
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ApprovalCard(props: {
  approval: StudioChatApproval;
  disabled: boolean;
  onDecision: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  return (
    <section className={chatClass("studio-chat-approval", chatLayout.card)}>
      <span className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}>
        Approval required
      </span>
      <strong>{props.approval.title ?? props.approval.toolName}</strong>
      {props.approval.input !== undefined && (
        <details>
          <summary>Review exact action</summary>
          <pre className={chatClass("", chatLayout.source)}>
            {JSON.stringify(props.approval.input, null, 2)}
          </pre>
          <p>Tool: {props.approval.toolName}</p>
        </details>
      )}
      <div
        className={chatClass(
          "studio-chat-approval-actions",
          chatLayout.actions,
        )}
      >
        <button
          className={chatClass(
            "studio-chat-approval-action",
            chatLayout.button,
          )}
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onDecision(props.approval, false)}
        >
          Decline
        </button>
        <button
          className={chatClass(
            "studio-chat-approval-action",
            chatLayout.button,
            chatLayout.primaryButton,
          )}
          data-primary="true"
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onDecision(props.approval, true)}
        >
          Approve
        </button>
      </div>
    </section>
  );
}
