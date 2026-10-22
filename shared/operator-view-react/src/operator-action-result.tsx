/** @jsxImportSource react */
import { actionResultStyles as resultStyles } from "./operator-action-result.styles";
import * as stylex from "@stylexjs/stylex";
import type { RuntimeOperatorActionControl } from "@brains/plugins";
import { useContext, type ReactElement } from "react";
import { OperatorRendererHostContext } from "./operator-view-host";
import type { PresentedActionResult } from "./operator-view-host";

import { plainRecord } from "./operator-action-values";

/**
 * What an operator is told when an action fails.
 *
 * Both action handlers used to answer a bare "Action failed.", discarding the
 * reason the caller returned. An operator reading that has nothing to act on,
 * so the message carries the cause when there is one.
 */
export function actionFailureMessage(error: unknown): string {
  const reason = error instanceof Error ? error.message.trim() : "";
  return reason ? `Action failed: ${reason}` : "Action failed.";
}

export function presentedActionResult(
  action: RuntimeOperatorActionControl,
  value: unknown,
): PresentedActionResult | null {
  if (!action.result) return null;
  const output = plainRecord(value);
  if (!output) return null;
  const fields = action.result.fields.flatMap((field) => {
    const candidate = output[field.name];
    if (candidate === undefined) return [];
    if (
      candidate !== null &&
      typeof candidate !== "string" &&
      typeof candidate !== "number" &&
      typeof candidate !== "boolean"
    ) {
      return [];
    }
    return [
      {
        name: field.name,
        label: field.label,
        value: candidate === null ? "—" : String(candidate),
        copyable: field.copyable === true,
        sensitive: field.sensitive === true,
      },
    ];
  });
  // A reply that names none of the declared fields has nothing to present.
  return fields.length > 0 ? { title: action.result.title, fields } : null;
}

export function ActionResult(props: {
  result: PresentedActionResult;
  onDismiss?: (() => void) | undefined;
}): ReactElement {
  const { Button } = useContext(OperatorRendererHostContext).components;
  const frame = stylex.props(resultStyles.frame);
  return (
    <section
      {...frame}
      data-action-result=""
      data-operator-action-result=""
      aria-live="polite"
    >
      <strong {...stylex.props(resultStyles.title)}>
        {props.result.title}
      </strong>
      <dl {...stylex.props(resultStyles.list)}>
        {props.result.fields.map((field) => (
          <div
            {...stylex.props(resultStyles.row)}
            key={field.name}
            data-sensitive={field.sensitive || undefined}
          >
            <dt {...stylex.props(resultStyles.term)}>{field.label}</dt>
            <dd {...stylex.props(resultStyles.value)}>
              <code {...stylex.props(resultStyles.code)} title={field.value}>
                {field.value}
              </code>
              {field.copyable && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard.writeText(field.value)
                  }
                  xstyle={resultStyles.copy}
                >
                  Copy
                </Button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {props.onDismiss && (
        <Button type="button" variant="ghost" onClick={props.onDismiss}>
          Dismiss
        </Button>
      )}
    </section>
  );
}
