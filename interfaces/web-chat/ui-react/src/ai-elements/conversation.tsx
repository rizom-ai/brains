/** @jsxImportSource react */
import type { ComponentProps, ReactNode } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({
  className,
  ...props
}: ConversationProps): React.ReactElement => (
  <StickToBottom
    className={cn(
      "web-chat-conversation relative flex-1 overflow-y-hidden",
      className,
    )}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps): React.ReactElement => (
  <StickToBottom.Content
    className={cn(
      "web-chat-conversation-content flex flex-col gap-8",
      className,
    )}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  title?: string;
};

export const ConversationEmptyState = ({
  children,
  className,
  description = "Start a conversation to see messages here",
  eyebrow,
  icon,
  title = "No messages yet",
  ...props
}: ConversationEmptyStateProps): React.ReactElement => (
  <div className={cn("web-chat-empty-state", className)} {...props}>
    {children ?? (
      <>
        {icon ?? (
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
        )}
        {eyebrow ? (
          <span className="web-chat-empty-state-eyebrow">{eyebrow}</span>
        ) : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<"button">;

export const ConversationScrollButton = ({
  className,
  children,
  onClick,
  ...props
}: ConversationScrollButtonProps): React.ReactElement | null => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) void scrollToBottom();
    },
    [onClick, scrollToBottom],
  );

  if (isAtBottom) return null;

  return (
    <button
      aria-label="Scroll to bottom"
      className={cn("web-chat-conversation-scroll-button", className)}
      onClick={handleScrollToBottom}
      type="button"
      {...props}
    >
      {children ?? "↓"}
    </button>
  );
};
