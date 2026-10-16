/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button, Input, NativeSelect } from "@brains/app-ui-react";
import { isRecord } from "@brains/utils/is-record";
import type { ReactElement } from "react";
import type { GroupingDefinitionIssue } from "../../src/grouping-definitions-contract";
import type { GroupingDefinitionDraftRow } from "./grouping-definition-draft";
import { GroupingMembershipField } from "./grouping-membership-field";
import { StudioStatus } from "./studio-status";
import { fieldStyles as f } from "./studio-fields.styles";
import { groupingSharedStyles as v } from "./grouping-shared.styles";
import { groupingDefinitionsEditorStyles as s } from "./grouping-definitions-editor.styles";

export interface GroupingDefinitionUsage {
  /** Distinct entries, not the sum of per-value memberships. */
  entries: number;
  values: readonly { value: string; count: number }[];
}
export type GroupingDefinitionRowUpdate = Partial<
  Pick<GroupingDefinitionDraftRow, "key" | "value">
>;
interface ContributorType {
  entityType: string;
  label: string;
}
type Definition = Record<string, unknown>;

/** Replace one field; an emptied exclusion list is dropped, not stored as []. */
function withField(
  entry: Definition,
  field: string,
  value: unknown,
): Definition {
  const next = { ...entry, [field]: value };
  if (field === "excludeTypes" && Array.isArray(value) && value.length === 0)
    delete next[field];
  return next;
}

