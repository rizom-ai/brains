/** @jsxImportSource react */
import type { ChatStatus, FileUIPart } from "ai";
import {
  forwardRef,
  useCallback,
  useState,
  type ComponentProps,
  type FormEvent,
  type FormEventHandler,
  type KeyboardEventHandler,
  type PropsWithChildren,
} from "react";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
}

export type PromptInputProps = Omit<
  ComponentProps<"form">,
  "onSubmit" | "onError"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({
  children,
  className,
  onSubmit,
  ...props
}: PropsWithChildren<PromptInputProps>): React.ReactElement {
  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const text = (formData.get("message") as string | null) ?? "";
      void onSubmit({ files: [], text }, event);
    },
    [onSubmit],
  );

  return (
    <form
      className={cn("web-chat-prompt-input", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
}

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(function PromptInputTextarea(
  { className, name = "message", onKeyDown, ...props },
  ref,
): React.ReactElement {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key !== "Enter") return;
      if (event.shiftKey || isComposing || event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();

      const submitButton = event.currentTarget.form?.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null;
      if (submitButton?.disabled) return;

      event.currentTarget.form?.requestSubmit();
    },
    [isComposing, onKeyDown],
  );

  return (
    <textarea
      ref={ref}
      className={cn("web-chat-prompt-textarea", className)}
      name={name}
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});

export type PromptInputFooterProps = ComponentProps<"div">;

export function PromptInputFooter({
  children,
  className,
  ...props
}: PropsWithChildren<PromptInputFooterProps>): React.ReactElement {
  return (
    <div className={cn("web-chat-prompt-footer", className)} {...props}>
      {children}
    </div>
  );
}

export function PromptInputHint(): React.ReactElement {
  return (
    <span className="web-chat-prompt-hint">
      <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
    </span>
  );
}

function SendIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 18 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M2 7h10M9 3c1.5 2 3 4 5 4-2 0-3.5 2-5 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="2" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export type PromptInputSubmitProps = ComponentProps<"button"> & {
  status?: ChatStatus;
  onStop?: () => void;
};

export function PromptInputSubmit({
  children,
  className,
  disabled = false,
  onClick,
  onStop,
  status = "ready",
  ...props
}: PromptInputSubmitProps): React.ReactElement {
  const isGenerating = status === "submitted" || status === "streaming";

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isGenerating && onStop) {
        event.preventDefault();
        onStop();
        return;
      }
      onClick?.(event);
    },
    [isGenerating, onClick, onStop],
  );

  return (
    <button
      aria-label={isGenerating ? "Stop response" : "Send message"}
      className={cn("web-chat-prompt-submit", className)}
      disabled={disabled && !isGenerating}
      onClick={handleClick}
      type={isGenerating && onStop ? "button" : "submit"}
      {...props}
    >
      {children ??
        (isGenerating ? (
          "Stop"
        ) : (
          <>
            Send
            <SendIcon />
          </>
        ))}
    </button>
  );
}
