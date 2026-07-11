import { markdown } from "@codemirror/lang-markdown";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Streamdown } from "streamdown";
import responsiveStyles from "./responsive.css" with { type: "text" };
import {
  ApiError,
  createEntity,
  deleteEntity,
  fetchAgentTargets,
  fetchEntities,
  fetchEntity,
  fetchSchema,
  fetchSyncStatus,
  fetchTypes,
  requestAgentAnswer,
  requestAssist,
  updateEntity,
  uploadFile,
  type AgentTarget,
  type EntityDetail,
  type EntitySummary,
  type EntityTypeInfo,
  type FieldDescriptor,
  type GitSyncState,
  type SyncStatus,
  type TypeSchema,
} from "./api";

/** Pick the list-row label for an entity: frontmatter title, else id. */
export function entityTitle(entity: EntitySummary): string {
  const title = entity.frontmatter["title"];
  return typeof title === "string" && title.length > 0 ? title : entity.id;
}

export interface CmsHashTarget {
  entityType: string;
  id?: string;
}

/**
 * Parse a console-jump door (#/{entityType}[/{id}]) into an editor target.
 * Ids may contain slashes; both segments are URI-decoded.
 */
export function parseCmsHash(hash: string): CmsHashTarget | null {
  const match = /^#\/([^/]+)(?:\/(.+))?$/.exec(hash);
  const rawType = match?.[1];
  if (rawType === undefined) return null;
  const entityType = decodeURIComponent(rawType);
  const rawId = match?.[2];
  return rawId === undefined
    ? { entityType }
    : { entityType, id: decodeURIComponent(rawId) };
}

/** Initial frontmatter draft for a new entity: descriptor defaults only. */
export function emptyDraft(fields: FieldDescriptor[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) draft[field.name] = field.default;
  }
  return draft;
}

/**
 * Fold one field edit into the frontmatter draft, coercing the raw input
 * value to the type the widget represents. Emptied fields are dropped so
 * optional keys disappear instead of persisting as "".
 */
export function applyFieldChange(
  draft: Record<string, unknown>,
  descriptor: FieldDescriptor,
  raw: string | boolean,
): Record<string, unknown> {
  const next = { ...draft };
  if (raw === "") {
    delete next[descriptor.name];
    return next;
  }
  if (descriptor.widget === "boolean") {
    next[descriptor.name] = raw === true;
    return next;
  }
  if (descriptor.widget === "number") {
    next[descriptor.name] = Number(raw);
    return next;
  }
  next[descriptor.name] = raw;
  return next;
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const BODY_MODES = ["source", "split", "preview"] as const;
export type BodyMode = (typeof BODY_MODES)[number];
const BODY_MODE_LABELS: Record<BodyMode, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

const externalDocumentSync = Annotation.define<boolean>();

const bodyEditorBaseExtensions: Extension[] = [
  markdown(),
  EditorView.lineWrapping,
];

export interface SelectionRange {
  from: number;
  to: number;
}

export function applySuggestionToSelection(
  value: string,
  range: SelectionRange,
  suggestion: string,
): string {
  if (range.from < 0 || range.to < range.from || range.to > value.length) {
    throw new RangeError("Selection range is outside the body");
  }
  return `${value.slice(0, range.from)}${suggestion}${value.slice(range.to)}`;
}

export function createBodyEditorState(
  value: string,
  extensions: Extension[] = [],
): EditorState {
  return EditorState.create({
    doc: value,
    extensions: [...bodyEditorBaseExtensions, ...extensions],
  });
}

function replaceBodyEditorDocument(view: EditorView, value: string): void {
  const current = view.state.doc.toString();
  if (current === value) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    annotations: externalDocumentSync.of(true),
  });
}

function CodeMirrorBodySource(props: {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
}): ReactElement {
  const { value, onChange, onSelectionChange } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);

  const publishSelection = useCallback((view: EditorView): void => {
    const range = view.state.selection.main;
    onSelectionChangeRef.current?.(
      range.empty ? null : { from: range.from, to: range.to },
    );
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onChange, onSelectionChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: createBodyEditorState(initialValueRef.current, [
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!update.docChanged) return;
          if (
            update.transactions.some(
              (transaction): boolean =>
                transaction.annotation(externalDocumentSync) === true,
            )
          ) {
            return;
          }
          onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!update.selectionSet && !update.docChanged) return;
          publishSelection(update.view);
        }),
        EditorView.domEventHandlers({
          keyup: (_event, view): false => {
            publishSelection(view);
            return false;
          },
          mouseup: (_event, view): false => {
            window.setTimeout(() => publishSelection(view), 0);
            return false;
          },
          touchend: (_event, view): false => {
            window.setTimeout(() => publishSelection(view), 0);
            return false;
          },
        }),
      ]),
    });
    viewRef.current = view;

    return (): void => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [publishSelection]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    replaceBodyEditorDocument(view, value);
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="body-source body-source-cm"
      aria-label="Markdown source"
      data-editor="codemirror6"
    />
  );
}

/**
 * Markdown body editor: CodeMirror 6 edits the literal bytes beside a
 * streamdown preview, behind a Source | Split | Preview segment control.
 */
export const MODEL_ASSIST_TARGET = "model";
const EMPTY_AGENT_TARGETS: AgentTarget[] = [];

type AgentAskMode = "answer" | "rewrite";

export const AGENT_INSTRUCTION_PRESETS: ReadonlyArray<{
  label: string;
  instruction: string;
  mode: AgentAskMode;
}> = [
  { label: "Review", instruction: "Review this selection.", mode: "answer" },
  {
    label: "Fact-check",
    instruction: "Fact-check this selection.",
    mode: "answer",
  },
  {
    label: "Related",
    instruction: "What related context do you know?",
    mode: "answer",
  },
  {
    label: "Rewrite",
    instruction:
      "Rewrite this selection. Return only replacement markdown without commentary.",
    mode: "rewrite",
  },
];

