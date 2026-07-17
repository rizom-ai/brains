import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Streamdown } from "streamdown";
import responsiveStyles from "./responsive.css" with { type: "text" };
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };
import {
  ApiError,
  requestAgentAnswer,
  requestAssist,
  requestFieldAssist,
  type AgentTarget,
  type CmsWorkspaceInfo,
  type DirectorySyncWorkspaceActionResult,
  type DirectorySyncWorkspaceSnapshot,
  type EntitySummary,
  type EntityTypeInfo,
  type FieldAssistResponse,
  type FieldDescriptor,
  type PublicationPipelineSnapshot,
  type PublishingAction,
  type PublishingActionResult,
  type PublishConfirmationArgs,
  type SiteEnvironmentSnapshot,
  type SiteWorkspaceAction,
  type SiteWorkspaceActionResult,
  type SiteWorkspaceSnapshot,
  type TypeSchema,
} from "./api";
import { createEditorDocument } from "./editor-document";
import {
  editorWorkflowReducer,
  initialEditorWorkflowState,
  type SaveState,
} from "./editor-workflow";
import {
  DeleteDialog,
  derivePipeline,
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import {
  removeEntity,
  runCmsWorkspaceAction,
  runDirectorySyncWorkspaceAction,
  runSiteWorkspaceAction,
  saveEntity,
  uploadImage,
  type SaveEntityInput,
} from "./mutations";
import {
  agentTargetsQueryOptions,
  cmsKeys,
  entityDetailQueryOptions,
  entityListQueryOptions,
  entitySchemaQueryOptions,
  invalidateAfterUpload,
  invalidateAfterWorkspaceAction,
  navigationQueryOptions,
  syncStatusQueryOptions,
  workspaceQueryOptions,
} from "./queries";

/** Pick the list-row label for an entity: frontmatter title, else id. */
export function entityTitle(entity: EntitySummary): string {
  const title = entity.frontmatter["title"];
  return typeof title === "string" && title.length > 0 ? title : entity.id;
}

export interface CmsHashTarget {
  entityType: string;
  id?: string;
}

export interface CmsWorkspaceHashTarget {
  workspaceId: string;
}

/**
 * Parse a console-jump door (#/{entityType}[/{id}]) into an editor target.
 * Ids may contain slashes; both segments are URI-decoded.
 */
export function parseCmsHash(hash: string): CmsHashTarget | null {
  const match = /^#\/([^/]+)(?:\/(.+))?$/.exec(hash);
  const rawType = match?.[1];
  if (rawType === undefined || rawType === "workspace") return null;
  const entityType = decodeURIComponent(rawType);
  const rawId = match?.[2];
  return rawId === undefined
    ? { entityType }
    : { entityType, id: decodeURIComponent(rawId) };
}

export function parseCmsWorkspaceHash(
  hash: string,
): CmsWorkspaceHashTarget | null {
  const match = /^#\/workspace\/([^/]+)$/.exec(hash);
  return match?.[1] ? { workspaceId: decodeURIComponent(match[1]) } : null;
}

/** Initial frontmatter draft for a new entity: descriptor defaults only. */
export function emptyDraft(fields: FieldDescriptor[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) draft[field.name] = field.default;
  }
  return draft;
}

function datetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function entityPublicationState(
  entity: EntitySummary,
): "draft" | "published" {
  const status = entity.frontmatter["status"];
  if (status === "published") return "published";
  return entity.frontmatter["published"] === true ? "published" : "draft";
}

function singularLabel(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

const BODY_MODES = ["source", "split", "preview"] as const;
export type BodyMode = (typeof BODY_MODES)[number];
const BODY_MODE_LABELS: Record<BodyMode, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

const externalDocumentSync = Annotation.define<boolean>();

const cmsMarkdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--console-accent-dim)", fontWeight: "500" },
  { tag: tags.meta, color: "var(--console-text-muted)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: [tags.link, tags.url], color: "var(--console-accent-dim)" },
  { tag: tags.quote, color: "var(--console-text-dim)" },
]);

