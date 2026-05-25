/** @jsxImportSource react */
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { Streamdown } from "streamdown";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({
  className,
  from,
  ...props
}: MessageProps): React.ReactElement => (
  <div
    className={cn(
      "web-chat-message group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    data-role={from}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  className,
  ...props
}: MessageContentProps): React.ReactElement => (
  <div
    className={cn(
      "web-chat-message-bubble is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      className,
    )}
    {...props}
  />
);

export function MessageHeader({
  role,
  time,
}: {
  role: UIMessage["role"];
  time?: string;
}): React.ReactElement {
  const labels: Record<UIMessage["role"], string> = {
    assistant: "Brain",
    system: "System",
    user: "You",
  };

  return (
    <span className="web-chat-message-header">
      {labels[role]}
      {time ? <time>{time}</time> : null}
    </span>
  );
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps): React.ReactElement => (
    <Streamdown
      className={cn(
        "web-chat-markdown-response size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
