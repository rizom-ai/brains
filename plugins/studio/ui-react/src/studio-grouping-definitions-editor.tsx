/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  Button,
  ConfirmDialog,
  Input,
  NativeSelect,
} from "@brains/app-ui-react";
import { isRecord } from "@brains/utils/is-record";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import {
  MAX_GROUPING_DEFINITIONS,
  type GroupingDefinitionIssue,
} from "../../src/grouping-definitions-contract";
import {
  addGroupingDefinition,
  createGroupingDefinitionDraft,
  inspectGroupingDefinitionDraft,
  removeGroupingDefinition,
  replaceGroupingDefinitionRow,
  type GroupingDefinitionDraft,
} from "./grouping-definition-draft";
import { GroupingMembershipField } from "./grouping-membership-field";
import { StudioStatus } from "./studio-status";
import { fieldStyles as f } from "./studio-fields.styles";
import { groupingSharedStyles as v } from "./grouping-shared.styles";
import { groupingDefinitionsEditorStyles as s } from "./grouping-definitions-editor.styles";

export interface GroupingDefinitionEditorState {
  issues: GroupingDefinitionIssue[];
  /** The host must block save AND guard navigation while this is true. */
  pendingChanges: boolean;
}
export interface GroupingDefinitionUsage {
  /** Distinct entries, not the sum of per-value memberships. */
  entries: number;
  values: readonly { value: string; count: number }[];
}

function groupingUsage(
  usage: Readonly<Record<string, GroupingDefinitionUsage>> | undefined,
  key: string,
): GroupingDefinitionUsage | undefined {
  return usage && Object.hasOwn(usage, key) ? usage[key] : undefined;
}