const bodyEditorBaseExtensions: Extension[] = [
  markdown(),
  syntaxHighlighting(cmsMarkdownHighlightStyle),
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
const EMPTY_WORKSPACES: CmsWorkspaceInfo[] = [];

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
        <span className="doc-meta">
          {value.trim() ? value.trim().split(/\s+/).length.toLocaleString() : 0}{" "}
          words · markdown · perfect round-trip
        </span>
      </header>
      {assist && showSource && (
        <section
          className="assist-bar"
          data-has-selection={selection ? "true" : "false"}
          aria-label="AI selection rewrite"
        >
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

const COLLECTION_ENTITY_TYPES = new Set([
  "project",
  "projects",
  "series",
  "topic",
  "topics",
]);
const SITE_ENTITY_TYPES = new Set([
  "profile",
  "settings",
  "site-info",
  "siteInfo",
]);
// Brain machinery: operator-editable, but not authored content. These live
// in their own rail group so a full brain doesn't flood "Content".
const SYSTEM_ENTITY_TYPES = new Set([
  "agent",
  "agents",
  "anchor-profile",
  "brain-character",
  "playbook",
  "playbooks",
  "prompt",
  "prompts",
  "skill",
  "skills",
  "swot",
  "swots",
]);

function cmsTypeGroup(
  entityType: string,
): "Content" | "Collections" | "Site" | "System" {
  if (SITE_ENTITY_TYPES.has(entityType)) return "Site";
  if (SYSTEM_ENTITY_TYPES.has(entityType)) return "System";
  if (COLLECTION_ENTITY_TYPES.has(entityType)) return "Collections";
  return "Content";
}

/**
 * Whether a type's schema models a publication lifecycle. Rows only wear a
 * draft/published chip when the distinction exists — system types like
 * prompts otherwise all read "draft".
 */
export function typeHasPublicationField(fields: FieldDescriptor[]): boolean {
  return fields.some(
    (field) => field.name === "status" || field.name === "published",
  );
}

export function TypeSwitcher(props: {
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
  workspaces?: CmsWorkspaceInfo[];
  activeWorkspace?: string | null;
  workspaceBadges?: Record<string, number>;
  onSelectWorkspace?: (workspaceId: string) => void;
}): ReactElement {
  const groups = (["Content", "Collections", "Site", "System"] as const)
    .map((label) => ({
      label,
      types: props.types.filter(
        (info) => cmsTypeGroup(info.entityType) === label,
      ),
    }))
    .filter((group) => group.types.length > 0);
  const renderGroup = (group: (typeof groups)[number]): ReactElement => (
    <section className="rail-group" key={group.label}>
      <div className="rail-title">{group.label}</div>
      <ul>
        {group.types.map((info) => (
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
    </section>
  );

  return (
    <nav className="types">
      {groups
        .filter(
          (group) => group.label === "Content" || group.label === "Collections",
        )
        .map(renderGroup)}
      {(props.workspaces?.length ?? 0) > 0 && (
        <section className="rail-group rail-group--operations">
          <div className="rail-title">Operations</div>
          <ul>
            {props.workspaces?.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  className={
                    workspace.id === props.activeWorkspace
                      ? "type workspace-type active"
                      : "type workspace-type"
                  }
                  onClick={() => props.onSelectWorkspace?.(workspace.id)}
                >
                  {workspace.label}
                  {(props.workspaceBadges?.[workspace.id] ?? 0) > 0 && (
                    <span className="count count--attention">
                      {props.workspaceBadges?.[workspace.id]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups
        .filter((group) => group.label === "Site" || group.label === "System")
        .map(renderGroup)}
    </nav>
  );
}

/**
 * Image-reference widget: uploads go to the configured CMS upload API, which promotes the
 * bytes into an `image` entity through the owning plugin's pipeline; the
 * field stores the resulting entity id.
 */
function ImageField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const queryClient = useQueryClient();
  const uploadMutation = useMutation({ mutationFn: uploadImage });
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
      <label className="upload-zone">
        <span className="upload-glyph" aria-hidden="true">
          ↑
        </span>
        <strong>Choose an image</strong>
        <small>PNG, JPEG, GIF, WebP, AVIF, or SVG</small>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            uploadMutation.mutate(file, {
              onSuccess: (result) => {
                onChange(result.entityId);
                void invalidateAfterUpload(queryClient);
              },
            });
          }}
        />
      </label>
      {uploadMutation.isPending && <p className="status">Uploading…</p>}
      {uploadMutation.error && (
        <p className="status status-error">
          {errorMessage(uploadMutation.error)}
        </p>
      )}
    </div>
  );
}

function StringListField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string[]) => void;
}): ReactElement {
  const [pending, setPending] = useState("");
  const values = Array.isArray(props.value)
    ? props.value.filter((item): item is string => typeof item === "string")
    : [];
  const add = (): void => {
    const next = pending.trim();
    if (next && !values.includes(next)) props.onChange([...values, next]);
    setPending("");
  };

  return (
    <div className="field field-tags">
      <span className="field-label">
        {props.descriptor.label}
        <em className="kind">tags</em>
      </span>
      <div className="tags">
        {values.map((value) => (
          <span className="tag" key={value}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() =>
                props.onChange(values.filter((item) => item !== value))
              }
            >
              ×
            </button>
          </span>
        ))}
        <span className="tag tag-add">
          <input
            type="text"
            value={pending}
            aria-label={`Add ${props.descriptor.label.toLowerCase()} tag`}
            placeholder="Add tag"
            onChange={(event) => setPending(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" aria-label="Add tag" onClick={add}>
            +
          </button>
        </span>
      </div>
    </div>
  );
}

export type FieldAssistVariant = "summarise" | "tag-suggest";

export type FieldAssistState =
  | { kind: "idle" }
  | { kind: "loading"; field: string; variant: FieldAssistVariant }
  | {
      kind: "suggested";
      field: string;
      variant: FieldAssistVariant;
      suggestion: string | string[];
    }
  | { kind: "error"; field: string; message: string };

export function fieldAssistVariant(
  descriptor: FieldDescriptor,
): FieldAssistVariant | null {
  if (descriptor.widget === "text") return "summarise";
  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return "tag-suggest";
  }
  return null;
}

export function applyFieldAssistSuggestion(
  draft: Record<string, unknown>,
  field: string,
  suggestion: string | string[],
): Record<string, unknown> {
  return { ...draft, [field]: suggestion };
}

export function FieldAssistControls(props: {
  descriptor: FieldDescriptor;
  state: FieldAssistState;
  onRun: (variant: FieldAssistVariant, field: string) => void;
  onApply: (field: string, suggestion: string | string[]) => void;
  onDiscard: () => void;
}): ReactElement | null {
  const { descriptor, state, onRun, onApply, onDiscard } = props;
  const variant = fieldAssistVariant(descriptor);
  if (!variant) return null;
  const active = "field" in state && state.field === descriptor.name;

  if (active && state.kind === "suggested") {
    return (
      <div className="field-assist-suggestion">
        {Array.isArray(state.suggestion) ? (
          <span className="field-assist-tags">
            {state.suggestion.map((tag) => (
              <code key={tag}>{tag}</code>
            ))}
          </span>
        ) : (
          <span className="field-assist-copy">{state.suggestion}</span>
        )}
        <button
          type="button"
          className="field-assist-action"
          onClick={() => onApply(state.field, state.suggestion)}
        >
          Apply
        </button>
        <button
          type="button"
          className="field-assist-action ghost"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    );
  }

  return (
    <div className="field-assist-controls">
      <button
        type="button"
        className="field-assist-run"
        disabled={active && state.kind === "loading"}
        onClick={() => onRun(variant, descriptor.name)}
      >
        {active && state.kind === "loading"
          ? "Thinking…"
          : variant === "summarise"
            ? "Summarise body"
            : `Suggest ${descriptor.label.toLowerCase()}`}
      </button>
      {active && state.kind === "error" && (
        <span className="status status-error">{state.message}</span>
      )}
    </div>
  );
}

export function Field(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: unknown) => void;
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

  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return (
      <StringListField
        descriptor={descriptor}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (descriptor.widget === "list" || descriptor.widget === "object") {
    // Nested structured widgets remain read-only; the value round-trips
    // untouched because saves only send changed draft keys.
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
        type={
          descriptor.widget === "number"
            ? "number"
            : descriptor.widget === "datetime"
              ? "datetime-local"
              : "text"
        }
        value={
          descriptor.widget === "datetime" ? datetimeLocalValue(text) : text
        }
        required={required}
        onChange={(event) =>
          onChange(
            descriptor.widget === "datetime" && event.currentTarget.value
              ? new Date(event.currentTarget.value).toISOString()
              : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}

type MobileEditorPane = "details" | "write" | "preview";

function publicationLabel(value: string): string {
  return value
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) =>
      part.length <= 3
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function publicationSchedule(value: string | undefined): string {
  if (!value) return "next dispatch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPublishingActionError(
  result: PublishingActionResult,
): result is Extract<PublishingActionResult, { success: false }> {
  return "success" in result && result.success === false;
}

function isPublishConfirmation(
  result: PublishingActionResult,
): result is Extract<PublishingActionResult, { needsConfirmation: true }> {
  return "needsConfirmation" in result && result.needsConfirmation === true;
}

export function PublishConfirmationDialog(props: {
  title: string;
  preview: string;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={props.confirming ? undefined : props.onCancel}
    >
      <section
        className="delete-modal publication-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="publish-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="modal-mark" aria-hidden="true">
          ↑
        </span>
        <h3 id="publish-confirm-title">Publish {props.title} now?</h3>
        <p>{props.preview}</p>
        <p className="publication-confirm-warning">
          This sends the current saved version to an external public provider.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            autoFocus
            disabled={props.confirming}
            onClick={props.onCancel}
          >
            Review again
          </button>
          <button
            type="button"
            className="btn publish-confirm"
            disabled={props.confirming}
            onClick={props.onConfirm}
          >
            {props.confirming ? "Publishing…" : "Confirm publication"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PublicationActions(props: {
  entityType: string;
  entityId: string;
  title: string;
  status: string;
  unsaved: boolean;
  onAction: (action: PublishingAction) => Promise<PublishingActionResult>;
}): ReactElement {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    args: PublishConfirmationArgs;
    preview: string;
  } | null>(null);
  const target = {
    entityType: props.entityType,
    entityId: props.entityId,
  };
  const disabled = props.unsaved || busy !== null;

  const execute = useCallback(
    async (action: PublishingAction, key: string): Promise<void> => {
      setBusy(key);
      setError(null);
      try {
        const result = await props.onAction(action);
        if (isPublishingActionError(result)) throw new Error(result.error);
        if (isPublishConfirmation(result)) {
          setConfirmation({
            args: result.args,
            preview:
              result.preview ??
              `This will publish ${props.entityType}:${props.entityId} publicly.`,
          });
        } else if (action.type === "publish") {
          setConfirmation(null);
        }
      } catch (actionError: unknown) {
        setError(errorMessage(actionError));
      } finally {
        setBusy(null);
      }
    },
    [props],
  );

  const lifecycleAction =
    props.status === "queued"
      ? ({ type: "remove", ...target } as const)
      : props.status === "failed"
        ? ({ type: "retry", ...target } as const)
        : ({ type: "queue", ...target } as const);
  const lifecycleLabel =
    props.status === "queued"
      ? "Remove from queue"
      : props.status === "failed"
        ? "Retry"
        : "Add to queue";

  return (
    <section className="publication-actions" aria-label="Publication actions">
      <header>
        <span>Publication</span>
        <b className={`publication-state publication-state--${props.status}`}>
          {props.status}
        </b>
      </header>
      <p>
        Operates on the saved entity. Publication state is separate from the
        save pipeline below.
      </p>
      {props.unsaved && (
        <p className="publication-action-note">
          Save changes before changing publication state.
        </p>
      )}
      {props.status !== "published" && (
        <div className="publication-action-buttons">
          <button
            type="button"
            className="btn ghost"
            disabled={disabled}
            onClick={() => void execute(lifecycleAction, "lifecycle")}
          >
            {busy === "lifecycle" ? "Working…" : lifecycleLabel}
          </button>
          <button
            type="button"
            className="btn publication-publish-now"
            disabled={disabled}
            onClick={() =>
              void execute({ type: "publish", ...target }, "publish")
            }
          >
            {busy === "publish" ? "Preparing…" : "Publish now"}
          </button>
        </div>
      )}
      {props.status === "published" && (
        <p className="publication-action-complete">Published externally.</p>
      )}
      {error && <p className="status status-error">{error}</p>}
      {confirmation && (
        <PublishConfirmationDialog
          title={props.title}
          preview={confirmation.preview}
          confirming={busy === "confirm"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() =>
            void execute(
              {
                type: "publish",
                ...target,
                confirmation: confirmation.args,
              },
              "confirm",
            )
          }
        />
      )}
    </section>
  );
}

export function PublishingWorkspace(props: {
  data: PublicationPipelineSnapshot;
  onOpenEntity: (entityType: string, entityId: string) => void;
  onAction: (action: PublishingAction) => Promise<PublishingActionResult>;
}): ReactElement {
  const { data } = props;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const execute = useCallback(
    async (action: PublishingAction, key: string): Promise<void> => {
      setPendingAction(key);
      setActionError(null);
      try {
        const result = await props.onAction(action);
        if (isPublishingActionError(result)) throw new Error(result.error);
      } catch (error: unknown) {
        setActionError(errorMessage(error));
      } finally {
        setPendingAction(null);
      }
    },
    [props],
  );

  return (
    <main className="publishing-workspace">
      <header className="publishing-head">
        <div>
          <span className="publishing-kicker">Publication operations</span>
          <h2>Publishing desk</h2>
          <p>
            Review intent, inspect dispatch order, and resolve publication
            failures beside the content they belong to.
          </p>
        </div>
        <span className="publishing-online">Pipeline online</span>
      </header>

      <section className="publishing-vitals" aria-label="Pipeline summary">
        <div>
          <span>Queued</span>
          <b>{data.summary.queued}</b>
        </div>
        <div>
          <span>Generating</span>
          <b>{data.summary.generating}</b>
        </div>
        <div className={data.summary.needsOperator > 0 ? "needs" : ""}>
          <span>Needs attention</span>
          <b>{data.summary.needsOperator}</b>
        </div>
        <div>
          <span>Published</span>
          <b>{data.summary.published}</b>
        </div>
      </section>

      {actionError && (
        <p className="status status-error publishing-action-error">
          {actionError}
        </p>
      )}
      <div className="publishing-grid">
        <section className="dispatch-section">
          <header className="publishing-section-head">
            <h3>Dispatch queue</h3>
            <span>ordered within each destination</span>
          </header>
          {data.queue.length === 0 ? (
            <p className="publishing-empty">
              Nothing is queued for publication.
            </p>
          ) : (
            <ol className="dispatch-list">
              {data.queue.map((item, index) => {
                const destinationCount = data.queue.filter(
                  (candidate) => candidate.entityType === item.entityType,
                ).length;
                const key = `${item.entityType}:${item.entityId}`;
                return (
                  <li className="dispatch-row" key={key}>
                    <button
                      type="button"
                      className="dispatch-entity"
                      onClick={() =>
                        props.onOpenEntity(item.entityType, item.entityId)
                      }
                    >
                      <span className="dispatch-position">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="dispatch-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {item.entityType}/{item.entityId}
                        </small>
                      </span>
                      <span className="dispatch-destination">
                        {publicationLabel(item.destination)}
                      </span>
                      <time>{publicationSchedule(item.scheduledFor)}</time>
                      <span className="dispatch-open">open →</span>
                    </button>
                    <span className="dispatch-actions">
                      <button
                        type="button"
                        aria-label={`Move ${item.title} earlier`}
                        disabled={item.position <= 1 || pendingAction !== null}
                        onClick={() =>
                          void execute(
                            {
                              type: "reorder",
                              entityType: item.entityType,
                              entityId: item.entityId,
                              position: item.position - 1,
                            },
                            `${key}:earlier`,
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} later`}
                        disabled={
                          item.position >= destinationCount ||
                          pendingAction !== null
                        }
                        onClick={() =>
                          void execute(
                            {
                              type: "reorder",
                              entityType: item.entityType,
                              entityId: item.entityId,
                              position: item.position + 1,
                            },
                            `${key}:later`,
                          )
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="dispatch-remove"
                        aria-label={`Remove ${item.title} from queue`}
                        disabled={pendingAction !== null}
                        onClick={() =>
                          void execute(
                            {
                              type: "remove",
                              entityType: item.entityType,
                              entityId: item.entityId,
                            },
                            `${key}:remove`,
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="publishing-aside">
          <section className="publishing-card">
            <header>Generating now</header>
            {data.generating.length === 0 ? (
              <p>No publication assets are being generated.</p>
            ) : (
              data.generating.map((job) => (
                <button
                  type="button"
                  className="publication-job"
                  key={job.id}
                  onClick={() => {
                    const [entityType, ...id] = job.target.split("/");
                    if (entityType && id.length > 0) {
                      props.onOpenEntity(entityType, id.join("/"));
                    }
                  }}
                >
                  <strong>{publicationLabel(job.label)}</strong>
                  <span>
                    {job.target} · {job.status}
                  </span>
                  <i aria-hidden="true" />
                </button>
              ))
            )}
          </section>

          <section className="publishing-card publishing-card--attention">
            <header>Needs attention</header>
            {data.failures.length === 0 ? (
              <p>No failed publications.</p>
            ) : (
              data.failures.map((failure) => {
                const key = `${failure.entityType}:${failure.entityId}`;
                return (
                  <div className="publication-failure" key={key}>
                    <button
                      type="button"
                      className="publication-failure-open"
                      onClick={() =>
                        props.onOpenEntity(failure.entityType, failure.entityId)
                      }
                    >
                      <strong>{failure.title}</strong>
                      <span>
                        {failure.entityType}/{failure.entityId}
                      </span>
                      <small>{failure.error}</small>
                    </button>
                    <button
                      type="button"
                      className="publication-retry"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void execute(
                          {
                            type: "retry",
                            entityType: failure.entityType,
                            entityId: failure.entityId,
                          },
                          `${key}:retry`,
                        )
                      }
                    >
                      {pendingAction === `${key}:retry` ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function siteEnvironment(
  data: SiteWorkspaceSnapshot,
  environment: "preview" | "production",
): SiteEnvironmentSnapshot | undefined {
  return data.environments.find((entry) => entry.environment === environment);
}

function siteBuildState(
  environment: SiteEnvironmentSnapshot | undefined,
): string {
  if (environment?.active) return environment.active.state;
  if (environment?.lastFailure) return "failed";
  if (environment?.lastSuccess) return "current";
  return "not built";
}

function formatBuildTime(value: string | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SiteEnvironmentCard(props: {
  label: string;
  description: string;
  environment: SiteEnvironmentSnapshot | undefined;
  url?: string | undefined;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}): ReactElement {
  const success = props.environment?.lastSuccess;
  const failure = props.environment?.lastFailure;
  const state = siteBuildState(props.environment);
  return (
    <article className={`site-environment site-environment--${state}`}>
      <header>
        <div>
          <h3>{props.label}</h3>
          <p>{props.description}</p>
        </div>
        <span className={`site-build-state site-build-state--${state}`}>
          {state}
        </span>
      </header>
      {props.url && (
        <a
          className="site-environment-url"
          href={props.url}
          target="_blank"
          rel="noreferrer"
        >
          {props.url} ↗
        </a>
      )}
      <dl className="site-build-facts">
        <div>
          <dt>Last successful build</dt>
          <dd>{formatBuildTime(success?.completedAt)}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>
            {success
              ? `${success.routesBuilt} routes${success.warnings.length > 0 ? ` · ${success.warnings.length} warning` : ""}`
              : "No successful build recorded"}
          </dd>
        </div>
      </dl>
      {failure && <p className="site-build-error">{failure.message}</p>}
      <button
        type="button"
        className="btn site-build-action"
        disabled={props.busy || props.environment?.active !== undefined}
        onClick={props.onAction}
      >
        {props.busy ? "Requesting…" : props.actionLabel}
      </button>
    </article>
  );
}

export function SiteWorkspace(props: {
  data: SiteWorkspaceSnapshot;
  onAction: (action: SiteWorkspaceAction) => Promise<SiteWorkspaceActionResult>;
  onOpenSiteInfo?: (() => void) | undefined;
}): ReactElement {
  const [pending, setPending] = useState<"preview" | "production" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmProduction, setConfirmProduction] = useState(false);
  const preview = siteEnvironment(props.data, "preview");
  const production = siteEnvironment(props.data, "production");

  const execute = useCallback(
    async (action: SiteWorkspaceAction): Promise<void> => {
      const environment =
        action.type === "build-preview" ? "preview" : "production";
      setPending(environment);
      setError(null);
      try {
        await props.onAction(action);
        setConfirmProduction(false);
      } catch (actionError: unknown) {
        setError(errorMessage(actionError));
      } finally {
        setPending(null);
      }
    },
    [props],
  );

  return (
    <main className="site-workspace">
      <header className="site-workspace-head">
        <div>
          <span>Website operations</span>
          <h2>Site control</h2>
          <p>
            Build a proof with public drafts, then update the live site from
            published public content.
          </p>
        </div>
        <strong>{props.data.site.title}</strong>
      </header>

      {error && <p className="status status-error">{error}</p>}

      <section className="site-environments" aria-label="Site environments">
        <SiteEnvironmentCard
          label="Preview"
          description="Public content · drafts included"
          environment={preview}
          url={props.data.site.previewUrl}
          actionLabel="Build preview"
          busy={pending === "preview"}
          onAction={() => void execute({ type: "build-preview" })}
        />
        <SiteEnvironmentCard
          label="Live"
          description="Published public content only"
          environment={production}
          url={props.data.site.liveUrl}
          actionLabel="Update live site"
          busy={pending === "production"}
          onAction={() => setConfirmProduction(true)}
        />
      </section>

      <div className="site-workspace-grid">
        <section>
          <header className="site-section-head">
            <h3>Recent builds</h3>
            <span>latest five</span>
          </header>
          {props.data.recentBuilds.length === 0 ? (
            <p className="site-empty">No completed builds in this runtime.</p>
          ) : (
            <ol className="site-build-list">
              {props.data.recentBuilds.map((build) => (
                <li key={`${build.jobId}:${build.completedAt}`}>
                  <span className={`site-build-outcome ${build.outcome}`}>
                    {build.outcome === "succeeded" ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>{build.environment}</strong>
                    <small>
                      {build.outcome === "succeeded"
                        ? `${build.routesBuilt ?? 0} routes`
                        : build.message}
                    </small>
                  </div>
                  <time>{formatBuildTime(build.completedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="site-workspace-aside">
          <section className="site-fact-card">
            <header>Automation</header>
            <dl>
              <div>
                <dt>Auto-rebuild</dt>
                <dd>{props.data.automation.autoRebuild ? "On" : "Off"}</dd>
              </div>
              <div>
                <dt>Default target</dt>
                <dd>{props.data.automation.defaultEnvironment}</dd>
              </div>
              <div>
                <dt>Debounce</dt>
                <dd>{props.data.automation.debounceMs / 1000}s</dd>
              </div>
            </dl>
            {props.onOpenSiteInfo && (
              <button
                type="button"
                className="site-info-link"
                onClick={props.onOpenSiteInfo}
              >
                Edit site title and metadata →
              </button>
            )}
          </section>
          <section className="site-fact-card">
            <header>Registered routes · {props.data.routes.length}</header>
            <ul className="site-route-list">
              {props.data.routes.slice(0, 5).map((route) => (
                <li key={route.id}>
                  <code>{route.path}</code>
                  <span>{route.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {confirmProduction && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={() => setConfirmProduction(false)}
        >
          <section
            className="delete-modal site-production-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="site-production-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="modal-mark" aria-hidden="true">
              ↑
            </span>
            <h3 id="site-production-title">Update the live site?</h3>
            <p>
              This rebuild replaces the production output currently served at{" "}
              {props.data.site.liveUrl ?? "the configured live URL"} using
              published public content only.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmProduction(false)}
              >
                Keep current site
              </button>
              <button
                type="button"
                className="btn site-production-confirm"
                disabled={pending !== null}
                onClick={() =>
                  void execute({
                    type: "build-production",
                    confirmed: true,
                  })
                }
              >
                {pending === "production" ? "Requesting…" : "Update live site"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function syncRunSummary(
  run: DirectorySyncWorkspaceSnapshot["recentRuns"][number],
): string {
  const facts = [
    run.imported > 0 ? `${run.imported} imported` : null,
    run.exported > 0 ? `${run.exported} exported` : null,
    run.skipped > 0 ? `${run.skipped} unchanged` : null,
    run.quarantined > 0 ? `${run.quarantined} quarantined` : null,
    run.failed > 0 ? `${run.failed} failed` : null,
  ].filter((fact): fact is string => fact !== null);
  return facts.length > 0 ? facts.join(" · ") : run.summary;
}

function syncSourceLabel(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function DirectorySyncWorkspace(props: {
  data: DirectorySyncWorkspaceSnapshot;
  onAction: () => Promise<DirectorySyncWorkspaceActionResult>;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = props;
  const git = data.git;
  const coverage = Object.entries(data.directory.byEntityType)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5);
  const maxCoverage = coverage[0]?.[1] ?? 1;
  const healthLabel =
    data.health === "active"
      ? "Sync in progress"
      : data.health === "attention"
        ? "Needs attention"
        : data.directory.watching
          ? "Watching"
          : "Ready";

  const runSync = useCallback(async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await props.onAction();
    } catch (actionError: unknown) {
      setError(errorMessage(actionError));
    } finally {
      setPending(false);
    }
  }, [props]);

  return (
    <main className="directory-sync-workspace" data-health={data.health}>
      <header className="directory-sync-head">
        <div>
          <span>Durability operations</span>
          <h2>Content sync</h2>
          <p>
            Keep the entity database, {data.directory.displayPath} files, and
            configured Git remote converged.
          </p>
        </div>
        <strong className="directory-sync-health">
          {healthLabel}
          <small>
            {data.directory.lastSettledAt
              ? `last settled ${formatUpdated(data.directory.lastSettledAt)}`
              : "no completed sync recorded"}
          </small>
        </strong>
      </header>

      {error && <p className="status status-error">{error}</p>}

      <section className="directory-sync-vitals" aria-label="Sync summary">
        <div>
          <span>Files</span>
          <b>{data.directory.totalFiles}</b>
          <small>markdown + images</small>
        </div>
        <div>
          <span>Entity types</span>
          <b>{Object.keys(data.directory.byEntityType).length}</b>
          <small>within sync scope</small>
        </div>
        <div>
          <span>Branch</span>
          <b className="directory-sync-word">{git?.branch ?? "local"}</b>
          <small>{git ? "remote connected" : "files only"}</small>
        </div>
        <div className={data.issues.length > 0 ? "needs" : ""}>
          <span>{data.issues.length > 0 ? "Issues" : "Remote delta"}</span>
          <b>
            {data.issues.length > 0 ? data.issues.length : (git?.behind ?? 0)}
          </b>
          <small>
            {data.issues.length > 0
              ? "needs attention"
              : git
                ? `${git.ahead} ahead · ${git.behind} behind`
                : "not configured"}
          </small>
        </div>
      </section>

      <section
        className="directory-sync-flow"
        data-has-git={git ? "true" : "false"}
        aria-label="Content sync flow"
      >
        <div>
          <strong>Entity DB</strong>
          <small>runtime records</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <strong>{data.directory.displayPath}</strong>
          <small>
            {data.directory.watching ? "watching" : "manual"} ·{" "}
            {data.directory.totalFiles} files
          </small>
        </div>
        {git && (
          <>
            <i aria-hidden="true">→</i>
            <div>
              <strong>Git remote</strong>
              <small>{git.remoteLabel ?? git.branch}</small>
            </div>
          </>
        )}
        <button
          type="button"
          className="btn directory-sync-action"
          disabled={pending || data.activeRun !== undefined}
          onClick={() => void runSync()}
        >
          {pending || data.activeRun ? "Syncing…" : "Sync now"}
        </button>
      </section>

      <div className="directory-sync-grid">
        <section>
          {data.activeRun && (
            <article className="directory-sync-active">
              <header>
                <i aria-hidden="true" />
                <strong>{publicationLabel(data.activeRun.state)}</strong>
                <time>{formatUpdated(data.activeRun.startedAt)}</time>
              </header>
              <p>
                {syncSourceLabel(data.activeRun.source)} sync is active. This
                view refreshes until the referenced job or batch settles.
              </p>
              <span aria-hidden="true">
                <i />
              </span>
            </article>
          )}
          <header className="directory-sync-section-head">
            <h3>Recent syncs</h3>
            <span>latest five · runtime history</span>
          </header>
          {data.recentRuns.length === 0 ? (
            <p className="directory-sync-empty">
              No completed sync activity recorded in this runtime.
            </p>
          ) : (
            <ol className="directory-sync-run-list">
              {data.recentRuns.map((run) => (
                <li key={run.id}>
                  <span className={`directory-sync-outcome ${run.outcome}`}>
                    {run.outcome === "succeeded" ? "✓" : "!"}
                  </span>
                  <span className="directory-sync-source">{run.source}</span>
                  <span>
                    <strong>{run.summary}</strong>
                    <small>{syncRunSummary(run)}</small>
                  </span>
                  <time>{formatUpdated(run.completedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="directory-sync-aside">
          <section
            className={
              data.issues.length > 0
                ? "directory-sync-card directory-sync-card--attention"
                : "directory-sync-card directory-sync-card--clear"
            }
          >
            <header>
              {data.issues.length > 0 ? "Needs attention" : "No blockers"}
            </header>
            {data.issues.length === 0 ? (
              <p>
                Directory exists, configured automation is available, and no
                unresolved operation failures are recorded.
              </p>
            ) : (
              data.issues.slice(0, 3).map((issue) => (
                <div className="directory-sync-issue" key={issue.id}>
                  <strong>{publicationLabel(issue.kind)}</strong>
                  {issue.path && <code>{issue.path}</code>}
                  <small>{issue.message}</small>
                </div>
              ))
            )}
          </section>

          <section className="directory-sync-card">
            <header>Automation</header>
            <dl>
              <div>
                <dt>File watcher</dt>
                <dd>{data.directory.watching ? "On" : "Manual"}</dd>
              </div>
              {data.automation.remoteIntervalMinutes !== undefined && (
                <div>
                  <dt>Remote pull</dt>
                  <dd>Every {data.automation.remoteIntervalMinutes}m</dd>
                </div>
              )}
              {data.automation.commitDebounceMs !== undefined && (
                <div>
                  <dt>Auto-commit</dt>
                  <dd>{data.automation.commitDebounceMs / 1000}s debounce</dd>
                </div>
              )}
              <div>
                <dt>File removal</dt>
                <dd>
                  {data.automation.deleteOnFileRemoval
                    ? "Deletes entity"
                    : "Preserves entity"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="directory-sync-card">
            <header>Source</header>
            <dl>
              <div>
                <dt>Directory</dt>
                <dd>{data.directory.displayPath}/</dd>
              </div>
              <div>
                <dt>Remote</dt>
                <dd>{git?.remoteLabel ?? "Not configured"}</dd>
              </div>
              <div>
                <dt>Last commit</dt>
                <dd>{git?.lastCommit?.slice(0, 7) ?? "—"}</dd>
              </div>
              <div>
                <dt>Working tree</dt>
                <dd>{git?.hasChanges ? "Pending" : "Clean"}</dd>
              </div>
            </dl>
          </section>

          {coverage.length > 0 && (
            <section className="directory-sync-card">
              <header>Largest collections</header>
              {coverage.map(([entityType, count]) => (
                <div className="directory-sync-coverage" key={entityType}>
                  <span>{entityType}</span>
                  <i>
                    <b style={{ width: `${(count / maxCoverage) * 100}%` }} />
                  </i>
                  <small>{count}</small>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

export function App(): ReactElement {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [entityType, setEntityType] = useState<string | null>(null);
  const [editor, dispatchEditor] = useReducer(
    editorWorkflowReducer,
    initialEditorWorkflowState,
  );
  const { mode, draft, body, save: saveState, deleteOpen } = editor;
  const [fieldAssistState, setFieldAssistState] = useState<FieldAssistState>({
    kind: "idle",
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>("split");
  const [mobilePane, setMobilePane] = useState<MobileEditorPane>("details");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baselineCommit, setBaselineCommit] = useState<string | null>(null);
  const saveStartedAt = useRef(0);
  // Entity id from a console-jump door, opened once its collection loads.
  const pendingDeepLinkId = useRef<string | null>(null);
  const openRequestId = useRef(0);
  const selectedEntityTypeRef = useRef(entityType);
  selectedEntityTypeRef.current = entityType;
  const queryClient = useQueryClient();
  const navigationQuery = useQuery(navigationQueryOptions());
  const types = navigationQuery.data?.types ?? null;
  const workspaces = navigationQuery.data?.workspaces ?? EMPTY_WORKSPACES;
  const workspaceQuery = useQuery({
    ...workspaceQueryOptions(activeWorkspaceId ?? ""),
    enabled: activeWorkspaceId !== null,
  });
  const workspaceResponse = workspaceQuery.data ?? null;
  const workspaceData = workspaceResponse?.data ?? null;
  const workspaceError = workspaceQuery.error
    ? errorMessage(workspaceQuery.error)
    : null;
  const agentTargetsQuery = useQuery(agentTargetsQueryOptions());
  const agentTargets = agentTargetsQuery.data ?? EMPTY_AGENT_TARGETS;
  const syncStatusQuery = useQuery(syncStatusQueryOptions());
  const syncStatus = syncStatusQuery.data ?? null;
  const entityListQuery = useQuery({
    ...entityListQueryOptions(entityType ?? ""),
    enabled: entityType !== null,
  });
  const entities = entityType ? (entityListQuery.data ?? null) : null;
  const entitySchemaQuery = useQuery({
    ...entitySchemaQueryOptions(entityType ?? ""),
    enabled: entityType !== null,
  });
  const schema = entityType ? (entitySchemaQuery.data ?? null) : null;
  const activeEntityId = mode.kind === "edit" ? mode.entity.id : null;
  useQuery({
    ...entityDetailQueryOptions(entityType ?? "", activeEntityId ?? ""),
    enabled: entityType !== null && activeEntityId !== null,
  });
  const saveEntityMutation = useMutation({ mutationFn: saveEntity });
  const deleteEntityMutation = useMutation({ mutationFn: removeEntity });
  const workspaceActionMutation = useMutation({
    mutationFn: runCmsWorkspaceAction,
  });
  const siteWorkspaceActionMutation = useMutation({
    mutationFn: runSiteWorkspaceAction,
  });
  const directorySyncWorkspaceActionMutation = useMutation({
    mutationFn: runDirectorySyncWorkspaceAction,
  });
  const deleting = deleteEntityMutation.isPending;

  const activeType = types?.find((info) => info.entityType === entityType);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const publicationWorkspaceData =
    activeWorkspace?.rendererName === "PublishingWorkspace" &&
    workspaceResponse?.rendererName === "PublishingWorkspace"
      ? workspaceResponse.data
      : null;
  const siteWorkspaceData =
    activeWorkspace?.rendererName === "SiteWorkspace" &&
    workspaceResponse?.rendererName === "SiteWorkspace"
      ? workspaceResponse.data
      : null;
  const directorySyncWorkspaceData =
    activeWorkspace?.rendererName === "DirectorySyncWorkspace" &&
    workspaceResponse?.rendererName === "DirectorySyncWorkspace"
      ? workspaceResponse.data
      : null;

  useEffect(() => {
    if (!deleteOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !deleting) {
        dispatchEditor({ type: "deleteCancelled" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return (): void => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  useEffect(() => {
    if (!types) return;
    // A console-jump door (#/{type}[/{id}]) overrides the default starting
    // collection; the id half is honored once entities load.
    const target = parseCmsHash(window.location.hash);
    const targeted =
      target && types.some((info) => info.entityType === target.entityType)
        ? target
        : null;
    if (targeted?.id !== undefined) {
      pendingDeepLinkId.current = targeted.id;
    }
    const workspaceTarget = parseCmsWorkspaceHash(window.location.hash);
    if (
      workspaceTarget &&
      workspaces.some(
        (workspace) => workspace.id === workspaceTarget.workspaceId,
      )
    ) {
      setActiveWorkspaceId(workspaceTarget.workspaceId);
    }
    const first = types.find((info) => !info.isSingleton) ?? types[0];
    setEntityType(
      targeted ? targeted.entityType : first ? first.entityType : null,
    );
  }, [types, workspaces]);

  useEffect(() => {
    if (!activeWorkspaceId || !siteWorkspaceData) return undefined;
    if (!siteWorkspaceData.environments.some((entry) => entry.active)) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: cmsKeys.workspace(activeWorkspaceId),
      });
    }, 1000);
    return (): void => window.clearTimeout(timer);
  }, [activeWorkspaceId, queryClient, siteWorkspaceData]);

  useEffect(() => {
    if (!activeWorkspaceId || !directorySyncWorkspaceData?.activeRun) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: cmsKeys.workspace(activeWorkspaceId),
      });
    }, 1000);
    return (): void => window.clearTimeout(timer);
  }, [activeWorkspaceId, directorySyncWorkspaceData, queryClient]);

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
      void queryClient.invalidateQueries({
        queryKey: cmsKeys.syncStatus(),
      });
    }, 900);
    return (): void => window.clearTimeout(timer);
  }, [saveState, syncStatus, baselineCommit, queryClient]);

  useEffect(() => {
    if (!entityType) return;
    openRequestId.current += 1;
    dispatchEditor({ type: "collectionChanged" });
    setMobilePane("details");
    setFieldAssistState({ kind: "idle" });
    let active = true;
    Promise.all([
      queryClient.fetchQuery({
        ...entitySchemaQueryOptions(entityType),
        staleTime: 0,
      }),
      queryClient.ensureQueryData(entityListQueryOptions(entityType)),
    ])
      .then(([loadedSchema, loadedEntities]) => {
        if (!active) return undefined;
        const deepLinkId = pendingDeepLinkId.current;
        if (deepLinkId !== null) {
          pendingDeepLinkId.current = null;
          if (loadedEntities.some((entry) => entry.id === deepLinkId)) {
            return queryClient
              .fetchQuery({
                ...entityDetailQueryOptions(entityType, deepLinkId),
                staleTime: 0,
              })
              .then((entity) => {
                if (!active) return;
                const document = createEditorDocument(entity);
                dispatchEditor({ type: "documentOpened", document });
              });
          }
        }
        // Singletons skip the list: open the record, or start creating it.
        if (loadedSchema.isSingleton) {
          const record = loadedEntities[0];
          if (record) {
            return queryClient
              .fetchQuery({
                ...entityDetailQueryOptions(entityType, record.id),
                staleTime: 0,
              })
              .then((entity) => {
                if (!active) return;
                const document = createEditorDocument(entity);
                dispatchEditor({ type: "documentOpened", document });
              });
          }
          dispatchEditor({
            type: "creationStarted",
            draft: emptyDraft(loadedSchema.fields),
          });
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      });
    return (): void => {
      active = false;
    };
  }, [entityType, queryClient]);

  const openEntity = useCallback(
    (id: string, nextState: SaveState = { kind: "idle" }): void => {
      if (!entityType) return;
      const requestId = ++openRequestId.current;
      const requestedType = entityType;
      queryClient
        .fetchQuery({
          ...entityDetailQueryOptions(entityType, id),
          staleTime: 0,
        })
        .then((entity) => {
          if (
            requestId !== openRequestId.current ||
            selectedEntityTypeRef.current !== requestedType
          ) {
            return;
          }
          const document = createEditorDocument(entity);
          dispatchEditor({
            type: "documentOpened",
            document,
            save: nextState,
          });
          setFieldAssistState({ kind: "idle" });
        })
        .catch((error: unknown) => {
          if (requestId === openRequestId.current) {
            setLoadError(errorMessage(error));
          }
        });
    },
    [entityType, queryClient],
  );

  const openWorkspaceEntity = useCallback(
    (nextEntityType: string, id: string): void => {
      setActiveWorkspaceId(null);
      window.history.replaceState(
        null,
        "",
        `#/${encodeURIComponent(nextEntityType)}/${encodeURIComponent(id)}`,
      );
      if (nextEntityType === entityType) {
        openEntity(id);
        return;
      }
      pendingDeepLinkId.current = id;
      setEntityType(nextEntityType);
    },
    [entityType, openEntity],
  );

  const selectEntityType = useCallback((nextEntityType: string): void => {
    setActiveWorkspaceId(null);
    window.history.replaceState(
      null,
      "",
      `#/${encodeURIComponent(nextEntityType)}`,
    );
    setEntityType(nextEntityType);
  }, []);

  const selectWorkspace = useCallback((workspaceId: string): void => {
    setActiveWorkspaceId(workspaceId);
    window.history.replaceState(
      null,
      "",
      `#/workspace/${encodeURIComponent(workspaceId)}`,
    );
  }, []);

  const startCreate = useCallback((): void => {
    if (!schema) return;
    dispatchEditor({
      type: "creationStarted",
      draft: emptyDraft(schema.fields),
    });
    setFieldAssistState({ kind: "idle" });
  }, [schema]);

  const backToList = useCallback((): void => {
    dispatchEditor({ type: "browseRequested" });
    setFieldAssistState({ kind: "idle" });
  }, []);

  const runFieldAssist = useCallback(
    (variant: FieldAssistVariant, field: string): void => {
      if (!entityType || body.trim().length === 0) return;
      setFieldAssistState({ kind: "loading", field, variant });
      requestFieldAssist({
        variant,
        entityType,
        targetField: field,
        body,
        frontmatter: draft,
      })
        .then((response: FieldAssistResponse) => {
          const suggestion =
            response.variant === "summarise"
              ? response.suggestion
              : response.suggestions;
          setFieldAssistState({
            kind: "suggested",
            field: response.targetField,
            variant: response.variant,
            suggestion,
          });
        })
        .catch((error: unknown) => {
          setFieldAssistState({
            kind: "error",
            field,
            message: errorMessage(error),
          });
        });
    },
    [body, draft, entityType],
  );

  const applyFieldAssist = useCallback(
    (field: string, suggestion: string | string[]): void => {
      dispatchEditor({ type: "fieldAssistApplied", field, suggestion });
      setFieldAssistState({ kind: "idle" });
    },
    [],
  );

  const save = useCallback((): void => {
    if (!entityType || mode.kind === "browse" || !schema) return;
    saveStartedAt.current = Date.now();
    setBaselineCommit(syncStatus?.git?.lastCommit ?? null);
    dispatchEditor({ type: "saveStarted" });
    const bodyPayload = schema.hasBody ? { body } : {};
    const input: SaveEntityInput =
      mode.kind === "create"
        ? {
            kind: "create",
            entityType,
            frontmatter: draft,
            ...bodyPayload,
          }
        : {
            kind: "update",
            entityType,
            id: mode.entity.id,
            frontmatter: draft,
            baseContentHash: mode.entity.contentHash,
            ...bodyPayload,
          };
    saveEntityMutation.mutate(input, {
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: cmsKeys.entities(entityType),
          }),
          queryClient.invalidateQueries({
            queryKey: cmsKeys.syncStatus(),
          }),
        ]);
        const noop = "skipped" in result && result.skipped === true;
        // Re-fetch after every save so the next edit carries a fresh
        // contentHash precondition.
        openEntity(result.entityId, { kind: "saved", noop });
      },
      onError: (error: Error) => {
        dispatchEditor({
          type: "saveFailed",
          save:
            error instanceof ApiError && error.status === 409
              ? { kind: "conflict", message: errorMessage(error) }
              : { kind: "error", message: errorMessage(error) },
        });
      },
    });
  }, [
    entityType,
    mode,
    draft,
    body,
    schema,
    openEntity,
    syncStatus,
    queryClient,
    saveEntityMutation,
  ]);

  const remove = useCallback((): void => {
    if (!entityType || mode.kind !== "edit" || deleting) return;
    const { id } = mode.entity;
    // Recoverable downstream: the delete is exported and committed, so the
    // file remains in git history.
    deleteEntityMutation.mutate(
      { entityType, id },
      {
        onSuccess: async () => {
          dispatchEditor({ type: "deleteSucceeded" });
          queryClient.removeQueries({
            queryKey: cmsKeys.entity(entityType, id),
          });
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: cmsKeys.entities(entityType),
            }),
            queryClient.invalidateQueries({
              queryKey: cmsKeys.syncStatus(),
            }),
          ]);
        },
        onError: (error: Error) => {
          dispatchEditor({
            type: "deleteFailed",
            message: errorMessage(error),
          });
        },
      },
    );
  }, [entityType, mode, deleting, queryClient, deleteEntityMutation]);

  const performPublishingAction = useCallback(
    async (action: PublishingAction): Promise<PublishingActionResult> => {
      const capability = workspaces.find(
        (workspace) =>
          workspace.rendererName === "PublishingWorkspace" &&
          workspace.entityTypes.includes(action.entityType),
      );
      if (!capability) throw new Error("Publishing is unavailable");

      const result = await workspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action,
      });
      if (!isPublishingActionError(result) && !isPublishConfirmation(result)) {
        await invalidateAfterWorkspaceAction(queryClient, capability.id);
        if (
          mode.kind === "edit" &&
          entityType === action.entityType &&
          mode.entity.id === action.entityId
        ) {
          openEntity(action.entityId);
        }
      }
      return result;
    },
    [
      entityType,
      mode,
      openEntity,
      queryClient,
      workspaceActionMutation,
      workspaces,
    ],
  );

  const performSiteAction = useCallback(
    async (action: SiteWorkspaceAction): Promise<SiteWorkspaceActionResult> => {
      const capability = workspaces.find(
        (workspace) => workspace.rendererName === "SiteWorkspace",
      );
      if (!capability) throw new Error("Site builder is unavailable");

      const result = await siteWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action,
      });
      await invalidateAfterWorkspaceAction(queryClient, capability.id);
      return result;
    },
    [queryClient, siteWorkspaceActionMutation, workspaces],
  );

  const performDirectorySyncAction =
    useCallback(async (): Promise<DirectorySyncWorkspaceActionResult> => {
      const capability = workspaces.find(
        (workspace) => workspace.rendererName === "DirectorySyncWorkspace",
      );
      if (!capability) throw new Error("Directory sync is unavailable");

      const result = await directorySyncWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action: { type: "sync-now" },
      });
      await Promise.all([
        invalidateAfterWorkspaceAction(queryClient, capability.id),
        queryClient.invalidateQueries({ queryKey: cmsKeys.syncStatus() }),
      ]);
      return result;
    }, [directorySyncWorkspaceActionMutation, queryClient, workspaces]);

  const visibleLoadError =
    loadError ??
    (navigationQuery.error ? errorMessage(navigationQuery.error) : null);

  if (visibleLoadError) {
    return (
      <div className="studio">
        <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
        <p className="status status-error boot-status">{visibleLoadError}</p>
      </div>
    );
  }
  if (
    !types ||
    (activeWorkspaceId
      ? !workspaceData && !workspaceError
      : entityType && (!schema || !entities))
  ) {
    return (
      <div className="studio">
        <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
        <p className="status boot-status">Loading…</p>
      </div>
    );
  }
  if (!activeWorkspaceId && (!entityType || !schema)) {
    return (
      <div className="studio">
        <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
        <p className="status boot-status">
          No editable entity types are registered.
        </p>
      </div>
    );
  }

  // The guards above guarantee these values on every entity-rendering branch.
  // Workspace branches do not read them.
  const entitySchema = schema as TypeSchema;
  const selectedEntityType = entityType as string;
  const editing = !activeWorkspaceId && mode.kind !== "browse";
  const heading =
    mode.kind === "edit"
      ? entityTitle(mode.entity)
      : mode.kind === "create"
        ? `New ${activeType?.label ?? entityType}`
        : (activeType?.label ?? entityType);
  const collectionLabel =
    activeWorkspace?.label ?? activeType?.label ?? entityType ?? "CMS";
  const entryLabel = singularLabel(collectionLabel);
  const syncPending = syncStatus?.git?.hasChanges === true;
  const publicationWorkspace = workspaces.find(
    (workspace) =>
      workspace.rendererName === "PublishingWorkspace" &&
      workspace.entityTypes.includes(selectedEntityType),
  );
  const hasUnsavedChanges =
    mode.kind === "edit" &&
    (body !== mode.entity.body ||
      JSON.stringify(draft) !== JSON.stringify(mode.entity.frontmatter));

  return (
    <div
      className="studio"
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
      <header className="crumbbar">
        <span className="crumb">
          {editing && !entitySchema.isSingleton ? (
            <button type="button" onClick={backToList}>
              {collectionLabel}
            </button>
          ) : (
            collectionLabel
          )}
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
            active={activeWorkspaceId ? null : entityType}
            onSelect={selectEntityType}
            workspaces={workspaces}
            activeWorkspace={activeWorkspaceId}
            workspaceBadges={{
              ...(publicationWorkspaceData
                ? {
                    publishing: publicationWorkspaceData.summary.needsOperator,
                  }
                : {}),
              ...(siteWorkspaceData
                ? {
                    site: siteWorkspaceData.environments.filter(
                      (entry) => entry.lastFailure !== undefined,
                    ).length,
                  }
                : {}),
              ...(directorySyncWorkspaceData
                ? { sync: directorySyncWorkspaceData.issues.length }
                : {}),
            }}
            onSelectWorkspace={selectWorkspace}
          />
        </aside>
        {activeWorkspaceId ? (
          workspaceError ? (
            <main className="publishing-workspace">
              <p className="status status-error">{workspaceError}</p>
            </main>
          ) : publicationWorkspaceData ? (
            <PublishingWorkspace
              data={publicationWorkspaceData}
              onOpenEntity={openWorkspaceEntity}
              onAction={performPublishingAction}
            />
          ) : siteWorkspaceData ? (
            <SiteWorkspace
              data={siteWorkspaceData}
              onAction={performSiteAction}
              {...(types.some((info) => info.entityType === "site-info")
                ? { onOpenSiteInfo: () => selectEntityType("site-info") }
                : {})}
            />
          ) : directorySyncWorkspaceData ? (
            <DirectorySyncWorkspace
              data={directorySyncWorkspaceData}
              onAction={performDirectorySyncAction}
            />
          ) : null
        ) : !editing ? (
          <main className="listing">
            <div className="listing-head">
              <h3>{activeType?.label ?? entityType}</h3>
              <span className="meta">
                {entities?.length ?? 0}{" "}
                {entities?.length === 1 ? "entity" : "entities"} · sorted by
                updated
              </span>
              <button type="button" className="btn" onClick={startCreate}>
                New {entryLabel.toLowerCase()}
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
                  <small>
                    {singularLabel(entity.entityType)}/{entity.id}
                  </small>
                </span>
                {typeHasPublicationField(entitySchema.fields) && (
                  <span className={`chip ${entityPublicationState(entity)}`}>
                    {entityPublicationState(entity)}
                  </span>
                )}
                <span className="updated">{formatUpdated(entity.updated)}</span>
                <span className="sync">
                  <span
                    className={syncPending ? "sync-dot pending" : "sync-dot"}
                  />
                  {syncPending ? "exporting" : "committed"}
                </span>
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
                  disabled={pane !== "details" && !entitySchema.hasBody}
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
                <h2>
                  <span className="cms-form-desktop-label">Frontmatter</span>
                  <span className="cms-form-mobile-label">Colophon</span>
                </h2>
                <span>
                  {entryLabel.toLowerCase()} ·{" "}
                  {mode.kind === "create"
                    ? "new"
                    : entityPublicationState(mode.entity)}
                </span>
              </div>
              {entitySchema.fields.map((descriptor) => (
                <div key={descriptor.name} className="field-with-assist">
                  <Field
                    descriptor={descriptor}
                    value={draft[descriptor.name]}
                    onChange={(raw) =>
                      dispatchEditor({
                        type: "fieldChanged",
                        descriptor,
                        raw,
                      })
                    }
                  />
                  {entitySchema.hasBody && body.trim().length > 0 && (
                    <FieldAssistControls
                      descriptor={descriptor}
                      state={fieldAssistState}
                      onRun={runFieldAssist}
                      onApply={applyFieldAssist}
                      onDiscard={() => setFieldAssistState({ kind: "idle" })}
                    />
                  )}
                </div>
              ))}
              {entitySchema.fields.length === 0 && (
                <p className="status">
                  This type is raw markdown — the whole document is the body.
                </p>
              )}
              {publicationWorkspace && mode.kind === "edit" && (
                <PublicationActions
                  entityType={selectedEntityType}
                  entityId={mode.entity.id}
                  title={entityTitle(mode.entity)}
                  status={
                    typeof mode.entity.frontmatter["status"] === "string"
                      ? mode.entity.frontmatter["status"]
                      : "draft"
                  }
                  unsaved={hasUnsavedChanges}
                  onAction={performPublishingAction}
                />
              )}
            </aside>
            <section className="manuscript">
              {entitySchema.hasBody ? (
                <BodyEditor
                  value={body}
                  mode={bodyMode}
                  onChange={(nextBody) =>
                    dispatchEditor({ type: "bodyChanged", body: nextBody })
                  }
                  onModeChange={setBodyMode}
                  assist={{
                    entityType: selectedEntityType,
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
              <span className="cms-mobile-save-status">
                <b>
                  {saveState.kind === "saving"
                    ? "Saving changes"
                    : saveState.kind === "saved"
                      ? "All changes saved"
                      : "Entity pipeline"}
                </b>
                {syncStatus?.git?.lastCommit
                  ? `db → file → ${syncStatus.git.lastCommit.slice(0, 7)}`
                  : "entity db"}
              </span>
              <span className="spacer" />
              {mode.kind === "edit" && !entitySchema.isSingleton && (
                <>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => dispatchEditor({ type: "deleteRequested" })}
                  >
                    Delete
                  </button>
                  <details className="cms-mobile-more">
                    <summary aria-label="More document actions">•••</summary>
                    <button
                      type="button"
                      onClick={(event) => {
                        // Fold the disclosure so it isn't left hanging open
                        // behind the confirmation dialog's scrim.
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        dispatchEditor({ type: "deleteRequested" });
                      }}
                    >
                      Delete entry
                    </button>
                  </details>
                </>
              )}
            </footer>
          </form>
        )}
      </div>
      {deleteOpen && mode.kind === "edit" && (
        <DeleteDialog
          entityId={mode.entity.id}
          deleting={deleting}
          onCancel={() => dispatchEditor({ type: "deleteCancelled" })}
          onConfirm={remove}
        />
      )}
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

export const styles = `
  .studio { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .boot-status { padding: 48px; }
  .spacer { flex: 1; }

  /* ── crumb bar — surface-local wayfinding below the console strip ── */
  .crumbbar { display: flex; align-items: center; gap: 18px; padding: 0 20px; height: 40px; border-bottom: 1px solid var(--console-rule-strong); background: linear-gradient(to bottom, color-mix(in srgb, var(--console-text) 4%, transparent), transparent), var(--console-frame); }
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
  .btn.danger:hover { background: color-mix(in srgb, var(--console-accent) 7%, transparent); box-shadow: none; transform: none; }
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
  .field-with-assist .field { padding-bottom: 9px; }
  .field-assist-controls { display: flex; align-items: center; gap: 8px; padding: 0 0 12px; }
  .field-assist-run, .field-assist-action { border: 1px solid var(--console-rule-strong); border-radius: 999px; background: var(--console-card); color: var(--console-text-dim); font-family: var(--console-mono); font-size: 9px; padding: 5px 9px; cursor: pointer; }
  .field-assist-run:hover, .field-assist-action:hover { border-color: var(--console-accent); color: var(--console-accent-dim); }
  .field-assist-run[disabled] { opacity: .55; cursor: wait; }
  .field-assist-suggestion { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; padding: 9px; border: 1px solid var(--console-rule-accent); border-radius: 7px; background: var(--console-accent-soft); }
  .field-assist-copy { flex: 1 0 100%; font-size: 12px; line-height: 1.45; color: var(--console-text); }
  .field-assist-tags { display: flex; flex: 1 0 100%; flex-wrap: wrap; gap: 5px; }
  .field-assist-tags code { font-family: var(--console-mono); font-size: 10px; padding: 3px 6px; border-radius: 4px; background: var(--console-card); color: var(--console-text); }
  .field-assist-action.ghost { background: transparent; }

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
  .body-source .cm-selectionBackground, .body-source .cm-focused .cm-selectionBackground { background: color-mix(in srgb, var(--console-accent) 22%, transparent); }
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
