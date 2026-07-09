import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyFieldChange,
  applySuggestionToSelection,
  BodyEditor,
  createBodyEditorState,
  derivePipeline,
  emptyDraft,
  entityTitle,
  Field,
  parseCmsHash,
  PipelineStations,
  SaveStateNotice,
  TypeSwitcher,
} from "./App";
import type { EntityTypeInfo, FieldDescriptor, GitSyncState } from "./api";

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

function renderField(descriptor: FieldDescriptor, value: unknown): string {
  return renderToStaticMarkup(
    createElement(Field, { descriptor, value, onChange: () => {} }),
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
    expect(html).toContain("Posts");
    expect(html).toContain("Site Info");
    // Active styling lands on the button for the active type only.
    expect(html.match(/class="[^"]*active/g)).toHaveLength(1);
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
    expect(html).toContain(">Reload entry<");
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
