/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import { StudioChatAttachment } from "./studio-chat-attachment";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import {
  type ChatCard,
  type ChatClient,
  type ChatHistoryMessage,
} from "@brains/contracts/chat";
import { type ReactElement } from "react";
import { type StudioChatApproval } from "./chat-workspace-model";
import { StudioMarkdown, useStudioLinkNavigation } from "./studio-markdown";
import { getStudioRouterBasePath } from "./studio-router";
import { isPlainLinkClick } from "./link-click";
import {
  splitProposals,
  type Proposal,
  type ProposalField,
} from "./chat-proposals";
import { linkCitedTitles, sourceHref, type CitedSource } from "./chat-mentions";
import type { ChatSuggestedAction } from "./studio-chat-contracts";

export function ChatEmptyState(props: {
  /** Ways to start, from what this brain can do; each fills the composer. */
  starters?: readonly string[] | undefined;
  onStart?: ((prompt: string) => void) | undefined;
}): ReactElement {
  const starters = props.onStart ? (props.starters ?? []) : [];
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
      {starters.length > 0 && (
        <div
          data-studio-chat-starters=""
          className={chatClass("studio-chat-actions", chatLayout.actions)}
          aria-label="Ways to start"
        >
          {starters.map((starter) => (
            <button
              type="button"
              key={starter}
              onClick={() => props.onStart?.(starter)}
            >
              {starter}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** What a turn beside an open entry does with the text an answer proposes. */
export interface ChatTurnProposals {
  fields: readonly ProposalField[];
  onApply: (proposal: Proposal) => void;
  onTryAnother: (proposal: Proposal) => void;
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
  /** Who answered, where it is not this brain's Chat ("City Pulse"). */
  speaker?: string | undefined;
  /**
   * Beside an open entry, text an answer proposes for one of its fields is a
   * card that applies it to the draft, instead of a code block.
   */
  proposals?: ChatTurnProposals | undefined;
}): ReactElement {
  const split =
    props.proposals && props.message.role === "assistant"
      ? splitProposals(props.message.content, props.proposals.fields)
      : { prose: props.message.content, proposals: [] };
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
        {props.message.role === "user" ? "You" : (props.speaker ?? "Brain")}
      </span>
      <div
        className={chatClass(
          "studio-chat-turn-body",
          chatLayout.turnBody,
          props.message.role === "user" && chatLayout.userBody,
        )}
      >
        {split.proposals.map((proposal) => (
          <section
            key={proposal.field}
            className={chatClass("studio-chat-proposal", chatLayout.card)}
            aria-label={`Proposed ${proposal.label.toLowerCase()}`}
            data-studio-chat-proposal={proposal.field}
          >
            <p className={chatClass("", chatLayout.kicker)}>{proposal.label}</p>
            <blockquote className={chatClass("", chatLayout.cardText)}>
              {proposal.text}
            </blockquote>
            <div
              className={chatClass("studio-chat-actions", chatLayout.actions)}
            >
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={props.disabled}
                onClick={() => props.proposals?.onApply(proposal)}
              >
                {proposal.field === "selection"
                  ? "Replace selection"
                  : `Apply to ${proposal.label.toLowerCase()}`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={props.disabled}
                onClick={() => props.proposals?.onTryAnother(proposal)}
              >
                Try another
              </Button>
            </div>
          </section>
        ))}
        {split.prose ? (
          props.message.role === "assistant" ? (
            <StudioMarkdown
              className={chatClass("studio-chat-prose", chatLayout.cards)}
              presentation="chat"
            >
              {linkCitedTitles(
                split.prose,
                citedSources(props.message.cards),
                getStudioRouterBasePath(),
              )}
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
      <nav
        className={chatClass("studio-chat-sources", chatLayout.card)}
        aria-label={card.title ?? "Sources"}
      >
        <ul data-studio-chat-source-chips="">
          {card.sources.map((source) => {
            const href = sourceHref(source, getStudioRouterBasePath());
            const label = source.title ?? source.source;
            return (
              <li key={source.id}>
                {href ? <SourceLink href={href}>{label}</SourceLink> : label}{" "}
                <span className={chatClass("", chatLayout.sourceType)}>
                  {source.brain?.name ?? source.entityType ?? source.source}
                </span>
              </li>
            );
          })}
        </ul>
      </nav>
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
      {card.state === "output-available" && card.completionSummary && (
        <p>{card.completionSummary}</p>
      )}
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

/** The entries an answer drew on, from its sources cards. */
function citedSources(
  cards: ChatHistoryMessage["cards"] | undefined,
): CitedSource[] {
  return (cards ?? []).flatMap((card) =>
    card.kind === "sources" ? card.sources : [],
  );
}

/** A source chip: a Studio entry opens in place, anything else in a new tab. */
function SourceLink(props: { href: string; children: string }): ReactElement {
  const navigate = useStudioLinkNavigation();
  const internal = props.href.startsWith("/");
  return (
    <a
      href={props.href}
      {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      onClick={(event) => {
        if (!internal || !navigate || !isPlainLinkClick(event)) return;
        event.preventDefault();
        navigate(props.href);
      }}
    >
      {props.children}
    </a>
  );
}
