import { describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import responsiveStyles from "./responsive.css" with { type: "text" };
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };
import {
  AgentAnswerPanel,
  AGENT_INSTRUCTION_PRESETS,
  applyFieldAssistSuggestion,
  applySuggestionToSelection,
  BodyEditor,
  createBodyEditorState,
  emptyDraft,
  entityPublicationState,
  entityTitle,
  Field,
  FieldAssistControls,
  fieldAssistVariant,
  parseCmsHash,
  MODEL_ASSIST_TARGET,
  styles,
  typeHasPublicationField,
  TypeSwitcher,
} from "./App";
import {
  DeleteDialog,
  derivePipeline,
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import { applyFieldChange } from "./editor-workflow";
import { createCmsQueryClient } from "./query-client";
import type {
  AgentTarget,
  EntityTypeInfo,
  FieldDescriptor,
  GitSyncState,
} from "./api";

const stringField: FieldDescriptor = {
  name: "title",
  label: "Title",
  widget: "string",
};
const textField: FieldDescriptor = {
  name: "summary",
  label: "Summary",
  widget: "text",
  required: false,
};
const booleanField: FieldDescriptor = {
  name: "published",
  label: "Published",
  widget: "boolean",
  required: false,
};
const numberField: FieldDescriptor = {
  name: "weight",
  label: "Weight",
  widget: "number",
  required: false,
};
const selectField: FieldDescriptor = {
  name: "status",
  label: "Status",
  widget: "select",
  options: ["draft", "published"],
};

describe("editor surface styles", () => {
  it("defines the editorial library and manuscript treatment", () => {
    expect(visualRefreshStyles).toContain("232px minmax(0, 1fr)");
    expect(visualRefreshStyles).toContain(".body-preview h1");
    expect(visualRefreshStyles).toContain('"IBM Plex Mono"');
    expect(visualRefreshStyles).toContain(".chip.published");
  });

  it("defines tablet collection switching and phone editing panes", () => {
    expect(responsiveStyles).toContain("@media (max-width: 900px)");
    expect(responsiveStyles).toContain("@media (max-width: 640px)");
    expect(responsiveStyles).toContain('.editor[data-mobile-pane="details"]');
    expect(responsiveStyles).toContain('.studio[data-view="editor"]');
    expect(responsiveStyles).toContain(".cms-mobile-save-status");
    expect(responsiveStyles).toContain("env(safe-area-inset-bottom)");
  });

  it("carries no content-studio wordmark in the crumbbar", () => {
    // The label added noise without wayfinding value; the crumbbar leads
    // with the collection breadcrumb directly.
    expect(styles).not.toContain("crumb-mark");
    expect(visualRefreshStyles).not.toContain("crumb-mark");
    expect(responsiveStyles).not.toContain("crumb-mark");
  });

  it("separates the save bar's status line from the pipeline readout", () => {
    // Without a margin the error line butts against the commit ref:
    // "last write 3bfa1e6× title: …".
    expect(visualRefreshStyles).toMatch(
      /\.pipeline > \.status \{[^}]*margin-left/,
    );
  });

  it("lets the conflict card's reload button keep its ghost treatment", () => {
    // `.pipeline .reload` once styled the button for the dark pipeline
    // bar (frame-on-frame). The button now lives in the floating conflict
    // card, where that rule made it invisible in paper climate — it must
    // fall through to `.btn.ghost`.
    expect(styles).not.toContain(".pipeline .reload");
  });

  it("centers the pill type switcher and keeps row meta on the title line", () => {
    // The desktop rail aligns type rows to the baseline; the 44px mobile
    // pills must center their label instead of pinning it to the top edge.
    expect(responsiveStyles).toMatch(
      /\.rail \.type \{[^}]*align-items: center/,
    );
    // Phone rows: the updated-time sits beside the title, not as a ragged
    // trailing line under the slug.
    expect(responsiveStyles).toMatch(
      /\.row \{[^}]*grid-template-columns: 28px minmax\(0, 1fr\) auto/,
    );
  });
});

function renderField(descriptor: FieldDescriptor, value: unknown): string {
  const client = createCmsQueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Field, { descriptor, value, onChange: () => {} }),
    ),
  );
}

