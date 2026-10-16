/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button, ConfirmDialog } from "@brains/app-ui-react";
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
  type GroupingDefinitionDraftRow,
} from "./grouping-definition-draft";
import {
  GroupingDefinitionRow,
  type GroupingDefinitionUsage,
} from "./grouping-definition-row";
import { StudioStatus } from "./studio-status";
import { fieldStyles as f } from "./studio-fields.styles";
import { groupingSharedStyles as v } from "./grouping-shared.styles";
import { groupingDefinitionsEditorStyles as s } from "./grouping-definitions-editor.styles";

export interface GroupingDefinitionEditorState {
  issues: GroupingDefinitionIssue[];
  /** The host must block save AND guard navigation while this is true. */
  pendingChanges: boolean;
}
type ConfirmationTarget = number | "reset";

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
  systemTypes: readonly string[];
  readOnly: boolean;
  usage?: Readonly<Record<string, GroupingDefinitionUsage>> | undefined;
  issues?: readonly GroupingDefinitionIssue[] | undefined;
  onChange: (value: Record<string, unknown>) => void;
  onStateChange: (state: GroupingDefinitionEditorState) => void;
}): ReactElement {
  const [draft, setDraft] = useState(() =>
    createGroupingDefinitionDraft(props.value, props.savedKeys),
  );
  const [confirmation, setConfirmation] = useState<ConfirmationTarget | null>(
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
    target: ConfirmationTarget,
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
          {draft.rows.map((row) => (
            <GroupingDefinitionRow
              key={row.id}
              row={row}
              usage={groupingUsage(props.usage, row.key)}
              contributorTypes={props.contributorTypes}
              systemTypes={props.systemTypes}
              readOnly={props.readOnly}
              issues={issues.filter((issue) => issue.path[1] === row.key)}
              allowedValuesName={`${titleId}-${row.id}-allowed`}
              onUpdate={(update) =>
                commit(replaceGroupingDefinitionRow(draft, row.id, update))
              }
              onRemove={(button) => confirm(row.id, button)}
            />
          ))}
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
        <GroupingDefinitionConfirmation
          target={confirmation}
          row={selected}
          usage={
            selected ? groupingUsage(props.usage, selected.key) : undefined
          }
          titleId={titleId}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            commit(
              confirmation === "reset"
                ? createGroupingDefinitionDraft({})
                : removeGroupingDefinition(draft, confirmation),
            );
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}

/** Removing a definition or resetting malformed source never rewrites entries. */
function GroupingDefinitionConfirmation(props: {
  target: ConfirmationTarget;
  /** The definition being removed; absent for a reset. */
  row: GroupingDefinitionDraftRow | undefined;
  usage: GroupingDefinitionUsage | undefined;
  titleId: string;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const { row, usage } = props;
  const reset = props.target === "reset";
  const label =
    row && isRecord(row.value) && typeof row.value["label"] === "string"
      ? row.value["label"]
      : row?.key;
  return (
    <ConfirmDialog
      mark="−"
      title={
        reset
          ? "Replace invalid definitions?"
          : `Remove ${label?.length ? label : "unsaved"} grouping?`
      }
      titleId={props.titleId}
      cancelLabel={reset ? "Keep definitions" : "Keep grouping"}
      confirmLabel={reset ? "Replace definitions" : "Remove grouping"}
      confirmVariant="danger"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p>
        {reset
          ? "This replaces the invalid definitions with an empty document when you save. "
          : usage
            ? usage.entries === 1
              ? "1 entry carries this grouping and keeps its values. "
              : `${usage.entries} entries carry this grouping and keep their values. `
            : "Usage is unavailable. Existing entries keep their values. "}
        No entries are deleted or moved. The change takes effect after saving.
      </p>
      {!reset && <p>Re-adding the same key can collect those values again.</p>}
    </ConfirmDialog>
  );
}
