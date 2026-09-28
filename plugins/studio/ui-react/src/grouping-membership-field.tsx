/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button, Input, NativeSelect } from "@brains/app-ui-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import type { GroupingDefinition } from "../../src/grouping-definitions-contract";
import { groupingValueLabel } from "./grouping-value";
import { fieldStyles as f } from "./studio-fields.styles";
import { groupingSharedStyles as v } from "./grouping-shared.styles";
import { groupingMembershipStyles as s } from "./grouping-membership.styles";
import { StudioStatus } from "./studio-status";

/** One literal, lossless control for both cardinalities and both list policies. */
export function GroupingMembershipField(props: {
  label: string;
  /** Editing the allowed-value list is not an entry-cardinality control. */
  purpose?: "membership" | "allowed-values";
  definition: Pick<GroupingDefinition, "multiple" | "values">;
  value: unknown;
  onChange: (value: string[]) => void;
  errorId?: string | undefined;
  suggestions?: readonly string[] | undefined;
  readOnly?: boolean | undefined;
  assist?: ReactNode;
  counts?: ReadonlyMap<string, number> | undefined;
}): ReactElement {
  const id = useId();
  const helpId = useId();
  const labelId = useId();
  const [pending, setPending] = useState("");
  const { multiple, values: allowed } = props.definition;
  const closed = allowed !== undefined;
  const valid =
    props.value === undefined ||
    (Array.isArray(props.value) &&
      props.value.every((value: unknown) => typeof value === "string"));
  const values: string[] = Array.isArray(props.value)
    ? props.value.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];
  const suggestions = [...new Set(props.suggestions ?? [])].filter(
    (value) => !values.includes(value),
  );
  const replacing = !multiple && values.length > 0;
  const validation = {
    "aria-invalid": props.errorId ? true : undefined,
    "aria-describedby":
      [closed ? undefined : helpId, props.errorId].filter(Boolean).join(" ") ||
      undefined,
  };
  const choose = (value: string): void => {
    if (props.readOnly || !valid) return;
    if (!multiple) props.onChange([value]);
    else if (!values.includes(value)) props.onChange([...values, value]);
    setPending("");
  };
  const add = (): void => {
    if (pending.length > 0) choose(pending);
  };
  return (
    <div {...stylex.props(f.field)} data-studio-field="grouping-membership">
      <div
        id={labelId}
        {...stylex.props(props.purpose === "allowed-values" ? f.file : f.label)}
      >
        <span>{props.label}</span>
        {props.purpose !== "allowed-values" && (
          <em {...stylex.props(f.kind)}>{multiple ? "several" : "one"}</em>
        )}
      </div>
      {!valid ? (
        <StudioStatus tone="error">
          This field is not a list of text values. Repair its source before
          changing memberships.
        </StudioStatus>
      ) : (
        <>
          <div
            {...stylex.props(s.frame)}
            role="group"
            aria-labelledby={labelId}
            {...validation}
          >
            <div {...stylex.props(f.tags)}>
              {values.map((value, index) => (
                <span
                  key={`${index}:${value}`}
                  {...stylex.props(f.tag)}
                  data-grouping-member=""
                >
                  <span>{groupingValueLabel(value)}</span>
                  {props.counts && (
                    <span
                      {...stylex.props(s.count)}
                      aria-label={
                        props.counts.has(value)
                          ? `${props.counts.get(value)} entries`
                          : "Usage unavailable"
                      }
                    >
                      {props.counts.get(value) ?? "—"}
                    </span>
                  )}
                  {allowed && !allowed.includes(value) && (
                    <span {...stylex.props(v.marker)}>not in list</span>
                  )}
                  {!props.readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      xstyle={f.tagButton}
                      aria-label={`Remove ${groupingValueLabel(value)}`}
                      onClick={() =>
                        props.onChange(values.filter((_, at) => at !== index))
                      }
                    >
                      ×
                    </Button>
                  )}
                </span>
              ))}
              {!props.readOnly &&
                (allowed ? (
                  <NativeSelect
                    id={id}
                    aria-label={`${replacing ? "Replace" : "Add"} ${props.label} value`}
                    {...validation}
                    xstyle={[f.control, s.select]}
                    value=""
                    onChange={(event) => {
                      if (event.currentTarget.value === "") return;
                      const value = allowed[Number(event.currentTarget.value)];
                      if (value !== undefined) choose(value);
                    }}
                  >
                    <option value="" disabled>
                      {allowed.every((value) => values.includes(value))
                        ? "No other listed values"
                        : replacing
                          ? "Replace value…"
                          : "Choose value…"}
                    </option>
                    {allowed.map((value, index) =>
                      values.includes(value) ? null : (
                        <option key={value} value={String(index)}>
                          {groupingValueLabel(value)}
                        </option>
                      ),
                    )}
                  </NativeSelect>
                ) : (
                  <span {...stylex.props(s.slot)}>
                    <Input
                      id={id}
                      type="text"
                      aria-label={`${replacing ? "Replace" : "Add"} ${props.label} value`}
                      {...validation}
                      xstyle={[f.tagInput, f.literalInput, s.input]}
                      value={pending}
                      placeholder={
                        replacing ? "Replace value…" : "Add a value…"
                      }
                      onChange={(event) =>
                        setPending(event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.nativeEvent.isComposing ||
                          event.key !== "Enter"
                        )
                          return;
                        event.preventDefault();
                        add();
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={replacing ? "Replace value" : "Add value"}
                      disabled={pending.length === 0}
                      onClick={add}
                    >
                      {replacing ? "Replace" : "Add"}
                    </Button>
                  </span>
                ))}
            </div>
          </div>
          {!closed && !props.readOnly && (
            <>
              <div {...stylex.props(s.help)}>
                <span id={helpId} {...stylex.props(f.listHelp)}>
                  {multiple
                    ? "Enter adds one exact value."
                    : "A new value replaces the current choice."}{" "}
                  Commas and spaces are literal.
                  {(pending !== pending.trim() ||
                    values.some((value) => value !== value.trim())) && (
                    <strong>
                      {" "}
                      Surrounding whitespace is preserved and creates a
                      different group.
                    </strong>
                  )}
                </span>
                {props.assist}
              </div>
              {suggestions.length > 0 && (
                <div {...stylex.props(s.suggestions)}>
                  <span {...stylex.props(f.kind)}>From your entries</span>
                  {suggestions.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="xs"
                      variant="outline"
                      aria-label={`Choose ${groupingValueLabel(value)}`}
                      onClick={() => choose(value)}
                    >
                      {groupingValueLabel(value)}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
