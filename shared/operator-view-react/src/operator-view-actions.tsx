/** @jsxImportSource react */
import { formLayoutStyles as formLayout } from "./operator-form-layout.styles";
import { actionLayoutStyles as actionLayout } from "./operator-action-layout.styles";
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import * as stylex from "@stylexjs/stylex";
import type {
  RuntimeOperatorActionControl,
  RuntimePreparedConfirmation,
} from "@brains/plugins";
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { OperatorRendererHostContext } from "./operator-view-host";
import type {
  OperatorControlVariant,
  OperatorViewComponents,
  PresentedActionResult,
} from "./operator-view-host";

import {
  ActionResult,
  actionFailureMessage,
  presentedActionResult,
} from "./operator-action-result";
import {
  ActionFormFields,
  actionFormInput,
  clearSecretFormFields,
} from "./operator-action-form";

function isPreparedConfirmation(
  value: unknown,
): value is RuntimePreparedConfirmation {
  if (typeof value !== "object" || value === null) return false;
  return (
    "kind" in value &&
    value.kind === "prepared-confirmation" &&
    "token" in value &&
    typeof value.token === "string" &&
    "summary" in value &&
    typeof value.summary === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string"
  );
}

interface AwaitingConfirmation {
  readonly summary: string;
  readonly invocation: RuntimeOperatorActionControl;
}

/**
 * Confirmation remains marked; only the declared page primary gains emphasis.
 * Row controls and ordinary body actions stay subordinate to the content.
 */
function actionVariant(
  action: RuntimeOperatorActionControl,
  subordinate: boolean,
  primary: boolean,
): OperatorControlVariant {
  if (action.confirmation) return "danger";
  return subordinate ? "link" : primary ? "primary" : "secondary";
}