describe("parseCmsHash", () => {
  it("parses a console-jump door into type and id", () => {
    expect(parseCmsHash("#/note/verdigris-pigments")).toEqual({
      entityType: "note",
      id: "verdigris-pigments",
    });
  });

  it("parses a bare type door", () => {
    expect(parseCmsHash("#/post")).toEqual({ entityType: "post" });
  });

  it("keeps slashes inside entity ids", () => {
    expect(parseCmsHash("#/note/journal/2026-07-09")).toEqual({
      entityType: "note",
      id: "journal/2026-07-09",
    });
  });

  it("decodes encoded segments", () => {
    expect(parseCmsHash("#/site%20info/front%20page")).toEqual({
      entityType: "site info",
      id: "front page",
    });
  });

  it("rejects everything else", () => {
    expect(parseCmsHash("")).toBeNull();
    expect(parseCmsHash("#")).toBeNull();
    expect(parseCmsHash("#/")).toBeNull();
    expect(parseCmsHash("#anchor")).toBeNull();
  });
});

describe("Field", () => {
  it("renders a labelled text input for string fields", () => {
    const html = renderField(stringField, "Hello World");
    expect(html).toContain("Title");
    expect(html).toContain('value="Hello World"');
    expect(html).toContain('type="text"');
  });

  it("renders a textarea for long-text fields", () => {
    const html = renderField(textField, "A summary");
    expect(html).toContain("<textarea");
    expect(html).toContain("A summary");
  });

  it("renders a checkbox for boolean fields", () => {
    const html = renderField(booleanField, true);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders a number input for number fields", () => {
    const html = renderField(numberField, 3);
    expect(html).toContain('type="number"');
    expect(html).toContain('value="3"');
  });

  it("renders a select with the descriptor options", () => {
    const html = renderField(selectField, "draft");
    expect(html).toContain("<select");
    expect(html).toContain('value="draft"');
    expect(html).toContain(">published<");
  });

  it("renders ISO datetimes with a native local date-time control", () => {
    const html = renderField(
      { name: "publishedAt", label: "Published", widget: "datetime" },
      "2026-07-11T14:30:00.000Z",
    );
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('value="2026-07-11T14:30"');
  });

  it("renders primitive string lists as removable tags", () => {
    const html = renderField(
      {
        name: "tags",
        label: "Tags",
        widget: "list",
        field: { name: "tags", label: "Tags", widget: "string" },
      },
      ["console", "responsive"],
    );
    expect(html).toContain("console");
    expect(html).toContain('aria-label="Remove responsive"');
    expect(html).toContain('placeholder="Add tag"');
  });

  it("marks required fields", () => {
    const html = renderField(stringField, "");
    expect(html).toContain("required");
  });

  it("renders an upload control for image-reference fields", () => {
    const imageField: FieldDescriptor = {
      name: "coverImageId",
      label: "Cover Image",
      widget: "image",
      required: false,
    };
    const html = renderField(imageField, "image-7");
    expect(html).toContain("Cover Image");
    expect(html).toContain('type="file"');
    expect(html).toContain("image-7");
    expect(html).toContain(">Clear<");

    const empty = renderField(imageField, undefined);
    expect(empty).toContain('type="file"');
    expect(empty).not.toContain(">Clear<");
  });
});

describe("field assists", () => {
  const tagsField: FieldDescriptor = {
    name: "tags",
    label: "Tags",
    widget: "list",
    required: false,
    field: { name: "tags", label: "Tags", widget: "string" },
  };

  it("maps long text and string-list fields to prompt variants", () => {
    expect(fieldAssistVariant(textField)).toBe("summarise");
    expect(fieldAssistVariant(tagsField)).toBe("tag-suggest");
    expect(fieldAssistVariant(stringField)).toBeNull();
    expect(fieldAssistVariant(booleanField)).toBeNull();
  });

  it("patches only the targeted frontmatter draft field", () => {
    const draft = { title: "Keep", summary: "Old" };
    expect(
      applyFieldAssistSuggestion(draft, "summary", "Concise summary"),
    ).toEqual({ title: "Keep", summary: "Concise summary" });
    expect(draft).toEqual({ title: "Keep", summary: "Old" });
    expect(applyFieldAssistSuggestion(draft, "tags", ["cms", "ai"])).toEqual({
      title: "Keep",
      summary: "Old",
      tags: ["cms", "ai"],
    });
  });

  it("renders run controls and reviewable suggestions", () => {
    const summaryIdle = renderToStaticMarkup(
      createElement(FieldAssistControls, {
        descriptor: textField,
        state: { kind: "idle" },
        onRun: () => {},
        onApply: () => {},
        onDiscard: () => {},
      }),
    );
    expect(summaryIdle).toContain("Summarise body");

    const tagsIdle = renderToStaticMarkup(
      createElement(FieldAssistControls, {
        descriptor: tagsField,
        state: { kind: "idle" },
        onRun: () => {},
        onApply: () => {},
        onDiscard: () => {},
      }),
    );
    expect(tagsIdle).toContain("Suggest tags");

    const suggested = renderToStaticMarkup(
      createElement(FieldAssistControls, {
        descriptor: tagsField,
        state: {
          kind: "suggested",
          field: "tags",
          variant: "tag-suggest",
          suggestion: ["cms", "authoring"],
        },
        onRun: () => {},
        onApply: () => {},
        onDiscard: () => {},
      }),
    );
    expect(suggested).toContain("cms");
    expect(suggested).toContain("authoring");
    expect(suggested).toContain("Apply");
    expect(suggested).toContain("Discard");
  });
});

