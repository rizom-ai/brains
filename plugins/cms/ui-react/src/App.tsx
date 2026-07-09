import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Streamdown } from "streamdown";
import {
  ApiError,
  createEntity,
  deleteEntity,
  fetchEntities,
  fetchEntity,
  fetchSchema,
  fetchSyncStatus,
  fetchTypes,
  updateEntity,
  uploadFile,
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

/**
 * Floor-tier Markdown body editor: a plain textarea (perfect round-trip —
 * you edit the literal bytes) beside a streamdown preview, behind a
 * Source | Split | Preview segment control. The CodeMirror upgrade (plan
 * D1) slots into the source pane without layout change.
 */
export function BodyEditor(props: {
  value: string;
  mode: BodyMode;
  onChange: (value: string) => void;
  onModeChange: (mode: BodyMode) => void;
}): ReactElement {
  const { value, mode, onChange, onModeChange } = props;
  const showSource = mode !== "preview";
  const showPreview = mode !== "source";

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
      <div
        className={
          showSource && showPreview ? "body-panes split" : "body-panes"
        }
      >
        {showSource && (
          <textarea
            className="body-source"
            value={value}
            spellCheck={false}
            onChange={(event) => onChange(event.currentTarget.value)}
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
  | { kind: "saved" }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export function SaveStateNotice(props: {
  state: SaveState;
  onReload: () => void;
}): ReactElement | null {
  const { state, onReload } = props;
  if (state.kind === "saved") {
    return (
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

export function App(): ReactElement {
  const [types, setTypes] = useState<EntityTypeInfo[] | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [schema, setSchema] = useState<TypeSchema | null>(null);
  const [entities, setEntities] = useState<EntitySummary[] | null>(null);
  const [mode, setMode] = useState<EditorMode>({ kind: "browse" });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState<string>("");
  const [bodyMode, setBodyMode] = useState<BodyMode>("split");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [baselineCommit, setBaselineCommit] = useState<string | null>(null);
  const saveStartedAt = useRef(0);

  const activeType = types?.find((info) => info.entityType === entityType);

  useEffect(() => {
    fetchTypes()
      .then((loaded) => {
        setTypes(loaded);
        const first = loaded.find((info) => !info.isSingleton) ?? loaded[0];
        setEntityType(first ? first.entityType : null);
      })
      .catch((error: unknown) => setLoadError(errorMessage(error)));
    // No directory-sync installed → null, and the pipeline strip stays off.
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
    setSaveState({ kind: "idle" });
    setEntities(null);
    setSchema(null);
    Promise.all([fetchSchema(entityType), fetchEntities(entityType)])
      .then(([loadedSchema, loadedEntities]) => {
        setSchema(loadedSchema);
        setEntities(loadedEntities);
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
        // Re-fetch after every save so the next edit carries a fresh
        // contentHash precondition.
        openEntity(result.entityId, { kind: "saved" });
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
        <style>{styles}</style>
        <p className="status status-error boot-status">{loadError}</p>
      </div>
    );
  }
  if (!types || (entityType && (!schema || !entities))) {
    return (
      <div className="studio">
        <style>{styles}</style>
        <p className="status boot-status">Loading…</p>
      </div>
    );
  }
  if (!entityType || !schema) {
    return (
      <div className="studio">
        <style>{styles}</style>
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
      <style>{styles}</style>
      <header className="appbar">
        <span className="brandmark">
          <span className="pulse" />
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
        <span className="session-chip">operator session</span>
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
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
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
                // notice stays for conflicts and errors.
                state={
                  syncStatus?.directorySync && saveState.kind === "saved"
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
  .studio { display: flex; flex-direction: column; min-height: 100vh; }
  .boot-status { padding: 48px; }
  .spacer { flex: 1; }

  /* ── appbar ── */
  .appbar { display: flex; align-items: center; gap: 18px; padding: 0 20px; height: 52px; border-bottom: var(--hairline); background: linear-gradient(to bottom, rgba(255,255,255,0.5), transparent); }
  .brandmark { display: flex; align-items: center; gap: 9px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-60); white-space: nowrap; }
  .brandmark b { color: var(--ink); font-weight: 500; }
  .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--vermilion); animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(196,74,29,0.45); } 55% { box-shadow: 0 0 0 6px rgba(196,74,29,0); } }
  .crumb { font-size: 13px; color: var(--ink-60); }
  .crumb strong { color: var(--ink); font-weight: 500; }
  .session-chip { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; color: var(--verdigris); background: var(--verdigris-soft); border-radius: 99px; padding: 5px 12px; white-space: nowrap; }
  .session-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--verdigris); }

  /* ── frame ── */
  .studio-body { flex: 1; display: grid; grid-template-columns: 232px 1fr; align-items: stretch; }

  /* ── rail ── */
  .rail { border-right: var(--hairline); padding: 22px 0 26px; background: linear-gradient(to right, transparent 60%, rgba(33,29,24,0.025)), var(--paper-deep); }
  .rail-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-40); padding: 0 20px 8px; }
  .rail ul { list-style: none; }
  .rail .type { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 6px 20px; border: 0; border-left: 2px solid transparent; background: none; text-align: left; color: var(--ink-60); font-family: var(--ui); font-size: 13.5px; cursor: pointer; transition: background .12s ease; }
  .rail .type:hover { background: rgba(255,255,255,0.55); color: var(--ink); }
  .rail .type.active { color: var(--ink); font-weight: 500; border-left-color: var(--vermilion); background: rgba(255,255,255,0.75); }
  .rail .count { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-40); }
  .rail .singleton-mark { margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--amber); }

  /* ── listing ── */
  .listing { padding: 26px 30px 34px; }
  .listing-head { display: flex; align-items: flex-end; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
  .listing-head h3 { font-family: var(--display); font-variation-settings: "SOFT" 70, "opsz" 60; font-weight: 580; font-size: 34px; line-height: 1; letter-spacing: -0.01em; }
  .listing-head .meta { font-family: var(--mono); font-size: 11.5px; color: var(--ink-40); padding-bottom: 5px; }
  .listing-head .btn { margin-left: auto; margin-bottom: 2px; }
  .listing-empty { padding: 22px 4px; }
  .row { display: grid; grid-template-columns: 44px 1fr 150px; gap: 18px; align-items: baseline; width: 100%; padding: 15px 4px 14px; border: 0; border-bottom: var(--hairline); background: none; text-align: left; cursor: pointer; transition: background .12s ease; font-family: var(--ui); }
  .row:hover { background: rgba(255,255,255,0.65); }
  .row .idx { font-family: var(--mono); font-size: 11px; color: var(--ink-40); }
  .row .title { font-family: var(--display); font-variation-settings: "SOFT" 50, "opsz" 30; font-weight: 520; font-size: 17.5px; letter-spacing: -0.005em; color: var(--ink); }
  .row:hover .title { color: var(--vermilion-deep); }
  .row .title small { display: block; font-family: var(--mono); font-size: 11px; font-weight: 400; color: var(--ink-40); margin-top: 3px; letter-spacing: 0; }
  .row .updated { font-size: 12.5px; color: var(--ink-60); }

  /* ── buttons ── */
  .btn { font-family: var(--ui); font-size: 13px; font-weight: 500; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); border-radius: 7px; padding: 8px 16px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 10px -4px rgba(33,29,24,0.5); }
  .btn.danger { background: transparent; color: var(--vermilion-deep); border-color: rgba(196,74,29,0.4); }
  .btn.danger:hover { background: rgba(196,74,29,0.07); box-shadow: none; transform: none; }

  /* ── editor ── */
  .editor { display: grid; grid-template-columns: 330px 1fr; grid-template-rows: 1fr auto; min-height: 0; }
  .colophon { border-right: var(--hairline); background: var(--paper-deep); padding: 26px 26px 60px; }
  .form-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-40); display: flex; justify-content: space-between; padding-bottom: 18px; }
  .form-title span:last-child { color: var(--vermilion); }
  .backlink { display: block; width: 100%; border: 0; background: none; text-align: left; font-family: var(--mono); font-size: 11.5px; color: var(--ink-60); padding: 0 0 14px; cursor: pointer; }
  .backlink:hover { color: var(--vermilion-deep); }

  /* ── fields ── */
  .field { display: block; padding: 14px 0 16px; border-top: var(--hairline); }
  .field-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; color: var(--ink-60); margin-bottom: 7px; }
  .field-label .req, .field-label em.req { font-family: var(--mono); font-style: normal; font-size: 10px; color: var(--vermilion); }
  .field-label .kind, .field-label em.kind { font-family: var(--mono); font-style: normal; font-size: 10px; color: var(--ink-40); font-weight: 400; }
  .field input[type="text"], .field input[type="number"], .field select, .field textarea { width: 100%; font-family: var(--ui); font-size: 14px; color: var(--ink); background: rgba(255,255,255,0.72); border: 1px solid var(--ink-15); border-radius: 6px; padding: 8px 11px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
  .field textarea { resize: vertical; line-height: 1.5; }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--vermilion); box-shadow: 0 0 0 3px rgba(196,74,29,0.13); }
  .field textarea[disabled] { font-family: var(--mono); font-size: 11.5px; color: var(--ink-40); }
  .field-inline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .field-inline .field-label { margin-bottom: 0; }
  .field-inline input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--verdigris); }
  .field-image .image-ref { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
  .field-image .image-ref code { font-family: var(--mono); font-size: 11px; background: rgba(255,255,255,0.8); border: 1px solid var(--ink-15); padding: 3px 8px; border-radius: 4px; overflow-wrap: anywhere; }
  .field-image .image-ref button { font-family: var(--ui); font-size: 12px; border: 1px solid var(--ink-15); background: none; color: var(--ink-60); border-radius: 5px; padding: 3px 9px; cursor: pointer; }
  .field-image .image-ref button:hover { color: var(--vermilion-deep); border-color: rgba(196,74,29,0.4); }
  .field-image input[type="file"] { width: 100%; font-family: var(--mono); font-size: 11px; color: var(--ink-40); border: 1px dashed var(--ink-15); border-radius: 8px; background: rgba(255,255,255,0.5); padding: 12px 11px; }

  /* ── manuscript / body editor ── */
  .manuscript { display: flex; flex-direction: column; min-width: 0; }
  .manuscript-empty { padding: 30px 34px; }
  .body-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .body-toolbar { display: flex; align-items: center; gap: 4px; padding: 12px 26px; border-bottom: var(--hairline); }
  .doc-meta { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-40); }
  .seg { display: inline-flex; border: var(--hairline); border-radius: 7px; overflow: hidden; background: rgba(255,255,255,0.5); }
  .seg .mode { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.04em; border: none; background: transparent; color: var(--ink-40); padding: 6px 14px; cursor: pointer; }
  .seg .mode-active { background: var(--ink); color: var(--paper); }
  .body-panes { display: grid; flex: 1; min-height: 420px; }
  .body-panes.split { grid-template-columns: 1fr 1fr; }
  .body-source { font-family: var(--mono); font-size: 13px; line-height: 1.75; color: var(--ink); background: none; border: 0; border-right: var(--hairline); outline: none; padding: 30px 34px; resize: none; min-height: 420px; }
  .body-panes:not(.split) .body-source { border-right: 0; }
  .body-preview { padding: 30px 34px; overflow-wrap: anywhere; }
  .body-preview h1, .body-preview h2, .body-preview h3 { font-family: var(--display); font-variation-settings: "SOFT" 70, "opsz" 90; font-weight: 580; letter-spacing: -0.01em; line-height: 1.12; margin: 0 0 18px; }
  .body-preview h1 { font-size: 30px; }
  .body-preview h2 { font-size: 23px; margin-top: 26px; }
  .body-preview h3 { font-size: 18px; margin-top: 22px; }
  .body-preview p { font-size: 15px; line-height: 1.72; color: var(--ink); margin-bottom: 14px; max-width: 62ch; }
  .body-preview p em { font-family: var(--display); font-style: italic; }
  .body-preview blockquote { border-left: 2px solid var(--vermilion); padding: 2px 0 2px 18px; margin: 18px 0; color: var(--ink-60); font-family: var(--display); font-style: italic; font-size: 16.5px; }
  .body-preview ul, .body-preview ol { padding-left: 22px; margin-bottom: 14px; }
  .body-preview li { font-size: 15px; line-height: 1.72; }
  .body-preview code { font-family: var(--mono); font-size: 12.5px; background: rgba(33,29,24,0.06); padding: 1px 5px; border-radius: 4px; }
  .body-preview pre { background: var(--ink); color: var(--paper); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; overflow-x: auto; }
  .body-preview pre code { background: none; color: inherit; }

  /* ── pipeline (action bar) ── */
  .pipeline { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; border-top: 2px solid var(--ink); background: var(--ink); color: var(--paper); padding: 0 20px; min-height: 58px; }
  .save-btn { font-family: var(--ui); font-weight: 600; font-size: 13.5px; background: var(--vermilion); color: #fff; border: none; border-radius: 7px; padding: 9px 22px; cursor: pointer; transition: transform .12s ease, background .15s ease; }
  .save-btn:hover { background: var(--vermilion-deep); transform: translateY(-1px); }
  .save-btn[disabled] { opacity: .6; transform: none; }
  .pipeline .btn.danger { border-color: rgba(244,239,230,0.3); color: rgba(244,239,230,0.75); }
  .pipeline .btn.danger:hover { background: rgba(196,74,29,0.25); color: #fff; }
  .pipeline .status { font-family: var(--mono); font-size: 11.5px; }
  .pipeline .status-ok { color: #9fd0be; }
  .pipeline .status-error { color: #f0b39e; }
  .pipeline .reload { font-family: var(--ui); font-size: 12px; border: 1px solid rgba(244,239,230,0.4); background: none; color: var(--paper); border-radius: 5px; padding: 3px 10px; cursor: pointer; margin-left: 6px; }
  .pipeline .reload:hover { border-color: var(--paper); }

  /* ── instrument strip: entity db → exported to file → committed ── */
  .stations-wrap { display: flex; align-items: center; min-width: 0; }
  .stations { display: flex; align-items: center; margin-left: 14px; }
  .station { display: inline-flex; align-items: center; gap: 9px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; color: rgba(244,239,230,0.45); white-space: nowrap; }
  .station .dot { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid rgba(244,239,230,0.35); transition: all .2s ease; }
  .station.done { color: rgba(244,239,230,0.95); }
  .station.done .dot { background: var(--verdigris); border-color: var(--verdigris); box-shadow: 0 0 10px rgba(61,107,92,0.7); }
  .station.active { color: #fff; }
  .station.active .dot { border-color: var(--amber); background: var(--amber); animation: pulse 1.2s ease-in-out infinite; }
  .station.no-git { font-style: italic; margin-left: 28px; }
  .track { height: 1px; width: 64px; background: rgba(244,239,230,0.22); margin: 0 14px; position: relative; overflow: hidden; display: inline-block; }
  .track .flow { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--verdigris) 50%, transparent); transform: translateX(-100%); }
  .track.flowing .flow { animation: flow 0.9s ease-in-out infinite; }
  @keyframes flow { to { transform: translateX(100%); } }
  .commit-ref { font-family: var(--mono); font-size: 11px; color: rgba(244,239,230,0.55); margin-left: 22px; white-space: nowrap; }
  .commit-ref b { color: var(--paper); font-weight: 500; }

  /* ── status ── */
  .status { color: var(--ink-60); font-size: 13px; }
  .status-error { color: var(--vermilion-deep); }
  .status-ok { color: var(--verdigris); }
`;
