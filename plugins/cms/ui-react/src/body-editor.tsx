import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Streamdown } from "streamdown";
import { requestAgentAnswer, requestAssist, type AgentTarget } from "./api";
import { errorMessage } from "./ui-utils";

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
