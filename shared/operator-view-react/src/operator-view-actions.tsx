/** @jsxImportSource react */
import { formFieldStyles as fieldStyles } from "./operator-form-field.styles";
import { actionResultStyles as resultStyles } from "./operator-action-result.styles";
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
  OperatorJsonValue,
  PresentedActionResult,
} from "./operator-view-host";

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

function isJsonValue(value: unknown): value is OperatorJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function plainRecord(
  value: unknown,
): Partial<Record<string, OperatorJsonValue>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, OperatorJsonValue> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isJsonValue(candidate)) return undefined;
    result[key] = candidate;
  }
  return result;
}

function actionFormInput(
  action: RuntimeOperatorActionControl,
  data: FormData,
): Record<string, OperatorJsonValue> {
  const input: Record<string, OperatorJsonValue> = {};
  for (const [name, value] of Object.entries(plainRecord(action.input) ?? {})) {
    if (value !== undefined) input[name] = value;
  }
  for (const field of action.form?.fields ?? []) {
    if (field.control === "checkbox") {
      input[field.name] = data.has(field.name);
      continue;
    }
    const value = data.get(field.name);
    if (typeof value !== "string") continue;
    if (!field.required && value === "") {
      delete input[field.name];
      continue;
    }
    input[field.name] = field.control === "number" ? Number(value) : value;
  }
  return input;
}

function clearSecretFormFields(
  action: RuntimeOperatorActionControl,
  form: HTMLFormElement,
): void {
  for (const field of action.form?.fields ?? []) {
    if (!field.secret) continue;
    const control = form.elements.namedItem(field.name);
    if (control && "value" in control) control.value = "";
  }
}

function presentedActionResult(
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
  return { title: action.result.title, fields };
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
      className={`declarative-action-result ${frame.className ?? ""}`}
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

function ActionFormFields(props: {
  action: RuntimeOperatorActionControl;
}): ReactElement {
  const { Input, Select, engine } = useContext(
    OperatorRendererHostContext,
  ).components;
  const controlStyles = { xstyle: engine === "css" && fieldStyles.control };
  const initial = plainRecord(props.action.input) ?? {};
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (props.action.form?.fields ?? []).flatMap((field) => {
        if (field.control !== "select") return [];
        const value = initial[field.name];
        const selectedValue =
          typeof value === "string" ? value : field.options?.[0]?.value;
        return selectedValue ? [[field.name, selectedValue]] : [];
      }),
    ),
  );
  return (
    <>
      {props.action.form?.fields.map((field) => {
        const value = initial[field.name];
        const label =
          field.labelBy?.values.find(
            (candidate) =>
              candidate.value === selected[field.labelBy?.field ?? ""],
          )?.label ?? field.label;
        if (field.control === "checkbox") {
          return (
            <label
              key={field.name}
              {...stylex.props(fieldStyles.label, fieldStyles.checkboxLabel)}
            >
              <input
                {...stylex.props(
                  engine === "css" && fieldStyles.control,
                  fieldStyles.checkbox,
                )}
                name={field.name}
                type="checkbox"
                defaultChecked={value === true}
              />
              <span>{label}</span>
            </label>
          );
        }
        if (field.control === "select") {
          return (
            <label key={field.name} {...stylex.props(fieldStyles.label)}>
              <span>{label}</span>
              <Select
                {...controlStyles}
                name={field.name}
                defaultValue={typeof value === "string" ? value : undefined}
                required={field.required}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          );
        }
        const defaultValue =
          !field.secret &&
          (typeof value === "string" || typeof value === "number")
            ? value
            : "";
        return (
          <label key={field.name} {...stylex.props(fieldStyles.label)}>
            <span>{label}</span>
            <Input
              {...controlStyles}
              name={field.name}
              type={
                field.secret
                  ? "password"
                  : field.control === "url"
                    ? "url"
                    : field.control === "number"
                      ? "number"
                      : "text"
              }
              defaultValue={defaultValue}
              required={field.required}
              autoComplete={field.secret ? "new-password" : undefined}
            />
          </label>
        );
      })}
    </>
  );
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
        setMessage("Completed.");
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
      key={actionKey}
      {...formStyles}
      className={`declarative-action-form ${formStyles.className ?? ""}`}
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
              key={actionKey}
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
    <div
      {...layout}
      className={`declarative-actions ${layout.className ?? ""}`}
    >
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