export function OperatorActionButton(props: {
  action: RuntimeOperatorActionControl;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  subordinate?: boolean;
  primary?: boolean;
  components?: OperatorViewComponents | undefined;
}): ReactElement {
  const host = useContext(OperatorRendererHostContext);
  const components = props.components ?? host.components;
  const { Button, ConfirmDialog, Disclosure } = components;
  const titleId = useId();
  const actionKey = `${props.action.actionId}:${JSON.stringify(props.action.input)}`;
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [awaiting, setAwaiting] = useState<AwaitingConfirmation | null>(null);
  const [result, setResult] = useState<PresentedActionResult | null>(null);
  // Bumped when a form succeeds with nothing to report: the form remounts
  // empty, and a disclosure closes, so the change itself is the feedback.
  const [completions, setCompletions] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setResult(null);
  }, [actionKey]);

  const run = async (
    invocation: RuntimeOperatorActionControl,
  ): Promise<void> => {
    setPending(true);
    setMessage("");
    setFailed(false);
    setResult(null);
    try {
      const output = await props.onAction(invocation);
      const presented = presentedActionResult(invocation, output);
      if (mounted.current) {
        setResult(presented);
        if (presented || !invocation.form) {
          setMessage("Completed.");
        } else {
          setCompletions((count) => count + 1);
        }
      } else if (presented) {
        host.onDetachedActionResult?.(presented);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(actionFailureMessage(error));
        setFailed(true);
      }
    } finally {
      if (mounted.current) {
        setPending(false);
        setAwaiting(null);
      }
    }
  };

  const start = async (
    invocation: RuntimeOperatorActionControl,
  ): Promise<void> => {
    const confirmation = invocation.confirmation;
    if (confirmation?.kind === "static") {
      setAwaiting({
        summary: confirmation.message,
        invocation,
      });
      return;
    }
    if (confirmation?.kind !== "prepared") {
      await run(invocation);
      return;
    }
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const prepared = await props.onAction({
        ...invocation,
        invocation: { mode: "prepare" },
      });
      if (!isPreparedConfirmation(prepared)) {
        throw new Error("Invalid prepared confirmation");
      }
      setAwaiting({
        summary: prepared.summary,
        invocation: {
          ...invocation,
          invocation: { mode: "execute", token: prepared.token },
        },
      });
    } catch (error) {
      setMessage(actionFailureMessage(error));
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  const ActionControl = props.action.form ? "div" : "span";
  const formStyles = stylex.props(formLayout.form);
  const actionForm = props.action.form ? (
    <form
      key={`${actionKey}:${completions}`}
      {...formStyles}
      data-action-form=""
      onSubmit={(event) => {
        event.preventDefault();
        const input = actionFormInput(
          props.action,
          new FormData(event.currentTarget),
        );
        clearSecretFormFields(props.action, event.currentTarget);
        void start({ ...props.action, input });
      }}
    >
      <ActionFormFields action={props.action} />
      <Button
        xstyle={formLayout.submit}
        type="submit"
        variant={actionVariant(
          props.action,
          props.subordinate === true,
          props.primary === true,
        )}
        disabled={pending || props.action.disabled === true}
      >
        {pending
          ? "Working…"
          : (props.action.form.submitLabel ?? props.action.label)}
      </Button>
      {message && (
        <small
          className={failed ? "status status-error" : "status"}
          aria-live="polite"
        >
          {message}
        </small>
      )}
      {result && <ActionResult result={result} />}
    </form>
  ) : null;
  return (
    <>
      <ActionControl
        {...stylex.props(rendererLayout.control)}
        data-control-engine={components.engine}
      >
        {props.action.form ? (
          props.action.form.presentation === "disclosure" ? (
            <Disclosure
              key={`${actionKey}:${completions}`}
              className="declarative-action-disclosure"
              presentation="action"
              triggerVariant={props.primary ? "primary" : undefined}
              title={props.action.label}
              triggerLabel={props.action.label}
            >
              {actionForm}
            </Disclosure>
          ) : (
            actionForm
          )
        ) : (
          <Button
            type="button"
            variant={actionVariant(
              props.action,
              props.subordinate === true,
              props.primary === true,
            )}
            disabled={pending || props.action.disabled === true}
            onClick={() => void start(props.action)}
          >
            {pending ? "Working…" : props.action.label}
          </Button>
        )}
        {!props.action.form && message && (
          <small
            {...stylex.props(
              rendererLayout.message,
              failed && rendererLayout.error,
            )}
            aria-live="polite"
          >
            {message}
          </small>
        )}
        {!props.action.form && result && <ActionResult result={result} />}
      </ActionControl>
      {awaiting && (
        <ConfirmDialog
          mark="!"
          title="Run this workspace action?"
          titleId={titleId}
          cancelLabel="Cancel"
          confirmLabel={pending ? "Working…" : "Confirm action"}
          pending={pending}
          onCancel={() => setAwaiting(null)}
          onConfirm={() => void run(awaiting.invocation)}
        >
          <p>{awaiting.summary}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

export function Actions(props: {
  actions: readonly RuntimeOperatorActionControl[];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  subordinate?: boolean;
  label?: string;
  triggerLabel?: string | undefined;
  align?: "end";
}): ReactElement | null {
  const { Disclosure } = useContext(OperatorRendererHostContext).components;
  if (props.actions.length === 0) return null;
  const grouped = props.subordinate === true && props.actions.length > 1;
  const layout = stylex.props(
    grouped ? actionLayout.menu : actionLayout.group,
    props.align === "end" && actionLayout.end,
  );
  const content = (
    <div {...layout} data-actions="">
      {props.actions.map((action, index) => (
        <OperatorActionButton
          key={`${action.actionId}:${action.capabilityId ?? "static"}:${index}`}
          action={action}
          onAction={props.onAction}
          subordinate={props.subordinate === true && !grouped}
        />
      ))}
    </div>
  );
  return grouped ? (
    <Disclosure
      title={props.label ?? "Available actions"}
      triggerLabel={props.triggerLabel ?? "Options"}
      triggerVariant="link"
      className="operator-actions-options"
    >
      {content}
    </Disclosure>
  ) : (
    content
  );
}