type AssistState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "suggested"; range: SelectionRange; suggestion: string }
  | {
      kind: "agent-answer";
      agentId: string;
      response: string;
      range: SelectionRange;
      replaceSelection: boolean;
    }
  | { kind: "error"; message: string };

export function AgentAnswerPanel(props: {
  agentId: string;
  response: string;
  onReplace?: (() => void) | undefined;
  onDismiss: () => void;
}): ReactElement {
  return (
    <section className="assist-agent-answer" aria-label="Agent answer">
      <div className="assist-answer-copy">
        <strong>Answer from {props.agentId}</strong>
        <Streamdown>{props.response}</Streamdown>
      </div>
      <span className="spacer" />
      {props.onReplace && (
        <button type="button" className="btn" onClick={props.onReplace}>
          Replace selection
        </button>
      )}
      <button type="button" className="btn ghost" onClick={props.onDismiss}>
        Dismiss
      </button>
    </section>
  );
}

export function BodyEditor(props: {
  value: string;
  mode: BodyMode;
  onChange: (value: string) => void;
  onModeChange: (mode: BodyMode) => void;
  assist?: {
    entityType: string;
    frontmatter: Record<string, unknown>;
    agents?: AgentTarget[];
  };
}): ReactElement {
  const { value, mode, onChange, onModeChange, assist } = props;
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [instruction, setInstruction] = useState("");
  const [assistTarget, setAssistTarget] = useState(MODEL_ASSIST_TARGET);
  const [agentAskMode, setAgentAskMode] = useState<AgentAskMode>("answer");
  const [assistState, setAssistState] = useState<AssistState>({ kind: "idle" });
  const agents = assist?.agents ?? EMPTY_AGENT_TARGETS;
  const showSource = mode !== "preview";
  const showPreview = mode !== "source";
  const selectedText = selection
    ? value.slice(selection.from, selection.to)
    : "";

  useEffect(() => {
    if (
      assistTarget !== MODEL_ASSIST_TARGET &&
      !agents.some((agent) => agent.id === assistTarget)
    ) {
      setAssistTarget(MODEL_ASSIST_TARGET);
      setAgentAskMode("answer");
      setAssistState({ kind: "idle" });
    }
  }, [agents, assistTarget]);

  const runAssist = useCallback((): void => {
    if (!assist || !selection || instruction.trim().length === 0) return;
    const range = selection;
    setAssistState({ kind: "loading" });

    const request =
      assistTarget === MODEL_ASSIST_TARGET
        ? requestAssist({
            entityType: assist.entityType,
            instruction,
            selection: selectedText,
            body: value,
            frontmatter: assist.frontmatter,
          }).then(({ suggestion }) => {
            setAssistState({ kind: "suggested", range, suggestion });
          })
        : requestAgentAnswer({
            agent: assistTarget,
            instruction,
            selection: selectedText,
          }).then(({ agentId, response }) => {
            setAssistState({
              kind: "agent-answer",
              agentId,
              response,
              range,
              replaceSelection: agentAskMode === "rewrite",
            });
          });

    request.catch((error: unknown) => {
      setAssistState({ kind: "error", message: errorMessage(error) });
    });
  }, [
    agentAskMode,
    assist,
    assistTarget,
    instruction,
    selectedText,
    selection,
    value,
  ]);

  const acceptSuggestion = useCallback((): void => {
    if (assistState.kind !== "suggested") return;
    try {
      onChange(
        applySuggestionToSelection(
          value,
          assistState.range,
          assistState.suggestion,
        ),
      );
      setAssistState({ kind: "idle" });
    } catch (error: unknown) {
      setAssistState({ kind: "error", message: errorMessage(error) });
    }
  }, [assistState, onChange, value]);

  const replaceWithAgentAnswer = useCallback((): void => {
    if (assistState.kind !== "agent-answer") return;
    try {
      onChange(
        applySuggestionToSelection(
          value,
          assistState.range,
          assistState.response,
        ),
      );
      setAssistState({ kind: "idle" });
    } catch (error: unknown) {
      setAssistState({ kind: "error", message: errorMessage(error) });
    }
  }, [assistState, onChange, value]);

  return (
    <div className="body-editor">
      <header className="body-toolbar">
        <span className="seg body-modes">
          {BODY_MODES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={candidate === mode ? "mode mode-active" : "mode"}
              onClick={() => onModeChange(candidate)}
            >
              {BODY_MODE_LABELS[candidate]}
            </button>
          ))}
        </span>
        <span className="doc-meta">markdown · edits the literal bytes</span>
      </header>
      {assist && showSource && (
        <section className="assist-bar" aria-label="AI selection rewrite">
          {agents.length > 0 && (
            <select
              aria-label="Assist target"
              value={assistTarget}
              onChange={(event) => {
                setAssistTarget(event.currentTarget.value);
                setAgentAskMode("answer");
                setAssistState({ kind: "idle" });
              }}
            >
              <option value={MODEL_ASSIST_TARGET}>Model</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label} — {agent.id}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={instruction}
            placeholder={
              selection
                ? "Instruction for selected text…"
                : assistTarget === MODEL_ASSIST_TARGET
                  ? "Select text to rewrite…"
                  : "Select text to ask about…"
            }
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
          <button
            type="button"
            className="btn assist-run"
            disabled={
              !selection ||
              instruction.trim().length === 0 ||
              assistState.kind === "loading"
            }
            onClick={runAssist}
          >
            {assistState.kind === "loading"
              ? "Thinking…"
              : assistTarget === MODEL_ASSIST_TARGET
                ? "Rewrite selection"
                : "Ask"}
          </button>
          {assistTarget !== MODEL_ASSIST_TARGET && (
            <span className="assist-presets">
              {AGENT_INSTRUCTION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={
                    preset.mode === "rewrite" && agentAskMode === "rewrite"
                      ? "assist-preset assist-preset-active"
                      : "assist-preset"
                  }
                  onClick={() => {
                    setInstruction(preset.instruction);
                    setAgentAskMode(preset.mode);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </span>
          )}
          {selection && (
            <span className="assist-meta">
              {selectedText.length} selected chars
            </span>
          )}
        </section>
      )}
      {assistState.kind === "suggested" && (
        <section className="assist-suggestion">
          <div className="assist-preview">
            <Streamdown>{assistState.suggestion}</Streamdown>
          </div>
          <span className="spacer" />
          <button type="button" className="btn" onClick={acceptSuggestion}>
            Accept
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setAssistState({ kind: "idle" })}
          >
            Discard
          </button>
        </section>
      )}
      {assistState.kind === "agent-answer" && (
        <AgentAnswerPanel
          agentId={assistState.agentId}
          response={assistState.response}
          onReplace={
            assistState.replaceSelection ? replaceWithAgentAnswer : undefined
          }
          onDismiss={() => setAssistState({ kind: "idle" })}
        />
      )}
      {assistState.kind === "error" && (
        <p className="status status-error assist-status">
          {assistState.message}
        </p>
      )}
      <div
        className={
          showSource && showPreview ? "body-panes split" : "body-panes"
        }
      >
        {showSource && (
          <CodeMirrorBodySource
            value={value}
            onChange={onChange}
            onSelectionChange={setSelection}
          />
        )}
        {showPreview && (
          <div className="body-preview">
            <Streamdown>{value}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function TypeSwitcher(props: {
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
}): ReactElement {
  return (
    <nav className="types rail-group">
      <div className="rail-title">Collections</div>
      <ul>
        {props.types.map((info) => (
          <li key={info.entityType}>
            <button
              type="button"
              className={
                info.entityType === props.active ? "type active" : "type"
              }
              onClick={() => props.onSelect(info.entityType)}
            >
              {info.label}
              {info.isSingleton ? (
                <span className="singleton-mark">solo</span>
              ) : (
                <span className="count">{info.count}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  /** noop: the entity service skipped a byte-identical write. */
  | { kind: "saved"; noop?: boolean }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export function SaveStateNotice(props: {
  state: SaveState;
  onReload: () => void;
}): ReactElement | null {
  const { state, onReload } = props;
  if (state.kind === "saved") {
    return state.noop ? (
      <p className="status status-ok">No changes — already saved.</p>
    ) : (
      <p className="status status-ok">Saved through the entity service.</p>
    );
  }
  if (state.kind === "conflict") {
    return (
      <p className="status status-error">
        {state.message}{" "}
        <button type="button" className="reload" onClick={onReload}>
          Reload entry
        </button>
      </p>
    );
  }
  if (state.kind === "error") {
    return <p className="status status-error">{state.message}</p>;
  }
  return null;
}

export type StationState = "pending" | "active" | "done";

export interface PipelineView {
  db: StationState;
  exported: StationState;
  committed: StationState;
  /** Short ref of the latest commit, for the "last write" readout. */
  commitRef: string | null;
}

/**
 * Where the last save stands in the entity db → file export → git commit
 * chain. The entity db station follows the save request itself; the export
 * and commit stations are read off polled git state: a dirty tree means the
 * file landed and the debounced auto-commit is still due, a clean tree with
 * a new commit means the write is fully persisted, and a clean tree with the
 * baseline commit means the export has not become visible yet.
 */
export function derivePipeline(args: {
  save: SaveState;
  git: GitSyncState | null;
  baselineCommit: string | null;
}): PipelineView {
  const { save, git, baselineCommit } = args;
  const commitRef = git?.lastCommit ? git.lastCommit.slice(0, 7) : null;

  if (save.kind === "saving") {
    return {
      db: "active",
      exported: "pending",
      committed: "pending",
      commitRef,
    };
  }
  if (save.kind !== "saved") {
    return {
      db: "pending",
      exported: "pending",
      committed: "pending",
      commitRef,
    };
  }
  if (save.noop) {
    // Nothing was written and no event fired, so no export or commit is
    // coming — but everything already reflects this exact content.
    return { db: "done", exported: "done", committed: "done", commitRef };
  }
  if (!git) {
    // Export is a synchronous subscriber of the entity:updated event; with
    // no git there is nothing further to observe.
    return { db: "done", exported: "done", committed: "pending", commitRef };
  }
  if (git.hasChanges) {
    return { db: "done", exported: "done", committed: "active", commitRef };
  }
  if (git.lastCommit !== baselineCommit) {
    return { db: "done", exported: "done", committed: "done", commitRef };
  }
  return { db: "done", exported: "active", committed: "pending", commitRef };
}

function Station(props: { state: StationState; label: string }): ReactElement {
  const className =
    props.state === "pending" ? "station" : `station ${props.state}`;
  return (
    <span className={className}>
      <span className="dot" />
      {props.label}
    </span>
  );
}

function Track(props: { flowing: boolean }): ReactElement {
  return (
    <span className={props.flowing ? "track flowing" : "track"}>
      <span className="flow" />
    </span>
  );
}

/** The save-pipeline instrument strip: single-writer thesis as UI. */
export function PipelineStations(props: {
  view: PipelineView;
  gitConfigured: boolean;
}): ReactElement {
  const { view, gitConfigured } = props;
  return (
    <span className="stations-wrap">
      <span className="stations">
        <Station state={view.db} label="entity db" />
        <Track flowing={view.db === "done" && view.exported === "active"} />
        <Station state={view.exported} label="exported to file" />
        {gitConfigured ? (
          <>
            <Track
              flowing={view.exported === "done" && view.committed === "active"}
            />
            <Station state={view.committed} label="committed" />
          </>
        ) : (
          <span className="station no-git">no git remote</span>
        )}
      </span>
      {view.commitRef && (
        <span className="commit-ref">
          last write <b>{view.commitRef}</b>
        </span>
      )}
    </span>
  );
}

/**
 * Image-reference widget: uploads go to /cms/api/upload, which promotes the
 * bytes into an `image` entity through the owning plugin's pipeline; the
 * field stores the resulting entity id.
 */
function ImageField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const [uploadState, setUploadState] = useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const current = typeof value === "string" && value.length > 0 ? value : null;

  return (
    <div className="field field-image">
      <span className="field-label">
        {descriptor.label}
        <em className="kind">image entity</em>
      </span>
      {current && (
        <p className="image-ref">
          <code>{current}</code>
          <button type="button" onClick={() => onChange("")}>
            Clear
          </button>
        </p>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          setUploadState({ kind: "uploading" });
          uploadFile(file)
            .then((result) => {
              setUploadState({ kind: "idle" });
              onChange(result.entityId);
            })
            .catch((error: unknown) =>
              setUploadState({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
              }),
            );
        }}
      />
      {uploadState.kind === "uploading" && <p className="status">Uploading…</p>}
      {uploadState.kind === "error" && (
        <p className="status status-error">{uploadState.message}</p>
      )}
    </div>
  );
}

export function Field(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string | boolean) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const required = descriptor.required !== false;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = (
    <span className="field-label">
      {descriptor.label}
      {required ? (
        <em className="req">required</em>
      ) : (
        <em className="kind">{descriptor.widget}</em>
      )}
    </span>
  );

  if (descriptor.widget === "image") {
    return (
      <ImageField descriptor={descriptor} value={value} onChange={onChange} />
    );
  }

  if (descriptor.widget === "boolean") {
    return (
      <label className="field field-inline">
        <span className="field-label">{descriptor.label}</span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </label>
    );
  }

  if (descriptor.widget === "select") {
    return (
      <label className="field">
        {label}
        <select
          value={text}
          required={required}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">—</option>
          {(descriptor.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (descriptor.widget === "text") {
    return (
      <label className="field">
        {label}
        <textarea
          value={text}
          required={required}
          rows={4}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (descriptor.widget === "list" || descriptor.widget === "object") {
    // Structured widgets are read-only in the walking skeleton; the value
    // round-trips untouched because saves only send draft keys.
    return (
      <label className="field">
        <span className="field-label">
          {descriptor.label}
          <em className="kind">read-only</em>
        </span>
        <textarea
          value={JSON.stringify(value ?? null, null, 2)}
          disabled
          rows={4}
        />
      </label>
    );
  }

  return (
    <label className="field">
      {label}
      <input
        type={descriptor.widget === "number" ? "number" : "text"}
        value={text}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

type EditorMode =
  | { kind: "browse" }
  | { kind: "edit"; entity: EntityDetail }
  | { kind: "create" };

type MobileEditorPane = "details" | "write" | "preview";

export function App(): ReactElement {
  const [types, setTypes] = useState<EntityTypeInfo[] | null>(null);
  const [agentTargets, setAgentTargets] = useState<AgentTarget[]>([]);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [schema, setSchema] = useState<TypeSchema | null>(null);
  const [entities, setEntities] = useState<EntitySummary[] | null>(null);
  const [mode, setMode] = useState<EditorMode>({ kind: "browse" });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState<string>("");
  const [bodyMode, setBodyMode] = useState<BodyMode>("split");
  const [mobilePane, setMobilePane] = useState<MobileEditorPane>("details");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [baselineCommit, setBaselineCommit] = useState<string | null>(null);
  const saveStartedAt = useRef(0);
  // Entity id from a console-jump door, opened once its collection loads.
  const pendingDeepLinkId = useRef<string | null>(null);

  const activeType = types?.find((info) => info.entityType === entityType);

  useEffect(() => {
    fetchTypes()
      .then((loaded) => {
        setTypes(loaded);
        // A console-jump door (#/{type}[/{id}]) overrides the default
        // starting collection; the id half is honored once entities load.
        const target = parseCmsHash(window.location.hash);
        const targeted =
          target && loaded.some((info) => info.entityType === target.entityType)
            ? target
            : null;
        if (targeted?.id !== undefined) {
          pendingDeepLinkId.current = targeted.id;
        }
        const first = loaded.find((info) => !info.isSingleton) ?? loaded[0];
        setEntityType(
          targeted ? targeted.entityType : first ? first.entityType : null,
        );
      })
      .catch((error: unknown) => setLoadError(errorMessage(error)));
    // No directory-sync installed → null, and the pipeline strip stays off.
    fetchAgentTargets()
      .then(setAgentTargets)
      .catch(() => setAgentTargets([]));
    fetchSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, []);

  // After a save, poll the pipeline until the auto-commit lands. Every poll
  // updates syncStatus, which re-runs this effect until the view settles or
  // the save is 20s old (a byte-identical save never produces a new commit).
  useEffect(() => {
    if (saveState.kind !== "saved" || !syncStatus?.git) return undefined;
    const view = derivePipeline({
      save: saveState,
      git: syncStatus.git,
      baselineCommit,
    });
    if (view.committed === "done") return undefined;
    if (Date.now() - saveStartedAt.current > 20_000) return undefined;
    const timer = window.setTimeout(() => {
      fetchSyncStatus()
        .then(setSyncStatus)
        .catch(() => {});
    }, 900);
    return (): void => window.clearTimeout(timer);
  }, [saveState, syncStatus, baselineCommit]);

  useEffect(() => {
    if (!entityType) return;
    setMode({ kind: "browse" });
    setMobilePane("details");
    setSaveState({ kind: "idle" });
    setEntities(null);
    setSchema(null);
    Promise.all([fetchSchema(entityType), fetchEntities(entityType)])
      .then(([loadedSchema, loadedEntities]) => {
        setSchema(loadedSchema);
        setEntities(loadedEntities);
        const deepLinkId = pendingDeepLinkId.current;
        if (deepLinkId !== null) {
          pendingDeepLinkId.current = null;
          if (loadedEntities.some((entry) => entry.id === deepLinkId)) {
            return fetchEntity(entityType, deepLinkId).then((entity) => {
              setMode({ kind: "edit", entity });
              setDraft(entity.frontmatter);
              setBody(entity.body);
            });
          }
        }
        // Singletons skip the list: open the record, or start creating it.
        if (loadedSchema.isSingleton) {
          const record = loadedEntities[0];
          if (record) {
            return fetchEntity(entityType, record.id).then((entity) => {
              setMode({ kind: "edit", entity });
              setDraft(entity.frontmatter);
              setBody(entity.body);
            });
          }
          setMode({ kind: "create" });
          setDraft(emptyDraft(loadedSchema.fields));
          setBody("");
        }
        return undefined;
      })
      .catch((error: unknown) => setLoadError(errorMessage(error)));
  }, [entityType]);

  const openEntity = useCallback(
    (id: string, nextState: SaveState = { kind: "idle" }): void => {
      if (!entityType) return;
      fetchEntity(entityType, id)
        .then((entity) => {
          setMode({ kind: "edit", entity });
          setDraft(entity.frontmatter);
          setBody(entity.body);
          setSaveState(nextState);
        })
        .catch((error: unknown) => setLoadError(errorMessage(error)));
    },
    [entityType],
  );

  const startCreate = useCallback((): void => {
    if (!schema) return;
    setSaveState({ kind: "idle" });
    setMode({ kind: "create" });
    setDraft(emptyDraft(schema.fields));
    setBody("");
  }, [schema]);

  const backToList = useCallback((): void => {
    setMode({ kind: "browse" });
    setSaveState({ kind: "idle" });
  }, []);

  const save = useCallback((): void => {
    if (!entityType || mode.kind === "browse" || !schema) return;
    saveStartedAt.current = Date.now();
    setBaselineCommit(syncStatus?.git?.lastCommit ?? null);
    setSaveState({ kind: "saving" });
    const bodyPayload = schema.hasBody ? { body } : {};
    const write =
      mode.kind === "create"
        ? createEntity({ entityType, frontmatter: draft, ...bodyPayload })
        : updateEntity({
            entityType,
            id: mode.entity.id,
            frontmatter: draft,
            baseContentHash: mode.entity.contentHash,
            ...bodyPayload,
          });
    write
      .then(async (result) => {
        setEntities(await fetchEntities(entityType));
        const noop = "skipped" in result && result.skipped === true;
        // Re-fetch after every save so the next edit carries a fresh
        // contentHash precondition.
        openEntity(result.entityId, { kind: "saved", noop });
      })
      .catch((error: unknown) =>
        setSaveState(
          error instanceof ApiError && error.status === 409
            ? { kind: "conflict", message: errorMessage(error) }
            : { kind: "error", message: errorMessage(error) },
        ),
      );
  }, [entityType, mode, draft, body, schema, openEntity, syncStatus]);

  const remove = useCallback((): void => {
    if (!entityType || mode.kind !== "edit") return;
    const { id } = mode.entity;
    // Recoverable downstream: the delete is exported and committed, so the
    // file remains in git history.
    if (!window.confirm(`Delete ${id}? The exported file is removed too.`)) {
      return;
    }
    deleteEntity(entityType, id)
      .then(async () => {
        setMode({ kind: "browse" });
        setEntities(await fetchEntities(entityType));
      })
      .catch((error: unknown) =>
        setSaveState({ kind: "error", message: errorMessage(error) }),
      );
  }, [entityType, mode]);

  if (loadError) {
    return (
      <div className="studio">
        <style>{`${styles}\n${responsiveStyles}`}</style>
        <p className="status status-error boot-status">{loadError}</p>
      </div>
    );
  }
  if (!types || (entityType && (!schema || !entities))) {
    return (
      <div className="studio">
        <style>{`${styles}\n${responsiveStyles}`}</style>
        <p className="status boot-status">Loading…</p>
      </div>
    );
  }
  if (!entityType || !schema) {
    return (
      <div className="studio">
        <style>{`${styles}\n${responsiveStyles}`}</style>
        <p className="status boot-status">
          No editable entity types are registered.
        </p>
      </div>
    );
  }

  const editing = mode.kind !== "browse";
  const heading =
    mode.kind === "edit"
      ? entityTitle(mode.entity)
      : mode.kind === "create"
        ? `New ${activeType?.label ?? entityType}`
        : (activeType?.label ?? entityType);

  return (
    <div className="studio">
      <style>{`${styles}\n${responsiveStyles}`}</style>
      <header className="crumbbar">
        <span className="crumb-mark">
          content <b>studio</b>
        </span>
        <span className="crumb">
          {activeType?.label ?? entityType}
          {editing && (
            <>
              {" / "}
              <strong>{heading}</strong>
            </>
          )}
        </span>
        <span className="spacer" />
      </header>
      <div className="studio-body">
        <aside className="rail">
          <TypeSwitcher
            types={types}
            active={entityType}
            onSelect={setEntityType}
          />
        </aside>
        {!editing ? (
          <main className="listing">
            <div className="listing-head">
              <h3>{activeType?.label ?? entityType}</h3>
              <span className="meta">
                {entities?.length ?? 0}{" "}
                {entities?.length === 1 ? "entry" : "entries"}
              </span>
              <button type="button" className="btn" onClick={startCreate}>
                New entry
              </button>
            </div>
            {(entities ?? []).map((entity, index) => (
              <button
                type="button"
                key={entity.id}
                className="row"
                onClick={() => openEntity(entity.id)}
              >
                <span className="idx">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="title">
                  {entityTitle(entity)}
                  <small>{entity.id}</small>
                </span>
                <span className="updated">{formatUpdated(entity.updated)}</span>
              </button>
            ))}
            {entities?.length === 0 && (
              <p className="status listing-empty">
                Nothing here yet — start the first entry.
              </p>
            )}
          </main>
        ) : (
          <form
            className="editor"
            data-mobile-pane={mobilePane}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <nav className="cms-mobile-modes" aria-label="Editor view">
              {(["details", "write", "preview"] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  className={
                    pane === mobilePane
                      ? "cms-mobile-mode is-active"
                      : "cms-mobile-mode"
                  }
                  disabled={pane !== "details" && !schema.hasBody}
                  onClick={() => {
                    setMobilePane(pane);
                    if (pane === "write") setBodyMode("source");
                    if (pane === "preview") setBodyMode("preview");
                  }}
                >
                  {pane}
                </button>
              ))}
            </nav>
            <aside className="colophon">
              <div className="form-title">
                <span>Colophon</span>
                <span>{schema.format === "raw" ? "raw" : "frontmatter"}</span>
              </div>
              {!schema.isSingleton && (
                <button type="button" className="backlink" onClick={backToList}>
                  ← All {activeType?.label ?? entityType}
                </button>
              )}
              {schema.fields.map((descriptor) => (
                <Field
                  key={descriptor.name}
                  descriptor={descriptor}
                  value={draft[descriptor.name]}
                  onChange={(raw) =>
                    setDraft((current) =>
                      applyFieldChange(current, descriptor, raw),
                    )
                  }
                />
              ))}
              {schema.fields.length === 0 && (
                <p className="status">
                  This type is raw markdown — the whole document is the body.
                </p>
              )}
            </aside>
            <section className="manuscript">
              {schema.hasBody ? (
                <BodyEditor
                  value={body}
                  mode={bodyMode}
                  onChange={setBody}
                  onModeChange={setBodyMode}
                  assist={{
                    entityType,
                    frontmatter: draft,
                    agents: agentTargets,
                  }}
                />
              ) : (
                <p className="status manuscript-empty">
                  This type has no body — its fields are the whole record.
                </p>
              )}
            </section>
            <footer className="pipeline">
              <button
                type="submit"
                className="save-btn"
                disabled={saveState.kind === "saving"}
              >
                {saveState.kind === "saving" ? "Saving…" : "Save"}
              </button>
              {syncStatus?.directorySync && (
                <PipelineStations
                  view={derivePipeline({
                    save: saveState,
                    git: syncStatus.git,
                    baselineCommit,
                  })}
                  gitConfigured={syncStatus.git !== null}
                />
              )}
              <SaveStateNotice
                // The strip already narrates a successful save; the text
                // notice stays for conflicts, errors, and no-op saves
                // (which the strip cannot distinguish from a real write).
                state={
                  syncStatus?.directorySync &&
                  saveState.kind === "saved" &&
                  !saveState.noop
                    ? { kind: "idle" }
                    : saveState
                }
                onReload={() => {
                  if (mode.kind === "edit") openEntity(mode.entity.id);
                }}
              />
              <span className="spacer" />
              {mode.kind === "edit" && !schema.isSingleton && (
                <button type="button" className="btn danger" onClick={remove}>
                  Delete
                </button>
              )}
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.issues.length > 0) {
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

const styles = `
  .studio { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .boot-status { padding: 48px; }
  .spacer { flex: 1; }

  /* ── crumb bar — surface-local wayfinding below the console strip ── */
  .crumbbar { display: flex; align-items: center; gap: 18px; padding: 0 20px; height: 40px; border-bottom: 1px solid var(--console-rule-strong); background: linear-gradient(to bottom, color-mix(in srgb, var(--console-text) 4%, transparent), transparent), var(--console-frame); }
  .crumb-mark { font-family: var(--console-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--console-text-muted); white-space: nowrap; }
  .crumb-mark b { color: var(--console-text-dim); font-weight: 500; }
  .crumb { font-size: 13px; color: var(--console-text-dim); }
  .crumb strong { color: var(--console-text); font-weight: 500; }

  /* ── frame ── */
  .studio-body { flex: 1; display: grid; grid-template-columns: 232px 1fr; align-items: stretch; }

  /* ── rail ── */
  .rail { border-right: 1px solid var(--console-rule-strong); padding: 22px 0 26px; background: linear-gradient(to right, transparent 60%, color-mix(in srgb, var(--console-text) 2.5%, transparent)), var(--console-card-soft); }
  .rail-title { font-family: var(--console-mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--console-text-muted); padding: 0 20px 8px; }
  .rail ul { list-style: none; }
  .rail .type { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 6px 20px; border: 0; border-left: 2px solid transparent; background: none; text-align: left; color: var(--console-text-dim); font-family: var(--console-ui); font-size: 13.5px; cursor: pointer; transition: background .12s ease; }
  .rail .type:hover { background: var(--console-rule); color: var(--console-text); }
  .rail .type.active { color: var(--console-text); font-weight: 500; border-left-color: var(--console-accent); background: var(--console-card); }
  .rail .count { margin-left: auto; font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); }
  .rail .singleton-mark { margin-left: auto; font-family: var(--console-mono); font-size: 10px; letter-spacing: 0.08em; color: var(--console-warn); }

  /* ── listing ── */
  .listing { padding: 26px 30px 34px; }
  .listing-head { display: flex; align-items: flex-end; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid var(--console-text); }
  .listing-head h3 { font-family: var(--console-display); font-variation-settings: "SOFT" 70, "opsz" 60; font-weight: 580; font-size: 34px; line-height: 1; letter-spacing: -0.01em; }
  .listing-head .meta { font-family: var(--console-mono); font-size: 11.5px; color: var(--console-text-muted); padding-bottom: 5px; }
  .listing-head .btn { margin-left: auto; margin-bottom: 2px; }
  .listing-empty { padding: 22px 4px; }
  .row { display: grid; grid-template-columns: 44px 1fr 150px; gap: 18px; align-items: baseline; width: 100%; padding: 15px 4px 14px; border: 0; border-bottom: 1px solid var(--console-rule-strong); background: none; text-align: left; cursor: pointer; transition: background .12s ease; font-family: var(--console-ui); }
  .row:hover { background: var(--console-rule); }
  .row .idx { font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); }
  .row .title { font-family: var(--console-display); font-variation-settings: "SOFT" 50, "opsz" 30; font-weight: 520; font-size: 17.5px; letter-spacing: -0.005em; color: var(--console-text); }
  .row:hover .title { color: var(--console-accent-dim); }
  .row .title small { display: block; font-family: var(--console-mono); font-size: 11px; font-weight: 400; color: var(--console-text-muted); margin-top: 3px; letter-spacing: 0; }
  .row .updated { font-size: 12.5px; color: var(--console-text-dim); }

  /* ── buttons ── */
  .btn { font-family: var(--console-ui); font-size: 13px; font-weight: 500; border: 1px solid var(--console-text); background: var(--console-text); color: var(--console-frame); border-radius: 7px; padding: 8px 16px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--console-text) 50%, transparent); }
  .btn.danger { background: transparent; color: var(--console-accent-dim); border-color: color-mix(in srgb, var(--console-accent) 40%, transparent); }
  .btn.danger:hover { background: rgba(196,74,29,0.07); box-shadow: none; transform: none; }
  .btn.ghost { background: transparent; color: var(--console-text-dim); border-color: var(--console-rule-strong); }
  .btn.ghost:hover { background: var(--console-rule); box-shadow: none; transform: none; }

  /* ── editor ── */
  .editor { display: grid; grid-template-columns: 330px 1fr; grid-template-rows: 1fr auto; min-height: 0; }
  .colophon { border-right: 1px solid var(--console-rule-strong); background: var(--console-card-soft); padding: 26px 26px 60px; }
  .form-title { font-family: var(--console-mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--console-text-muted); display: flex; justify-content: space-between; padding-bottom: 18px; }
  .form-title span:last-child { color: var(--console-accent); }
  .backlink { display: block; width: 100%; border: 0; background: none; text-align: left; font-family: var(--console-mono); font-size: 11.5px; color: var(--console-text-dim); padding: 0 0 14px; cursor: pointer; }
  .backlink:hover { color: var(--console-accent-dim); }

  /* ── fields ── */
  .field { display: block; padding: 14px 0 16px; border-top: 1px solid var(--console-rule-strong); }
  .field-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; color: var(--console-text-dim); margin-bottom: 7px; }
  .field-label .req, .field-label em.req { font-family: var(--console-mono); font-style: normal; font-size: 10px; color: var(--console-accent); }
  .field-label .kind, .field-label em.kind { font-family: var(--console-mono); font-style: normal; font-size: 10px; color: var(--console-text-muted); font-weight: 400; }
  .field input[type="text"], .field input[type="number"], .field select, .field textarea { width: 100%; font-family: var(--console-ui); font-size: 14px; color: var(--console-text); background: var(--console-card); border: 1px solid var(--console-rule-strong); border-radius: 6px; padding: 8px 11px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
  .field textarea { resize: vertical; line-height: 1.5; }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--console-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--console-accent) 13%, transparent); }
  .field textarea[disabled] { font-family: var(--console-mono); font-size: 11.5px; color: var(--console-text-muted); }
  .field-inline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .field-inline .field-label { margin-bottom: 0; }
  .field-inline input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--console-ok); }
  .field-image .image-ref { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
  .field-image .image-ref code { font-family: var(--console-mono); font-size: 11px; background: var(--console-card); border: 1px solid var(--console-rule-strong); padding: 3px 8px; border-radius: 4px; overflow-wrap: anywhere; }
  .field-image .image-ref button { font-family: var(--console-ui); font-size: 12px; border: 1px solid var(--console-rule-strong); background: none; color: var(--console-text-dim); border-radius: 5px; padding: 3px 9px; cursor: pointer; }
  .field-image .image-ref button:hover { color: var(--console-accent-dim); border-color: color-mix(in srgb, var(--console-accent) 40%, transparent); }
  .field-image input[type="file"] { width: 100%; font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); border: 1px dashed var(--console-rule-strong); border-radius: 8px; background: var(--console-card); padding: 12px 11px; }

  /* ── manuscript / body editor ── */
  .manuscript { display: flex; flex-direction: column; min-width: 0; }
  .manuscript-empty { padding: 30px 34px; }
  .body-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .body-toolbar { display: flex; align-items: center; gap: 4px; padding: 12px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .doc-meta { margin-left: auto; font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); }
  .assist-bar { display: flex; align-items: center; gap: 10px; padding: 10px 26px; border-bottom: 1px solid var(--console-rule-strong); background: var(--console-rule); }
  .assist-bar input, .assist-bar select { font-family: var(--console-ui); font-size: 13px; color: var(--console-text); background: var(--console-card); border: 1px solid var(--console-rule-strong); border-radius: 7px; padding: 8px 11px; outline: none; }
  .assist-bar input { flex: 1; min-width: 180px; }
  .assist-bar select { max-width: 220px; }
  .assist-bar input:focus, .assist-bar select:focus { border-color: var(--console-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--console-accent) 13%, transparent); }
  .assist-run { padding: 8px 14px; white-space: nowrap; }
  .assist-run[disabled] { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  .assist-presets { display: inline-flex; gap: 4px; }
  .assist-preset { border: 1px solid var(--console-rule-strong); border-radius: 999px; padding: 4px 8px; background: var(--console-card); color: var(--console-text-dim); font-family: var(--console-mono); font-size: 9px; cursor: pointer; }
  .assist-preset:hover, .assist-preset-active { border-color: var(--console-accent); color: var(--console-accent-dim); background: var(--console-accent-soft); }
  .assist-meta { font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); white-space: nowrap; }
  .assist-suggestion, .assist-agent-answer { display: flex; align-items: center; gap: 12px; padding: 12px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .assist-suggestion { background: var(--console-ok-soft); }
  .assist-agent-answer { background: var(--console-accent-soft); }
  .assist-preview, .assist-answer-copy { max-height: 150px; overflow: auto; font-size: 13px; color: var(--console-text); }
  .assist-answer-copy > strong { display: block; margin-bottom: 6px; font-family: var(--console-mono); font-size: 10px; letter-spacing: .04em; color: var(--console-accent-dim); }
  .assist-preview p, .assist-answer-copy p { margin-bottom: 6px; }
  .assist-status { padding: 8px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .seg { display: inline-flex; border: 1px solid var(--console-rule-strong); border-radius: 7px; overflow: hidden; background: var(--console-card); }
  .seg .mode { font-family: var(--console-mono); font-size: 11.5px; letter-spacing: 0.04em; border: none; background: transparent; color: var(--console-text-muted); padding: 6px 14px; cursor: pointer; }
  .seg .mode-active { background: var(--console-text); color: var(--console-frame); }
  .body-panes { display: grid; flex: 1; min-height: 420px; }
  .body-panes.split { grid-template-columns: 1fr 1fr; }
  .body-source { color: var(--console-text); background: none; border-right: 1px solid var(--console-rule-strong); min-height: 420px; min-width: 0; }
  .body-panes:not(.split) .body-source { border-right: 0; }
  .body-source .cm-editor { height: 100%; min-height: 420px; background: transparent; color: var(--console-text); }
  .body-source .cm-editor.cm-focused { outline: none; }
  .body-source .cm-scroller { font-family: var(--console-mono); font-size: 13px; line-height: 1.75; }
  .body-source .cm-content { padding: 30px 34px; caret-color: var(--console-accent); }
  .body-source .cm-line { padding: 0; }
  .body-source .cm-selectionBackground, .body-source .cm-focused .cm-selectionBackground { background: rgba(196, 74, 29, 0.22); }
  .body-preview { padding: 30px 34px; overflow-wrap: anywhere; }
  .body-preview h1, .body-preview h2, .body-preview h3 { font-family: var(--console-display); font-variation-settings: "SOFT" 70, "opsz" 90; font-weight: 580; letter-spacing: -0.01em; line-height: 1.12; margin: 0 0 18px; }
  .body-preview h1 { font-size: 30px; }
  .body-preview h2 { font-size: 23px; margin-top: 26px; }
  .body-preview h3 { font-size: 18px; margin-top: 22px; }
  .body-preview p { font-size: 15px; line-height: 1.72; color: var(--console-text); margin-bottom: 14px; max-width: 62ch; }
  .body-preview p em { font-family: var(--console-display); font-style: italic; }
  .body-preview blockquote { border-left: 2px solid var(--console-accent); padding: 2px 0 2px 18px; margin: 18px 0; color: var(--console-text-dim); font-family: var(--console-display); font-style: italic; font-size: 16.5px; }
  .body-preview ul, .body-preview ol { padding-left: 22px; margin-bottom: 14px; }
  .body-preview li { font-size: 15px; line-height: 1.72; }
  .body-preview code { font-family: var(--console-mono); font-size: 12.5px; background: color-mix(in srgb, var(--console-text) 6%, transparent); padding: 1px 5px; border-radius: 4px; }
  .body-preview pre { background: var(--console-text); color: var(--console-frame); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; overflow-x: auto; }
  .body-preview pre code { background: none; color: inherit; }

  /* ── pipeline (action bar) ── */
  .pipeline { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; border-top: 2px solid var(--console-text); background: var(--console-text); color: var(--console-frame); padding: 0 20px; min-height: 58px; }
  .save-btn { font-family: var(--console-ui); font-weight: 600; font-size: 13.5px; background: var(--console-accent); color: var(--console-on-accent); border: none; border-radius: 7px; padding: 9px 22px; cursor: pointer; transition: transform .12s ease, background .15s ease; }
  .save-btn:hover { background: var(--console-accent-dim); transform: translateY(-1px); }
  .save-btn[disabled] { opacity: .6; transform: none; }
  .pipeline .btn.danger { border-color: color-mix(in srgb, var(--console-bg) 30%, transparent); color: color-mix(in srgb, var(--console-bg) 75%, transparent); }
  .pipeline .btn.danger:hover { background: color-mix(in srgb, var(--console-err) 25%, transparent); color: var(--console-frame); }
  .pipeline .status { font-family: var(--console-mono); font-size: 11.5px; }
  .pipeline .status-ok { color: color-mix(in srgb, var(--console-ok) 75%, var(--console-frame)); }
  .pipeline .status-error { color: color-mix(in srgb, var(--console-err) 70%, var(--console-frame)); }
  .pipeline .reload { font-family: var(--console-ui); font-size: 12px; border: 1px solid color-mix(in srgb, var(--console-bg) 40%, transparent); background: none; color: var(--console-frame); border-radius: 5px; padding: 3px 10px; cursor: pointer; margin-left: 6px; }
  .pipeline .reload:hover { border-color: var(--console-frame); }

  /* ── instrument strip: entity db → exported to file → committed ── */
  .stations-wrap { display: flex; align-items: center; min-width: 0; }
  .stations { display: flex; align-items: center; margin-left: 14px; }
  .station { display: inline-flex; align-items: center; gap: 9px; font-family: var(--console-mono); font-size: 11px; letter-spacing: 0.06em; color: color-mix(in srgb, var(--console-bg) 45%, transparent); white-space: nowrap; }
  .station .dot { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--console-bg) 35%, transparent); transition: all .2s ease; }
  .station.done { color: color-mix(in srgb, var(--console-bg) 95%, transparent); }
  .station.done .dot { background: var(--console-ok); border-color: var(--console-ok); box-shadow: 0 0 10px color-mix(in srgb, var(--console-ok) 70%, transparent); }
  .station.active { color: var(--console-frame); }
  .station.active .dot { border-color: var(--console-warn); background: var(--console-warn); animation: console-pulse 1.2s ease-in-out infinite; }
  .station.no-git { font-style: italic; margin-left: 28px; }
  .track { height: 1px; width: 64px; background: color-mix(in srgb, var(--console-bg) 22%, transparent); margin: 0 14px; position: relative; overflow: hidden; display: inline-block; }
  .track .flow { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--console-ok) 50%, transparent); transform: translateX(-100%); }
  .track.flowing .flow { animation: flow 0.9s ease-in-out infinite; }
  @keyframes flow { to { transform: translateX(100%); } }
  .commit-ref { font-family: var(--console-mono); font-size: 11px; color: color-mix(in srgb, var(--console-bg) 55%, transparent); margin-left: 22px; white-space: nowrap; }
  .commit-ref b { color: var(--console-frame); font-weight: 500; }

  /* ── status ── */
  .status { color: var(--console-text-dim); font-size: 13px; }
  .status-error { color: var(--console-accent-dim); }
  .status-ok { color: var(--console-ok); }
`;
