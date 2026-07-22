import { describe, expect, it } from "bun:test";
import {
  cmsCollectionPath,
  cmsEntityPath,
  cmsWorkspacePath,
  normalizeCmsBasePath,
  parseCmsPath,
} from "../src/cms-paths";

describe("CMS canonical paths", () => {
  it("normalizes default and custom base paths", () => {
    expect(normalizeCmsBasePath("/cms")).toBe("/cms");
    expect(normalizeCmsBasePath("/studio/")).toBe("/studio");
    expect(normalizeCmsBasePath("/")).toBe("");
  });

  it("formats collections, entities, and workspaces under a custom base", () => {
    expect(cmsCollectionPath("/studio", "field note")).toBe(
      "/studio/entities/field%20note",
    );
    expect(
      cmsEntityPath("/studio", "note", "journal/2026-07-09 % complete"),
    ).toBe("/studio/entities/note/journal%2F2026-07-09%20%25%20complete");
    expect(cmsWorkspacePath("/studio", "publish desk")).toBe(
      "/studio/workspaces/publish%20desk",
    );
  });

  it("parses home, collection, entity, and workspace targets", () => {
    expect(parseCmsPath("/cms", "/cms")).toEqual({ kind: "home" });
    expect(parseCmsPath("/cms/entities/post", "/cms")).toEqual({
      kind: "collection",
      entityType: "post",
    });
    expect(
      parseCmsPath(
        "/cms/entities/note/journal%2F2026-07-09%20%25%20complete",
        "/cms",
      ),
    ).toEqual({
      kind: "entity",
      entityType: "note",
      id: "journal/2026-07-09 % complete",
    });
    expect(parseCmsPath("/studio/workspaces/site", "/studio/")).toEqual({
      kind: "workspace",
      workspaceId: "site",
    });
  });

  it("accepts an unescaped slash-bearing id as the entity remainder", () => {
    expect(
      parseCmsPath("/cms/entities/note/journal/2026/day-one", "/cms"),
    ).toEqual({
      kind: "entity",
      entityType: "note",
      id: "journal/2026/day-one",
    });
  });

  it("rejects path-boundary collisions, missing segments, and malformed encoding", () => {
    for (const pathname of [
      "/cms-other/entities/post",
      "/cms/entities",
      "/cms/entities/post/",
      "/cms/workspaces",
      "/cms/workspaces/site/extra",
      "/cms/entities/%E0%A4%A",
      "/cms/unknown/post",
    ]) {
      expect(parseCmsPath(pathname, "/cms")).toEqual({
        kind: "not-found",
        pathname,
      });
    }
  });
});
