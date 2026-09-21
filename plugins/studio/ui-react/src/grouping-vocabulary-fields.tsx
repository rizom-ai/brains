/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { NativeSelect } from "@brains/app-ui-react";
import { useId, type ReactElement } from "react";
import type { GroupingVocabulary } from "../../src/grouping-vocabulary-contract";
import type { FieldDescriptor } from "./api";
import { groupingValueLabel } from "./grouping-value";
import { fieldStyles as f } from "./studio-fields.styles";
import { vocabularyStyles as s } from "./grouping-vocabulary.styles";

export function GroupingValue({
  value,
  vocabulary,
}: {
  value: string;
  vocabulary?: GroupingVocabulary | undefined;
}): ReactElement {
  return (
    <span>
      {groupingValueLabel(value)}
      {vocabulary && !vocabulary.values.includes(value) && (
        <span {...stylex.props(s.marker)}>not in list</span>
      )}
    </span>
  );
}

export function ClosedGroupingField(props: {
  descriptor: FieldDescriptor;
  vocabulary: GroupingVocabulary;
  value: unknown;
  errorId: string | undefined;
  onChange: (value: string[]) => void;
}): ReactElement {
  const id = useId();
  const { descriptor, vocabulary, errorId } = props;
  const values = Array.isArray(props.value)
    ? props.value.filter((value): value is string => typeof value === "string")
    : [];
  const selected =
    values.length === 1 ? vocabulary.values.indexOf(values[0] ?? "") : -1;
  const validation = {
    "aria-invalid": errorId ? (true as const) : undefined,
    "aria-describedby": errorId,
  };
  return (
    <div {...stylex.props(f.field)} data-studio-field="grouping-choice">
      {vocabulary.multiple ? (
        <fieldset {...stylex.props(s.choices)} {...validation}>
          <legend {...stylex.props(f.label)}>{descriptor.label}</legend>
          {vocabulary.values.map((value) => (
            <label key={value} {...stylex.props(s.choice)}>
              <input
                type="checkbox"
                {...stylex.props(s.checkbox)}
                {...validation}
                checked={values.includes(value)}
                onChange={(event) =>
                  props.onChange(
                    event.currentTarget.checked
                      ? [...values, value]
                      : values.filter((entry) => entry !== value),
                  )
                }
              />
              {groupingValueLabel(value)}
            </label>
          ))}
        </fieldset>
      ) : (
        <label htmlFor={id} {...stylex.props(f.label)}>
          {descriptor.label}
        </label>
      )}
      {!vocabulary.multiple && (
        <NativeSelect
          id={id}
          {...validation}
          xstyle={f.control}
          value={
            values.length === 0
              ? ""
              : selected >= 0
                ? String(selected + 1)
                : "current"
          }
          onChange={(event) => {
            const choice = event.currentTarget.value;
            if (choice === "") props.onChange([]);
            else {
              const value = vocabulary.values[Number(choice) - 1];
              if (value !== undefined) props.onChange([value]);
            }
          }}
        >
          <option value="">—</option>
          {values.length > 0 && selected < 0 && (
            <option value="current" disabled>
              {values.length > 1
                ? "Multiple values — choose one"
                : `${groupingValueLabel(values[0] ?? "")} — not in list`}
            </option>
          )}
          {vocabulary.values.map((value, index) => (
            <option key={value} value={String(index + 1)}>
              {groupingValueLabel(value)}
            </option>
          ))}
        </NativeSelect>
      )}
      <ul {...stylex.props(s.values)}>
        {values.map((value, index) => (
          <li key={`${index}:${value}`} {...stylex.props(f.tag)}>
            <GroupingValue value={value} vocabulary={vocabulary} />
            <button
              type="button"
              {...stylex.props(f.tagButton)}
              aria-label={`Remove ${groupingValueLabel(value)}`}
              onClick={() =>
                props.onChange(values.filter((_, at) => at !== index))
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <p {...stylex.props(f.listHelp)}>
        {vocabulary.multiple
          ? "Choose any that apply."
          : "Choose at most one value."}
      </p>
    </div>
  );
}