describe("applyFieldChange", () => {
  it("sets string values verbatim", () => {
    expect(applyFieldChange({}, stringField, "New title")).toEqual({
      title: "New title",
    });
  });

  it("drops keys when the value is emptied", () => {
    expect(applyFieldChange({ title: "Old" }, stringField, "")).toEqual({});
  });

  it("coerces number widget values to numbers", () => {
    expect(applyFieldChange({}, numberField, "42")).toEqual({ weight: 42 });
  });

  it("stores booleans as booleans", () => {
    expect(applyFieldChange({}, booleanField, true)).toEqual({
      published: true,
    });
  });

  it("stores tag-list arrays without string coercion", () => {
    const descriptor: FieldDescriptor = {
      name: "tags",
      label: "Tags",
      widget: "list",
    };
    expect(applyFieldChange({}, descriptor, ["cms", "editorial"])).toEqual({
      tags: ["cms", "editorial"],
    });
  });

  it("preserves untouched keys", () => {
    expect(applyFieldChange({ title: "Keep me" }, booleanField, true)).toEqual({
      title: "Keep me",
      published: true,
    });
  });
});

describe("TypeSwitcher", () => {
  const types: EntityTypeInfo[] = [
    {
      entityType: "post",
      label: "Posts",
      isSingleton: false,
      hasBody: true,
      count: 12,
    },
    {
      entityType: "site-info",
      label: "Site Info",
      isSingleton: true,
      hasBody: false,
      count: 1,
    },
  ];

  it("renders one entry per type and marks the active one", () => {
    const html = renderToStaticMarkup(
      createElement(TypeSwitcher, {
        types,
        active: "post",
        onSelect: () => {},
      }),
    );
    expect(html).toContain("Content");
    expect(html).toContain("Posts");
    expect(html).toContain("Site");
    expect(html).toContain("Site Info");
    // Active styling lands on the button for the active type only.
    expect(html.match(/class="[^"]*active/g)).toHaveLength(1);
  });

  it("groups brain machinery under System instead of flooding Content", () => {
    const machinery: EntityTypeInfo[] = [
      {
        entityType: "prompt",
        label: "Prompts",
        isSingleton: false,
        hasBody: true,
        count: 16,
      },
      {
        entityType: "agent",
        label: "Agents",
        isSingleton: false,
        hasBody: false,
        count: 2,
      },
      {
        entityType: "brain-character",
        label: "Brain Characters",
        isSingleton: true,
        hasBody: true,
        count: 1,
      },
    ];
    const html = renderToStaticMarkup(
      createElement(TypeSwitcher, {
        types: [...types, ...machinery],
        active: "post",
        onSelect: () => {},
      }),
    );

    expect(html).toContain("System");
    // System renders last, after the authored-content groups.
    expect(html.indexOf("System")).toBeGreaterThan(html.indexOf("Site Info"));
    expect(html.indexOf("Prompts")).toBeGreaterThan(html.indexOf("System"));
    expect(html.indexOf("Agents")).toBeGreaterThan(html.indexOf("System"));
  });
});

describe("typeHasPublicationField", () => {
  it("shows publication chips only for schemas that model publication", () => {
    expect(typeHasPublicationField([stringField, selectField])).toBe(true);
    expect(typeHasPublicationField([stringField, booleanField])).toBe(true);
    // A prompt-like schema (title + target) has no publication lifecycle;
    // rows must not all read "draft".
    expect(
      typeHasPublicationField([
        stringField,
        { name: "target", label: "Target", widget: "string" },
      ]),
    ).toBe(false);
    expect(typeHasPublicationField([])).toBe(false);
  });
});

