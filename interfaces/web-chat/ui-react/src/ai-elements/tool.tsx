/** @jsxImportSource react */
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { isValidElement } from "react";

export type ToolProps = ComponentProps<"details">;

export const Tool = ({ className, ...props }: ToolProps): ReactElement => {
  const composed = className
    ? `web-chat-data-part ${className}`
    : "web-chat-data-part";
  return <details className={composed} {...props} />;
};

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "awaiting approval",
  "approval-responded": "responded",
  "input-available": "running",
  "input-streaming": "pending",
  "output-available": "completed",
  "output-denied": "denied",
  "output-error": "error",
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
}: ToolHeaderProps): ReactElement => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const composed = className
    ? `web-chat-data-part-header ${className}`
    : "web-chat-data-part-header";

  return (
    <summary className={composed}>
      <span>
        {title ?? derivedName}
        <span className="web-chat-data-part-status" data-state={state}>
          {" · "}
          {statusLabels[state]}
        </span>
      </span>
      <span className="web-chat-data-part-chevron" aria-hidden="true" />
    </summary>
  );
};

export type ToolContentProps = ComponentProps<"div">;

export const ToolContent = ({
  className,
  ...props
}: ToolContentProps): ReactElement => {
  const composed = className
    ? `web-chat-data-part-body ${className}`
    : "web-chat-data-part-body";
  return <div className={composed} {...props} />;
};

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({
  className,
  input,
  ...props
}: ToolInputProps): ReactElement => (
  <div className={className} {...props}>
    <h4 className="web-chat-data-part-label">Parameters</h4>
    <pre>{JSON.stringify(input, null, 2)}</pre>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps): ReactElement | null => {
  if (!(output || errorText)) {
    return null;
  }

  let body: ReactNode;
  if (typeof output === "object" && !isValidElement(output)) {
    body = <pre>{JSON.stringify(output, null, 2)}</pre>;
  } else if (typeof output === "string") {
    body = <pre>{output}</pre>;
  } else {
    body = <div>{output as ReactNode}</div>;
  }

  return (
    <div
      className={className}
      data-variant={errorText ? "error" : "result"}
      {...props}
    >
      <h4 className="web-chat-data-part-label">
        {errorText ? "Error" : "Result"}
      </h4>
      {errorText ? <p className="web-chat-error">{errorText}</p> : null}
      {body}
    </div>
  );
};