/** A compound field: the host still owns ordinary document save/conflict handling. */
export function StudioGroupingDefinitionsEditor(props: {
  value: unknown;
  savedKeys: readonly string[];
  contributorTypes: readonly { entityType: string; label: string }[];
  readOnly: boolean;
  usage?: Readonly<Record<string, GroupingDefinitionUsage>> | undefined;
  issues?: readonly GroupingDefinitionIssue[] | undefined;
  onChange: (value: Record<string, unknown>) => void;
  onStateChange: (state: GroupingDefinitionEditorState) => void;
}): ReactElement {
  const [draft, setDraft] = useState(() =>
    createGroupingDefinitionDraft(props.value, props.savedKeys),
  );
  const [confirmation, setConfirmation] = useState<number | "reset" | null>(
    null,
  );
  const node = useRef<HTMLDivElement>(null);
  const focusRow = useRef<number | undefined>(undefined);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const statusId = useId();
  const sourceDigest = JSON.stringify(props.value);
  const savedDigest = JSON.stringify(props.savedKeys);
  const published = useRef(sourceDigest);
  const lastSaved = useRef(savedDigest);
  const reported = useRef<string | undefined>(undefined);
  const eligibleTypes = new Set(
    props.contributorTypes.map((type) => type.entityType),
  );
  const result = inspectGroupingDefinitionDraft(draft);
  useEffect(() => {
    if (sourceDigest === published.current && savedDigest === lastSaved.current)
      return;
    published.current = sourceDigest;
    lastSaved.current = savedDigest;
    setDraft(createGroupingDefinitionDraft(props.value, props.savedKeys));
    setConfirmation(null);
  }, [sourceDigest, props.value, savedDigest, props.savedKeys]);
  useEffect(() => {
    const state = {
      issues: result.issues,
      pendingChanges: result.pendingChanges,
    };
    const digest = JSON.stringify(state);
    if (reported.current === digest) return;
    reported.current = digest;
    props.onStateChange(state);
  });
  useEffect(() => {
    if (focusRow.current !== undefined) {
      node.current
        ?.querySelector<HTMLInputElement>(
          `[data-definition-row="${focusRow.current}"] input`,
        )
        ?.focus();
      focusRow.current = undefined;
    }
    if (confirmation === null && returnFocus.current) {
      (returnFocus.current.isConnected
        ? returnFocus.current
        : node.current?.querySelector<HTMLButtonElement>(
            "[data-definition-add]",
          )
      )?.focus();
      returnFocus.current = null;
    }
  }, [draft, confirmation]);
  const confirm = (
    target: number | "reset",
    button: HTMLButtonElement,
  ): void => {
    button.focus();
    returnFocus.current = button;
    setConfirmation(target);
  };
  const commit = (next: GroupingDefinitionDraft): void => {
    if (props.readOnly) return;
    setDraft(next);
    const inspected = inspectGroupingDefinitionDraft(next);
    if (inspected.value !== undefined) {
      published.current = JSON.stringify(inspected.value);
      props.onChange(inspected.value);
    }
    // Report inside the input event, before a following save/navigation event
    // can use the host's last serializable (but now stale) map.
    const state = {
      issues: inspected.issues,
      pendingChanges: inspected.pendingChanges,
    };
    reported.current = JSON.stringify(state);
    props.onStateChange(state);
  };
  const selected = draft.rows.find((row) => row.id === confirmation);
  const selectedLabel =
    selected &&
    isRecord(selected.value) &&
    typeof selected.value["label"] === "string"
      ? selected.value["label"]
      : selected?.key;
  const selectedUsage = selected
    ? groupingUsage(props.usage, selected.key)
    : undefined;
  const issues = [...result.issues, ...(props.issues ?? [])];
  return (
    <div
      ref={node}
      role="group"
      aria-label="Grouping definitions"
      aria-describedby={issues.length ? statusId : undefined}
    >
      <p {...stylex.props(s.intro)}>
        Groups collect entries by exact frontmatter values. Removing a grouping
        or a listed value never rewrites entries. Values outside a list stay
        visible until an editor changes them.
      </p>
      {props.readOnly && (
        <StudioStatus>
          You can use these groupings. Only administrators can change their
          definitions.
        </StudioStatus>
      )}
      {draft.malformed ? (
        <>
          <StudioStatus tone="error">
            The stored groupings are not a mapping. Their source has not been
            discarded.
          </StudioStatus>
          <pre {...stylex.props(s.readOnly)}>
            {JSON.stringify(draft.malformed.value, null, 2)}
          </pre>
          {!props.readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={(event) => confirm("reset", event.currentTarget)}
            >
              Replace invalid definitions
            </Button>
          )}
        </>
      ) : (
        <>
          {draft.rows.length === 0 && (
            <section {...stylex.props(s.first)}>
              <h2 {...stylex.props(v.title)}>Your first grouping</h2>
              <p {...stylex.props(s.intro)}>
                Bring related Notes and Posts together without moving them.
                Define a label, its types, and whether editors choose one value
                or several.
              </p>
            </section>
          )}
          {draft.rows.map((row) => {
            const entry = isRecord(row.value) ? row.value : undefined;
            const saved = row.savedKey !== undefined;
            const label =
              typeof entry?.["label"] === "string" && entry["label"].length > 0
                ? entry["label"]
                : saved
                  ? row.key
                  : "New grouping";
            const excludedTypes = Array.isArray(entry?.["excludeTypes"])
              ? entry["excludeTypes"].filter(
                  (type: unknown): type is string => typeof type === "string",
                )
              : [];
            const multiple = entry?.["multiple"];
            const closed =
              entry !== undefined && Object.hasOwn(entry, "values");
            const usage = groupingUsage(props.usage, row.key);
            const counts = usage
              ? new Map(usage.values.map((value) => [value.value, value.count]))
              : undefined;
            const set = (field: string, value: unknown): void => {
              if (!entry) return;
              const next = { ...entry, [field]: value };
              if (
                field === "excludeTypes" &&
                Array.isArray(value) &&
                value.length === 0
              )
                delete next[field];
              commit(
                replaceGroupingDefinitionRow(draft, row.id, { value: next }),
              );
            };
            const rowIssues = issues.filter(
              (issue) => issue.path[1] === row.key,
            );
            return (
              <section
                key={row.id}
                {...stylex.props(v.section)}
                aria-label={label}
                data-definition-row={row.id}
              >
                <div {...stylex.props(v.head)}>
                  <h2 {...stylex.props(v.title)}>{label}</h2>
                  {!props.readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove ${label} grouping`}
                      onClick={(event) => confirm(row.id, event.currentTarget)}
                    >
                      Remove grouping
                    </Button>
                  )}
                </div>
                {rowIssues.length > 0 && (
                  <StudioStatus tone="error">
                    {rowIssues.map((issue) => issue.message).join(" · ")}
                  </StudioStatus>
                )}
                {!entry ? (
                  <>
                    <StudioStatus tone="error">
                      This definition is not a mapping. Repair its source or
                      explicitly remove the definition.
                    </StudioStatus>
                    <pre {...stylex.props(s.readOnly)}>
                      {JSON.stringify(row.value, null, 2)}
                    </pre>
                  </>
                ) : (
                  <>
                    <div {...stylex.props(s.grid)}>
                      <label {...stylex.props(f.field)}>
                        <span {...stylex.props(f.label)}>Label</span>
                        {props.readOnly ? (
                          <span {...stylex.props(s.readOnly)}>{label}</span>
                        ) : (
                          <Input
                            aria-label={`${label} label`}
                            value={
                              typeof entry["label"] === "string"
                                ? entry["label"]
                                : ""
                            }
                            onChange={(event) =>
                              set("label", event.currentTarget.value)
                            }
                            required
                          />
                        )}
                      </label>
                      <label {...stylex.props(f.field)}>
                        <span {...stylex.props(f.label)}>Key</span>
                        {props.readOnly ? (
                          <code {...stylex.props(s.readOnly)}>{row.key}</code>
                        ) : (
                          <Input
                            aria-label={`${label} key`}
                            value={row.key}
                            readOnly={saved}
                            xstyle={saved ? f.readOnly : undefined}
                            required
                            onChange={(event) => {
                              if (!saved)
                                commit(
                                  replaceGroupingDefinitionRow(draft, row.id, {
                                    key: event.currentTarget.value,
                                  }),
                                );
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
                        {props.readOnly ? (
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
                              multiple === true
                                ? "several"
                                : multiple === false
                                  ? "one"
                                  : ""
                            }
                            onChange={(event) =>
                              set(
                                "multiple",
                                event.currentTarget.value === "several",
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
                    <details {...stylex.props(s.exclusions)}>
                      <summary {...stylex.props(f.label, s.exclusionsSummary)}>
                        Exclude types
                        {excludedTypes.length > 0
                          ? ` (${excludedTypes.length})`
                          : ""}
                      </summary>
                      <p {...stylex.props(f.listHelp, s.help)}>
                        Applies to all content types unless excluded.
                      </p>
                      {props.readOnly ? (
                        <span {...stylex.props(s.readOnly)}>
                          {excludedTypes
                            .map(
                              (type) =>
                                props.contributorTypes.find(
                                  (candidate) => candidate.entityType === type,
                                )?.label ?? `${type} (unavailable)`,
                            )
                            .join(", ") || "None"}
                        </span>
                      ) : (
                        <fieldset {...stylex.props(s.choices)}>
                          <legend {...stylex.props(f.label)}>
                            Excluded content types
                          </legend>
                          {[
                            ...props.contributorTypes,
                            ...excludedTypes
                              .filter((type) => !eligibleTypes.has(type))
                              .map((type) => ({
                                entityType: type,
                                label: `${type} (unavailable)`,
                              })),
                          ].map((type) => (
                            <label
                              key={type.entityType}
                              {...stylex.props(s.choice)}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Exclude ${type.label}`}
                                {...stylex.props(v.checkbox)}
                                checked={excludedTypes.includes(
                                  type.entityType,
                                )}
                                onChange={(event) =>
                                  set(
                                    "excludeTypes",
                                    event.currentTarget.checked
                                      ? [...excludedTypes, type.entityType]
                                      : excludedTypes.filter(
                                          (value) => value !== type.entityType,
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
                    <fieldset {...stylex.props(s.choices, s.rule)}>
                      <legend {...stylex.props(f.label)}>Allowed values</legend>
                      {props.readOnly ? (
                        <span {...stylex.props(s.readOnly)}>
                          {closed ? "Only these values" : "Any value"}
                        </span>
                      ) : (
                        <>
                          {[false, true].map((list) => (
                            <label
                              key={String(list)}
                              {...stylex.props(s.choice)}
                            >
                              <input
                                type="radio"
                                name={`${titleId}-${row.id}-allowed`}
                                aria-label={`${label}: ${list ? "only these values" : "any value"}`}
                                checked={closed === list}
                                {...stylex.props(v.checkbox)}
                                onChange={() => {
                                  if (list) set("values", []);
                                  else
                                    commit(
                                      replaceGroupingDefinitionRow(
                                        draft,
                                        row.id,
                                        {
                                          value: Object.fromEntries(
                                            Object.entries(entry).filter(
                                              ([field]) => field !== "values",
                                            ),
                                          ),
                                        },
                                      ),
                                    );
                                }}
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
                          onChange={(values) => set("values", values)}
                          readOnly={props.readOnly}
                          counts={counts}
                        />
                        <p {...stylex.props(f.listHelp, s.help)}>
                          {Array.isArray(entry["values"]) &&
                          entry["values"].length === 0
                            ? "Add at least one allowed value, or choose Any value."
                            : usage
                              ? "Numbers show current usage. Unused values remain available."
                              : "Usage is unavailable until this grouping can be read."}
                        </p>
                      </>
                    )}
                  </>
                )}
              </section>
            );
          })}
          {!props.readOnly && (
            <div {...stylex.props(s.actions)}>
              <Button
                type="button"
                variant="outline"
                data-definition-add=""
                disabled={draft.rows.length >= MAX_GROUPING_DEFINITIONS}
                onClick={() => {
                  focusRow.current = draft.nextId;
                  commit(addGroupingDefinition(draft));
                }}
              >
                Add grouping
              </Button>
              <span {...stylex.props(f.kind)}>
                {draft.rows.length} / {MAX_GROUPING_DEFINITIONS}
              </span>
            </div>
          )}
        </>
      )}
      {issues.length > 0 && (
        <div id={statusId}>
          <StudioStatus tone="error">
            Cannot save:{" "}
            {issues
              .map((issue) => {
                const path = issue.path.slice(1).join(".");
                return path ? `${path}: ${issue.message}` : issue.message;
              })
              .join(" · ")}
          </StudioStatus>
        </div>
      )}
      {confirmation !== null && !props.readOnly && (
        <ConfirmDialog
          mark="−"
          title={
            confirmation === "reset"
              ? "Replace invalid definitions?"
              : `Remove ${selectedLabel?.length ? selectedLabel : "unsaved"} grouping?`
          }
          titleId={titleId}
          cancelLabel={
            confirmation === "reset" ? "Keep definitions" : "Keep grouping"
          }
          confirmLabel={
            confirmation === "reset" ? "Replace definitions" : "Remove grouping"
          }
          confirmVariant="danger"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            commit(
              confirmation === "reset"
                ? createGroupingDefinitionDraft({})
                : removeGroupingDefinition(draft, confirmation),
            );
            setConfirmation(null);
          }}
        >
          <p>
            {confirmation === "reset"
              ? "This replaces the invalid definitions with an empty document when you save. "
              : selectedUsage
                ? selectedUsage.entries === 1
                  ? "1 entry carries this grouping and keeps its values. "
                  : `${selectedUsage.entries} entries carry this grouping and keep their values. `
                : "Usage is unavailable. Existing entries keep their values. "}
            No entries are deleted or moved. The change takes effect after
            saving.
          </p>
          {confirmation !== "reset" && (
            <p>Re-adding the same key can collect those values again.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