describe("emptyDraft", () => {
  it("seeds descriptor defaults and leaves other fields absent", () => {
    const fields: FieldDescriptor[] = [
      { name: "title", label: "Title", widget: "string" },
      {
        name: "status",
        label: "Status",
        widget: "select",
        options: ["draft", "published"],
        default: "draft",
      },
      {
        name: "published",
        label: "Published",
        widget: "boolean",
        required: false,
      },
    ];
    expect(emptyDraft(fields)).toEqual({ status: "draft" });
  });
});

describe("BodyEditor", () => {
  function renderBody(mode: "source" | "split" | "preview"): string {
    return renderToStaticMarkup(
      createElement(BodyEditor, {
        value: "# Heading\n\nBody *prose*.",
        mode,
        onChange: () => {},
        onModeChange: () => {},
      }),
    );
  }

  it("offers the Source | Split | Preview segment control", () => {
    const html = renderBody("source");
    expect(html).toContain(">Source<");
    expect(html).toContain(">Split<");
    expect(html).toContain(">Preview<");
    expect(html.match(/class="[^"]*mode-active/g)).toHaveLength(1);
  });

  it("renders a CodeMirror 6 mount in source mode", () => {
    const html = renderBody("source");
    expect(html).toContain('data-editor="codemirror6"');
    expect(html).toContain('aria-label="Markdown source"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("body-preview");
  });

  it("renders the markdown preview in preview mode", () => {
    const html = renderBody("preview");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("body-preview");
    expect(html).toContain("<h1");
    expect(html).toContain("<em>prose</em>");
  });

  it("renders both panes in split mode", () => {
    const html = renderBody("split");
    expect(html).toContain('data-editor="codemirror6"');
    expect(html).toContain("body-preview");
  });

  it("keeps body content byte-identical in the CM6 state", () => {
    const value = "# Héading\n\nBody *prose*.  \nλ\n";
    const state = createBodyEditorState(value);
    expect(state.doc.toString()).toBe(value);
  });

  it("preserves typing, paste, unicode, and trailing whitespace edits", () => {
    let state = createBodyEditorState("one\n");
    state = state.update({ changes: { from: 4, insert: "two  \n" } }).state;
    state = state.update({ changes: { from: 0, insert: "λ paste\n\n" } }).state;
    expect(state.doc.toString()).toBe("λ paste\n\none\ntwo  \n");
  });

  it("renders the assist controls when assist context is provided", () => {
    const html = renderToStaticMarkup(
      createElement(BodyEditor, {
        value: "Original body",
        mode: "source",
        onChange: () => {},
        onModeChange: () => {},
        assist: { entityType: "post", frontmatter: { title: "Hello" } },
      }),
    );
    expect(html).toContain("Rewrite selection");
    expect(html).toContain("AI selection rewrite");
    expect(html).not.toContain('aria-label="Assist target"');
  });

  it("defaults the target dropdown to model and lists approved agents", () => {
    const agents: AgentTarget[] = [
      { id: "docs.example", label: "Docs" },
      { id: "review.example", label: "Reviewer" },
    ];
    const html = renderToStaticMarkup(
      createElement(BodyEditor, {
        value: "Original body",
        mode: "source",
        onChange: () => {},
        onModeChange: () => {},
        assist: {
          entityType: "post",
          frontmatter: { title: "Hello" },
          agents,
        },
      }),
    );

    expect(MODEL_ASSIST_TARGET).toBe("model");
    expect(html).toContain('aria-label="Assist target"');
    expect(html).toContain('<option value="model" selected="">Model</option>');
    expect(html).toContain('value="docs.example"');
    expect(html).toContain("Docs — docs.example");
    expect(AGENT_INSTRUCTION_PRESETS.map((preset) => preset.label)).toEqual([
      "Review",
      "Fact-check",
      "Related",
      "Rewrite",
    ]);
  });
});

describe("AgentAnswerPanel", () => {
  const renderAnswer = (onReplace?: () => void): string =>
    renderToStaticMarkup(
      createElement(AgentAnswerPanel, {
        agentId: "docs.example",
        response: "**Accurate**, with one caveat.",
        onReplace,
        onDismiss: () => {},
      }),
    );

  it("keeps ordinary answers dismiss-only", () => {
    const html = renderAnswer();

    expect(html).toContain("Answer from");
    expect(html).toContain("docs.example");
    expect(html).toContain('data-streamdown="strong"');
    expect(html).toContain("Accurate");
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("Replace selection");
    expect(html).not.toContain(">Accept<");
  });

  it("offers replacement when the ask used rewrite mode", () => {
    const html = renderAnswer(() => {});

    expect(html).toContain("Replace selection");
    expect(html).toContain("Dismiss");
  });
});

