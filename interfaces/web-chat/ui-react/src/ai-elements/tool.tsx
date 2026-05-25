/** @jsxImportSource react */
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type ToolProps = ComponentProps<"details">;

export const Tool = ({
  className,
  ...props
}: ToolProps): React.ReactElement => (
  <details className={cn("web-chat-data-part", className)} {...props} />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

type ToolState = ToolPart["state"];

const statusLabels: Partial<Record<ToolState, string>> = {
  "approval-requested": "Awaiting approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

export type ToolHeaderProps = ComponentProps<"summary"> & {
  state?: ToolState;
  title?: string;
};

export const ToolHeader = ({
  children,
  className,
  state = "output-available",
  title = "tool result",
  ...props
}: ToolHeaderProps): React.ReactElement => (
  <summary className={cn("web-chat-data-part-header", className)} {...props}>
    <span>{children ?? title}</span>
    <span className="web-chat-tool-status">{statusLabels[state] ?? state}</span>
    <span className="web-chat-data-part-chevron" aria-hidden="true" />
  </summary>
);

export type ToolContentProps = ComponentProps<"div">;

export const ToolContent = ({
  className,
  ...props
}: ToolContentProps): React.ReactElement => (
  <div className={cn("web-chat-data-part-body", className)} {...props} />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({
  className,
  input,
  ...props
}: ToolInputProps): React.ReactElement => (
  <div className={cn("web-chat-tool-section", className)} {...props}>
    <h4>Parameters</h4>
    <pre>{JSON.stringify(input, null, 2)}</pre>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  errorText?: string;
  output: unknown;
};

export const ToolOutput = ({
  className,
  errorText,
  output,
  ...props
}: ToolOutputProps): React.ReactElement | null => {
  if (output === undefined && !errorText) return null;

  let renderedOutput: ReactNode;
  if (errorText) {
    renderedOutput = errorText;
  } else if (typeof output === "string") {
    renderedOutput = output;
  } else {
    renderedOutput = JSON.stringify(output, null, 2);
  }

  return (
    <div
      className={cn("web-chat-tool-section", className)}
      data-error={errorText ? "true" : "false"}
      {...props}
    >
      <h4>{errorText ? "Error" : "Result"}</h4>
      <pre>{renderedOutput}</pre>
    </div>
  );
};
