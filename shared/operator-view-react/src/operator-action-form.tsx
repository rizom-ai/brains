/** @jsxImportSource react */
import { formFieldStyles as fieldStyles } from "./operator-form-field.styles";
import * as stylex from "@stylexjs/stylex";
import type { RuntimeOperatorActionControl } from "@brains/plugins";
import { useContext, useState, type ReactElement } from "react";
import { OperatorRendererHostContext } from "./operator-view-host";
import type { OperatorJsonValue } from "./operator-view-host";

import { plainRecord } from "./operator-action-values";

export function actionFormInput(
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

export function clearSecretFormFields(
  action: RuntimeOperatorActionControl,
  form: HTMLFormElement,
): void {
  for (const field of action.form?.fields ?? []) {
    if (!field.secret) continue;
    const control = form.elements.namedItem(field.name);
    if (control && "value" in control) control.value = "";
  }
}

export function ActionFormFields(props: {
  action: RuntimeOperatorActionControl;
}): ReactElement {
  const { Input, Select, Textarea, engine } = useContext(
    OperatorRendererHostContext,
  ).components;
  const controlStyles = { xstyle: engine === "css" && fieldStyles.control };
  const initial = plainRecord(props.action.input) ?? {};
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (props.action.form?.fields ?? []).flatMap((field) => {
        if (field.control !== "select") return [];
        const value = initial[field.name];
        // An optional select starts on its empty choice.
        const selectedValue =
          typeof value === "string"
            ? value
            : field.required
              ? field.options?.[0]?.value
              : undefined;
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
                defaultValue={
                  typeof value === "string"
                    ? value
                    : field.required
                      ? undefined
                      : ""
                }
                required={field.required}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {!field.required && <option value="">None</option>}
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          );
        }
        if (field.control === "textarea") {
          return (
            <label
              key={field.name}
              {...stylex.props(fieldStyles.label, fieldStyles.wideLabel)}
            >
              <span>{label}</span>
              <Textarea
                xstyle={
                  engine === "css" && [
                    fieldStyles.control,
                    fieldStyles.textarea,
                  ]
                }
                name={field.name}
                defaultValue={typeof value === "string" ? value : ""}
                required={field.required}
                rows={4}
              />
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