describe("applySuggestionToSelection", () => {
  it("replaces only the selected range", () => {
    expect(
      applySuggestionToSelection(
        "Alpha beta gamma",
        { from: 6, to: 10 },
        "BETA",
      ),
    ).toBe("Alpha BETA gamma");
  });

  it("supports multiline markdown suggestions", () => {
    expect(
      applySuggestionToSelection("A\nold\nZ", { from: 2, to: 5 }, "new\ntext"),
    ).toBe("A\nnew\ntext\nZ");
  });

  it("rejects stale or invalid ranges", () => {
    expect(() =>
      applySuggestionToSelection("short", { from: 2, to: 99 }, "x"),
    ).toThrow(RangeError);
  });
});

describe("SaveStateNotice", () => {
  it("renders nothing while idle or saving", () => {
    for (const kind of ["idle", "saving"] as const) {
      expect(
        renderToStaticMarkup(
          createElement(SaveStateNotice, {
            state: { kind },
            onReload: () => {},
          }),
        ),
      ).toBe("");
    }
  });

  it("confirms a save landed in the entity service", () => {
    const html = renderToStaticMarkup(
      createElement(SaveStateNotice, {
        state: { kind: "saved" },
        onReload: () => {},
      }),
    );
    expect(html).toContain("entity service");
  });

  it("says so when the save changed nothing", () => {
    const html = renderToStaticMarkup(
      createElement(SaveStateNotice, {
        state: { kind: "saved", noop: true },
        onReload: () => {},
      }),
    );
    expect(html).toContain("No changes");
  });

  it("offers a reload action on write conflicts", () => {
    const html = renderToStaticMarkup(
      createElement(SaveStateNotice, {
        state: {
          kind: "conflict",
          message: "This entry changed since it was opened",
        },
        onReload: () => {},
      }),
    );
    expect(html).toContain("changed since it was opened");
    expect(html).toContain("The manuscript changed elsewhere");
    expect(html).toContain(">Reload latest<");
  });

  it("shows plain errors without a reload action", () => {
    const html = renderToStaticMarkup(
      createElement(SaveStateNotice, {
        state: { kind: "error", message: "title: Required" },
        onReload: () => {},
      }),
    );
    expect(html).toContain("title: Required");
    expect(html).not.toContain("Reload entry");
  });
});

