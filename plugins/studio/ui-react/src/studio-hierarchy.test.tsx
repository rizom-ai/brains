/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StudioFolderTrail,
  StudioFolderRows,
  StudioDestination,
} from "./studio-hierarchy";
import { ApiError } from "./api";
import { studioCollectionQuerySchema } from "../../src/collection-query";
import {
  editorWorkflowReducer,
  initialEditorWorkflowState,
  creationIdPath,
} from "./editor-workflow";

describe("Studio folder presentation", () => {
  test("root has no redundant breadcrumb and a flat collection has no folder section", () => {
    const query = studioCollectionQuerySchema.parse({});
    expect(
      renderToStaticMarkup(
        <StudioFolderTrail
          collectionLabel="Book sections"
          collectionPath="/studio/entities/section"
          query={query}
          onNavigate={() => {}}
        />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <StudioFolderRows
          folders={[]}
          collectionPath="/studio/entities/section"
          query={query}
          onNavigate={() => {}}
        />,
      ),
    ).toBe("");
  });
  test("nested breadcrumbs link structured prefixes, leaving the current segment plain", () => {
    const query = studioCollectionQuerySchema.parse({
      prefix: ["book-1", "part-1"],
    });
    const html = renderToStaticMarkup(
      <StudioFolderTrail
        collectionLabel="Book sections"
        collectionPath="/studio/entities/section"
        query={query}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Folder trail"');
    expect(html).toContain("Book 1");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Part 1");
    expect(html).toContain("prefix=%5B%22book-1%22%5D");
    expect(html).not.toContain("book-1:part-1");
  });
  test("folder rows use the existing row grammar with complete descendant counts", () => {
    const html = renderToStaticMarkup(
      <StudioFolderRows
        folders={[{ path: ["book-1"], name: "book-1", descendantCount: 24 }]}
        collectionPath="/studio/entities/section"
        query={studioCollectionQuerySchema.parse({})}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain("data-studio-folder");
    expect(html).toContain("Book 1");
    expect(html).toContain("24 entries");
    expect(html).toContain("complete");
    expect(html).not.toContain("data-studio-record");
  });
  test("creation shows server-returned identity and placement, never inventing a file path", () => {
    const html = renderToStaticMarkup(
      <StudioDestination
        segment="chapter-2"
        onSegmentChange={() => {}}
        preview={{
          idPath: ["book-1", "chapter-2"],
          entityId: "opaque-returned-id",
          entityLeaf: { start: 0, end: 18 },
          filePath: "owner-returned-path.md",
          fileLeaf: null,
        }}
        pending={false}
        error={null}
      />,
    );
    expect(html).toContain("Segment");
    expect(html).toContain("opaque-returned-id");
    expect(html).toContain("owner-returned-path.md");
    expect(html).toContain("<strong>&quot;chapter-2&quot;</strong>");
    expect(html).not.toContain("book-1:chapter-2");
    const unavailable = renderToStaticMarkup(
      <StudioDestination
        segment="intro"
        onSegmentChange={() => {}}
        preview={{
          idPath: ["intro"],
          entityId: "intro",
          entityLeaf: { start: 0, end: 5 },
          filePath: null,
          fileLeaf: null,
        }}
        pending={false}
        error={null}
      />,
    );
    expect(unavailable).toContain("File preview unavailable");
  });
  test("emphasizes the new segment in each destination using owner-supplied text ranges", () => {
    const html = renderToStaticMarkup(
      <StudioDestination
        segment=".md"
        onSegmentChange={() => {}}
        preview={{
          idPath: ["book", ".md"],
          entityId: "book:.md",
          entityLeaf: { start: 5, end: 8 },
          filePath: "book/.md.md",
          fileLeaf: { start: 5, end: 8 },
        }}
        pending={false}
        error={null}
      />,
    );
    expect(html.match(/<strong>/g)).toHaveLength(3);
    expect(html).toContain("book/<strong>.md</strong>.md");
    expect(html).toContain("book:<strong>.md</strong>");
  });

  test("does not blame Segment for an unrelated frontmatter validation error", () => {
    const html = renderToStaticMarkup(
      <StudioDestination
        segment="intro"
        onSegmentChange={() => {}}
        preview={null}
        pending={false}
        error={
          new ApiError(400, "Invalid frontmatter", [
            { path: ["title"], message: "Title is required" },
          ])
        }
      />,
    );
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain("Title is required");
  });

  test("creation fixes its parent prefix and only edits the leaf segment", () => {
    const started = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      draft: {},
      prefix: ["book-1", "part-1"],
    });
    const changed = editorWorkflowReducer(started, {
      type: "segmentChanged",
      segment: "chapter-2",
    });
    expect(creationIdPath(changed.mode)).toEqual([
      "book-1",
      "part-1",
      "chapter-2",
    ]);
    expect(creationIdPath(started.mode)).toEqual(["book-1", "part-1", ""]);
    expect(changed.draft).toEqual({});
  });
});