/** One definition of the grouping editor. The host owns the draft and commits updates. */
export function GroupingDefinitionRow(props: {
  row: GroupingDefinitionDraftRow;
  usage: GroupingDefinitionUsage | undefined;
  contributorTypes: readonly ContributorType[];
  systemTypes: readonly string[];
  readOnly: boolean;
  /** Issues already scoped to this row's key. */
  issues: readonly GroupingDefinitionIssue[];
  /** Radio group name for the allowed-values policy, unique per editor and row. */
  allowedValuesName: string;
  onUpdate: (update: GroupingDefinitionRowUpdate) => void;
  /** Receives the pressed button so the host can confirm and restore focus. */
  onRemove: (button: HTMLButtonElement) => void;
}): ReactElement {
  const { row, readOnly } = props;
  const entry = isRecord(row.value) ? row.value : undefined;
  const saved = row.savedKey !== undefined;
  const label =
    typeof entry?.["label"] === "string" && entry["label"].length > 0
      ? entry["label"]
      : saved
        ? row.key
        : "New grouping";
  const change = (value: Definition): void => props.onUpdate({ value });
  return (
    <section
      {...stylex.props(v.section)}
      aria-label={label}
      data-definition-row={row.id}
    >
      <div {...stylex.props(v.head)}>
        <h2 {...stylex.props(v.title)}>{label}</h2>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${label} grouping`}
            onClick={(event) => props.onRemove(event.currentTarget)}
          >
            Remove grouping
          </Button>
        )}
      </div>
      {props.issues.length > 0 && (
        <StudioStatus tone="error">
          {props.issues.map((issue) => issue.message).join(" · ")}
        </StudioStatus>
      )}
      {!entry ? (
        <>
          <StudioStatus tone="error">
            This definition is not a mapping. Repair its source or explicitly
            remove the definition.
          </StudioStatus>
          <pre {...stylex.props(s.readOnly)}>
            {JSON.stringify(row.value, null, 2)}
          </pre>
        </>
      ) : (
        <>
          <DefinitionFields
            entry={entry}
            label={label}
            rowKey={row.key}
            saved={saved}
            readOnly={readOnly}
            onChange={change}
            onKeyChange={(key) => props.onUpdate({ key })}
          />
          <ExclusionsField
            entry={entry}
            contributorTypes={props.contributorTypes}
            systemTypes={props.systemTypes}
            readOnly={readOnly}
            onChange={change}
          />
          <AllowedValuesField
            entry={entry}
            label={label}
            name={props.allowedValuesName}
            usage={props.usage}
            readOnly={readOnly}
            onChange={change}
          />
        </>
      )}
    </section>
  );
}

function DefinitionFields(props: {
  entry: Definition;
  label: string;
  rowKey: string;
  saved: boolean;
  readOnly: boolean;
  onChange: (value: Definition) => void;
  onKeyChange: (key: string) => void;
}): ReactElement {
  const { entry, label, saved, readOnly } = props;
  const multiple = entry["multiple"];
  return (
    <div {...stylex.props(s.grid)}>
      <label {...stylex.props(f.field)}>
        <span {...stylex.props(f.label)}>Label</span>
        {readOnly ? (
          <span {...stylex.props(s.readOnly)}>{label}</span>
        ) : (
          <Input
            aria-label={`${label} label`}
            value={typeof entry["label"] === "string" ? entry["label"] : ""}
            onChange={(event) =>
              props.onChange(
                withField(entry, "label", event.currentTarget.value),
              )
            }
            required
          />
        )}
      </label>
      <label {...stylex.props(f.field)}>
        <span {...stylex.props(f.label)}>Key</span>
        {readOnly ? (
          <code {...stylex.props(s.readOnly)}>{props.rowKey}</code>
        ) : (
          <Input
            aria-label={`${label} key`}
            value={props.rowKey}
            readOnly={saved}
            xstyle={saved ? f.readOnly : undefined}
            required
            onChange={(event) => {
              if (!saved) props.onKeyChange(event.currentTarget.value);
            }}
          />
        )}
        <span {...stylex.props(f.listHelp, s.help)}>
          {saved
            ? "Fixed after creation"
            : "Lowercase letters, digits and hyphens. Fixed when saved."}
        </span>
      </label>
      <label {...stylex.props(f.field)}>
        <span {...stylex.props(f.label)}>Values per entry</span>
        {readOnly ? (
          <span {...stylex.props(s.readOnly)}>
            {multiple === true
              ? "Several"
              : multiple === false
                ? "One"
                : "Invalid cardinality"}
          </span>
        ) : (
          <NativeSelect
            aria-label={`${label} values per entry`}
            value={
              multiple === true ? "several" : multiple === false ? "one" : ""
            }
            onChange={(event) =>
              props.onChange(
                withField(
                  entry,
                  "multiple",
                  event.currentTarget.value === "several",
                ),
              )
            }
            required
          >
            <option value="" disabled>
              Choose cardinality
            </option>
            <option value="one">One</option>
            <option value="several">Several</option>
          </NativeSelect>
        )}
      </label>
    </div>
  );
}

function ExclusionsField(props: {
  entry: Definition;
  contributorTypes: readonly ContributorType[];
  systemTypes: readonly string[];
  readOnly: boolean;
  onChange: (value: Definition) => void;
}): ReactElement {
  const { entry, contributorTypes } = props;
  const excludedTypes = Array.isArray(entry["excludeTypes"])
    ? entry["excludeTypes"].filter(
        (type: unknown): type is string => typeof type === "string",
      )
    : [];
  const visibleExclusions = excludedTypes.filter(
    (type) => !props.systemTypes.includes(type),
  );
  const eligibleTypes = new Set(
    contributorTypes.map((type) => type.entityType),
  );
  return (
    <details {...stylex.props(s.exclusions)}>
      <summary {...stylex.props(f.label, s.exclusionsSummary)}>
        Exclude types
        {visibleExclusions.length > 0 ? ` (${visibleExclusions.length})` : ""}
      </summary>
      <p {...stylex.props(f.listHelp, s.help)}>
        Content types participate unless excluded. System types never
        participate.
      </p>
      {props.readOnly ? (
        <span {...stylex.props(s.readOnly)}>
          {visibleExclusions
            .map(
              (type) =>
                contributorTypes.find(
                  (candidate) => candidate.entityType === type,
                )?.label ?? `${type} (unavailable)`,
            )
            .join(", ") || "None"}
        </span>
      ) : (
        <fieldset {...stylex.props(s.choices)}>
          <legend {...stylex.props(f.label)}>Excluded content types</legend>
          {[
            ...contributorTypes,
            ...visibleExclusions
              .filter((type) => !eligibleTypes.has(type))
              .map((type) => ({
                entityType: type,
                label: `${type} (unavailable)`,
              })),
          ].map((type) => (
            <label key={type.entityType} {...stylex.props(s.choice)}>
              <input
                type="checkbox"
                aria-label={`Exclude ${type.label}`}
                {...stylex.props(v.checkbox)}
                checked={excludedTypes.includes(type.entityType)}
                onChange={(event) =>
                  props.onChange(
                    withField(
                      entry,
                      "excludeTypes",
                      event.currentTarget.checked
                        ? [...excludedTypes, type.entityType]
                        : excludedTypes.filter(
                            (value) => value !== type.entityType,
                          ),
                    ),
                  )
                }
              />
              {type.label}
            </label>
          ))}
        </fieldset>
      )}
    </details>
  );
}

function AllowedValuesField(props: {
  entry: Definition;
  label: string;
  name: string;
  usage: GroupingDefinitionUsage | undefined;
  readOnly: boolean;
  onChange: (value: Definition) => void;
}): ReactElement {
  const { entry, label, usage } = props;
  const closed = Object.hasOwn(entry, "values");
  const counts = usage
    ? new Map(usage.values.map((value) => [value.value, value.count]))
    : undefined;
  return (
    <>
      <fieldset {...stylex.props(s.choices, s.rule)}>
        <legend {...stylex.props(f.label)}>Allowed values</legend>
        {props.readOnly ? (
          <span {...stylex.props(s.readOnly)}>
            {closed ? "Only these values" : "Any value"}
          </span>
        ) : (
          <>
            {[false, true].map((list) => (
              <label key={String(list)} {...stylex.props(s.choice)}>
                <input
                  type="radio"
                  name={props.name}
                  aria-label={`${label}: ${list ? "only these values" : "any value"}`}
                  checked={closed === list}
                  {...stylex.props(v.checkbox)}
                  onChange={() =>
                    props.onChange(
                      list
                        ? withField(entry, "values", [])
                        : Object.fromEntries(
                            Object.entries(entry).filter(
                              ([field]) => field !== "values",
                            ),
                          ),
                    )
                  }
                />
                {list ? "Only these values" : "Any value"}
              </label>
            ))}
          </>
        )}
      </fieldset>
      {closed && (
        <>
          <GroupingMembershipField
            label={`${label} allowed values`}
            purpose="allowed-values"
            definition={{ multiple: true }}
            value={entry["values"]}
            onChange={(values) =>
              props.onChange(withField(entry, "values", values))
            }
            readOnly={props.readOnly}
            counts={counts}
          />
          <p {...stylex.props(f.listHelp, s.help)}>
            {Array.isArray(entry["values"]) && entry["values"].length === 0
              ? "Add at least one allowed value, or choose Any value."
              : usage
                ? "Numbers show current usage. Unused values remain available."
                : "Usage is unavailable until this grouping can be read."}
          </p>
        </>
      )}
    </>
  );
}
