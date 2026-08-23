import { describe, expect, it } from "bun:test";
import {
  studioCollectionPath,
  studioCreatePath,
  studioEntityPath,
  studioWorkspacePath,
  normalizeStudioBasePath,
  parseStudioPath,
} from "../src/studio-paths";

describe("Studio canonical paths", () => {
  it("normalizes default and custom base paths", () => {
    expect(normalizeStudioBasePath("/studio")).toBe("/studio");
    expect(normalizeStudioBasePath("/studio/")).toBe("/studio");
    expect(normalizeStudioBasePath("/")).toBe("");
  });

  it("formats collections, entities, and workspaces under a custom base", () => {
    expect(studioCollectionPath("/studio", "field note")).toBe(
      "/studio/entities/field%20note",
    );
    expect(
      studioEntityPath("/studio", "note", "journal/2026-07-09 % complete"),
    ).toBe("/studio/entities/note/journal%2F2026-07-09%20%25%20complete");
    expect(studioCreatePath("/studio", "note")).toBe(
      "/studio/entities/note?mode=create",
    );
    expect(studioWorkspacePath("/studio", "publish desk")).toBe(
      "/studio/workspaces/publish%20desk",
    );
  });

  it("parses home, collection, entity, and workspace targets", () => {
    expect(parseStudioPath("/studio", "/studio")).toEqual({ kind: "home" });
    expect(parseStudioPath("/studio/entities/post", "/studio")).toEqual({
      kind: "collection",
      entityType: "post",
    });
    expect(
      parseStudioPath(
        "/studio/entities/note/journal%2F2026-07-09%20%25%20complete",
        "/studio",
      ),
    ).toEqual({
      kind: "entity",
      entityType: "note",
      id: "journal/2026-07-09 % complete",
    });
    expect(parseStudioPath("/studio/workspaces/site", "/studio/")).toEqual({
      kind: "workspace",
      workspaceId: "site",
    });
    expect(parseStudioPath("/studio/entities/note/new", "/studio")).toEqual({
      kind: "entity",
      entityType: "note",
      id: "new",
    });
  });

  it("accepts an unescaped slash-bearing id as the entity remainder", () => {
    expect(
      parseStudioPath("/studio/entities/note/journal/2026/day-one", "/studio"),
    ).toEqual({
      kind: "entity",
      entityType: "note",
      id: "journal/2026/day-one",
    });
  });

  it("rejects path-boundary collisions, missing segments, and malformed encoding", () => {
    for (const pathname of [
      "/studio-other/entities/post",
      "/studio/entities",
      "/studio/entities/post/",
      "/studio/workspaces",
      "/studio/workspaces/site/extra",
      "/studio/entities/%E0%A4%A",
      "/studio/unknown/post",
    ]) {
      expect(parseStudioPath(pathname, "/studio")).toEqual({
        kind: "not-found",
        pathname,
      });
    }
  });
});