describe("DeleteDialog", () => {
  it("explains recoverability and exposes explicit keep/delete actions", () => {
    const html = renderToStaticMarkup(
      createElement(DeleteDialog, {
        entityId: "field-notes",
        onCancel: () => {},
        onConfirm: () => {},
      }),
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("field-notes");
    expect(html).toContain("recoverable in git");
    expect(html).toContain("Keep entry");
    expect(html).toContain("Delete entry");
  });
});

describe("derivePipeline", () => {
  const git = (overrides: Partial<GitSyncState> = {}): GitSyncState => ({
    branch: "main",
    hasChanges: false,
    ahead: 0,
    behind: 0,
    lastCommit: "abc1234def5678",
    remote: "origin/main",
    ...overrides,
  });

  it("shows the last write ref while idle", () => {
    const view = derivePipeline({
      save: { kind: "idle" },
      git: git(),
      baselineCommit: "abc1234def5678",
    });
    expect(view).toEqual({
      db: "pending",
      exported: "pending",
      committed: "pending",
      commitRef: "abc1234",
    });
  });

  it("activates the entity-db station while the save is in flight", () => {
    const view = derivePipeline({
      save: { kind: "saving" },
      git: git(),
      baselineCommit: "abc1234def5678",
    });
    expect(view.db).toBe("active");
    expect(view.exported).toBe("pending");
    expect(view.committed).toBe("pending");
  });

  it("marks export done and commit active while the tree is dirty", () => {
    const view = derivePipeline({
      save: { kind: "saved" },
      git: git({ hasChanges: true }),
      baselineCommit: "abc1234def5678",
    });
    expect(view.db).toBe("done");
    expect(view.exported).toBe("done");
    expect(view.committed).toBe("active");
  });

  it("settles once a new commit lands on a clean tree", () => {
    const view = derivePipeline({
      save: { kind: "saved" },
      git: git({ lastCommit: "f00baa1234567" }),
      baselineCommit: "abc1234def5678",
    });
    expect(view).toEqual({
      db: "done",
      exported: "done",
      committed: "done",
      commitRef: "f00baa1",
    });
  });

  it("keeps the export station active until the change reaches git", () => {
    // Clean tree, commit unchanged: the export has not become visible yet.
    const view = derivePipeline({
      save: { kind: "saved" },
      git: git(),
      baselineCommit: "abc1234def5678",
    });
    expect(view.db).toBe("done");
    expect(view.exported).toBe("active");
    expect(view.committed).toBe("pending");
  });

  it("stops at the export station when git is not configured", () => {
    const view = derivePipeline({
      save: { kind: "saved" },
      git: null,
      baselineCommit: null,
    });
    expect(view.db).toBe("done");
    expect(view.exported).toBe("done");
    expect(view.committed).toBe("pending");
    expect(view.commitRef).toBeNull();
  });

  it("settles immediately when the save changed nothing", () => {
    // A no-op save writes nothing and emits no event: there is no export
    // or commit to wait for — everything already reflects the content.
    const view = derivePipeline({
      save: { kind: "saved", noop: true },
      git: git(),
      baselineCommit: "abc1234def5678",
    });
    expect(view).toEqual({
      db: "done",
      exported: "done",
      committed: "done",
      commitRef: "abc1234",
    });
  });

  it("resets to pending after a conflict or error", () => {
    for (const save of [
      { kind: "conflict" as const, message: "changed" },
      { kind: "error" as const, message: "nope" },
    ]) {
      const view = derivePipeline({
        save,
        git: git(),
        baselineCommit: "abc1234def5678",
      });
      expect(view.db).toBe("pending");
      expect(view.exported).toBe("pending");
      expect(view.committed).toBe("pending");
    }
  });
});

describe("PipelineStations", () => {
  it("renders the three stations with their derived states", () => {
    const html = renderToStaticMarkup(
      createElement(PipelineStations, {
        view: {
          db: "done",
          exported: "done",
          committed: "active",
          commitRef: "abc1234",
        },
        gitConfigured: true,
      }),
    );
    expect(html).toContain("entity db");
    expect(html).toContain("exported to file");
    expect(html).toContain("committed");
    expect(html.match(/station done/g)).toHaveLength(2);
    expect(html.match(/station active/g)).toHaveLength(1);
  });

  it("animates the track between a done and an active station", () => {
    const html = renderToStaticMarkup(
      createElement(PipelineStations, {
        view: {
          db: "done",
          exported: "done",
          committed: "active",
          commitRef: null,
        },
        gitConfigured: true,
      }),
    );
    expect(html.match(/track flowing/g)).toHaveLength(1);
  });

  it("shows the last write ref", () => {
    const html = renderToStaticMarkup(
      createElement(PipelineStations, {
        view: {
          db: "pending",
          exported: "pending",
          committed: "pending",
          commitRef: "abc1234",
        },
        gitConfigured: true,
      }),
    );
    expect(html).toContain("last write");
    expect(html).toContain("abc1234");
  });

  it("drops the commit station when git is not configured", () => {
    const html = renderToStaticMarkup(
      createElement(PipelineStations, {
        view: {
          db: "done",
          exported: "done",
          committed: "pending",
          commitRef: null,
        },
        gitConfigured: false,
      }),
    );
    expect(html).toContain("entity db");
    expect(html).toContain("exported to file");
    expect(html).not.toContain(">committed<");
    expect(html).toContain("no git remote");
  });
});

describe("entityPublicationState", () => {
  it("recognizes explicit and boolean publication metadata", () => {
    const base = { id: "abc", entityType: "post", updated: "" };
    expect(
      entityPublicationState({
        ...base,
        frontmatter: { status: "published" },
      }),
    ).toBe("published");
    expect(
      entityPublicationState({
        ...base,
        frontmatter: { published: true },
      }),
    ).toBe("published");
    expect(entityPublicationState({ ...base, frontmatter: {} })).toBe("draft");
  });
});

describe("entityTitle", () => {
  it("prefers the frontmatter title", () => {
    expect(
      entityTitle({
        id: "abc",
        entityType: "post",
        frontmatter: { title: "Hello" },
        updated: "",
      }),
    ).toBe("Hello");
  });

  it("falls back to the id", () => {
    expect(
      entityTitle({
        id: "abc",
        entityType: "post",
        frontmatter: {},
        updated: "",
      }),
    ).toBe("abc");
  });
});
