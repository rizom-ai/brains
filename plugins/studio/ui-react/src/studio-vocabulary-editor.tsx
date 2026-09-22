/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button } from "@brains/app-ui-react";
import { isRecord } from "@brains/utils/is-record";
import { useEffect, useRef, type ReactElement } from "react";
import type { StudioGrouping } from "../../src/grouping-vocabulary-contract";
import type { ValidationIssue } from "./api";
import { Field } from "./entity-fields";
import { groupingValueLabel } from "./grouping-value";
import { StudioStatus } from "./studio-status";
import { vocabularyStyles as s } from "./grouping-vocabulary.styles";
import { fieldStyles as f } from "./studio-fields.styles";

/** A compound document field, still saved through the ordinary system form. */
export function StudioVocabularyEditor(props: {
  groupings: readonly StudioGrouping[];
  value: unknown;
  readOnly: boolean;
  issues?: ValidationIssue[] | undefined;
  onChange: (value: Record<string, unknown>) => void;
}): ReactElement {
  const node = useRef<HTMLDivElement>(null);
  const entries = isRecord(props.value) ? props.value : {};
  const issues =
    props.issues?.filter((issue) => issue.path[0] === "groupings") ?? [];
  useEffect(() => {
    if (props.issues?.some((issue) => issue.path[0] === "groupings"))
      node.current?.focus();
  }, [props.issues]);
  const declarations = new Map(
    props.groupings.map((grouping) => [grouping.key, grouping]),
  );
  const keys = [...new Set([...declarations.keys(), ...Object.keys(entries)])];
  const set = (key: string, value: unknown): void =>
    props.onChange({ ...entries, [key]: value });
  return (
    <div
      ref={node}
      role="group"
      aria-label="Grouping vocabularies"
      tabIndex={-1}
      data-studio-invalid-field={issues.length ? "groupings" : undefined}
    >
      {props.readOnly && (
        <StudioStatus>
          You can use these lists. Only administrators can change them.
        </StudioStatus>
      )}
      {issues.length > 0 && (
        <StudioStatus tone="error">
          Last save:{" "}
          {issues
            .map(
              (issue) => `${issue.path.slice(1).join(".")}: ${issue.message}`,
            )
            .join(" · ")}
        </StudioStatus>
      )}
      {keys.length === 0 && (
        <StudioStatus>No groupings are declared for this brain.</StudioStatus>
      )}
      {keys.map((key) => {
        const declaration = declarations.get(key);
        const label = declaration?.label ?? key;
        const entry = Object.hasOwn(entries, key) ? entries[key] : undefined;
        const vocabulary = isRecord(entry) ? entry : undefined;
        const values = Array.isArray(vocabulary?.["values"])
          ? vocabulary["values"].filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        const multiple = vocabulary?.["multiple"] === true;
        return (
          <section key={key} {...stylex.props(s.section)} aria-label={label}>
            <div {...stylex.props(s.head)}>
              <h2 {...stylex.props(s.title)}>{label}</h2>
              <span {...stylex.props(f.kind)}>
                {vocabulary ? "Closed" : "Open"}
              </span>
            </div>
            {!declaration && (
              <StudioStatus tone="error">
                This grouping is no longer declared. Remove its list before
                saving.
              </StudioStatus>
            )}
            {vocabulary ? (
              <>
                <p {...stylex.props(f.listHelp)}>
                  {multiple ? "One or several values" : "At most one value"} per
                  entry. Matching is exact.
                </p>
                {props.readOnly ? (
                  <ul {...stylex.props(s.values)}>
                    {values.map((value) => (
                      <li key={value} {...stylex.props(f.tag)}>
                        {groupingValueLabel(value)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <Field
                      literalList
                      descriptor={{
                        name: `${key}-values`,
                        label: `${label} values`,
                        widget: "list",
                        field: {
                          name: "value",
                          label: "Value",
                          widget: "string",
                        },
                      }}
                      value={values}
                      onChange={(values) => set(key, { ...vocabulary, values })}
                    />
                    {values.length === 0 && (
                      <p {...stylex.props(f.listHelp)}>
                        Add at least one value before saving.
                      </p>
                    )}
                    <label {...stylex.props(s.choice)}>
                      <input
                        type="checkbox"
                        {...stylex.props(s.checkbox)}
                        checked={multiple}
                        onChange={(event) =>
                          set(key, {
                            ...vocabulary,
                            multiple: event.currentTarget.checked,
                          })
                        }
                      />
                      Allow multiple values
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove ${label} list`}
                      onClick={() =>
                        props.onChange(
                          Object.fromEntries(
                            Object.entries(entries).filter(
                              ([name]) => name !== key,
                            ),
                          ),
                        )
                      }
                    >
                      Remove list
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <p {...stylex.props(f.listHelp)}>
                  Editors may enter any value.
                </p>
                {!props.readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Define allowed values for ${label}`}
                    onClick={() => set(key, { multiple: true, values: [] })}
                  >
                    Define allowed values
                  </Button>
                )}
              </>
            )}
          </section>
        );
      })}
      <p {...stylex.props(f.listHelp)}>
        Removing a list reopens the grouping. Renaming a listed value does not
        rename memberships.
      </p>
    </div>
  );
}
