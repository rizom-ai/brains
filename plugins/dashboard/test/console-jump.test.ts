import { describe, expect, it } from "bun:test";
import { buildConsoleJumpGroups } from "../src/console-jump";

describe("buildConsoleJumpGroups", () => {
  it("maps the People console jump into its Studio workspace", () => {
    const groups = buildConsoleJumpGroups({
      query: "peop",
      groups: [],
      dashboardPath: "/dashboard",
      studioPath: "/studio",
      entities: [],
    });

    expect(groups.find((group) => group.id === "surfaces")?.items).toEqual([
      {
        id: "surface/people",
        title: "People",
        sub: "Access and identity",
        href: "/studio/workspaces/admin%3Apeople",
        tag: "studio",
      },
    ]);
  });

  it("maps entity hits to Studio edit doors", () => {
    const groups = buildConsoleJumpGroups({
      query: "verd",
      groups: [],
      dashboardPath: "/",
      studioPath: "/studio",
      entities: [
        {
          entityType: "note",
          id: "verdigris-pigments",
          title: "Verdigris pigments",
        },
      ],
    });

    expect(groups[0]).toMatchObject({ id: "entities", label: "Entities" });
    expect(groups[0]?.items[0]).toEqual({
      id: "note/verdigris-pigments",
      title: "Verdigris pigments",
      sub: "note",
      href: "/studio/entities/note/verdigris-pigments",
      tag: "edit in studio",
    });
  });

  it("omits the entities group when no Studio is registered", () => {
    const groups = buildConsoleJumpGroups({
      query: "verd",
      groups: [],
      dashboardPath: "/",
      studioPath: undefined,
      entities: [
        {
          entityType: "note",
          id: "verdigris-pigments",
          title: "Verdigris pigments",
        },
      ],
    });

    expect(groups.find((g) => g.id === "entities")).toBeUndefined();
  });

  it("lists dashboard tabs with anchors, filtered by the query", () => {
    const groups = buildConsoleJumpGroups({
      query: "",
      groups: ["publishing", "system", "knowledge"],
      dashboardPath: "/",
      studioPath: undefined,
      entities: [],
    });

    const tabs = groups.find((g) => g.id === "tabs");
    expect(tabs?.items.map((i) => i.href)).toContain("/#publishing");
    expect(tabs?.items.map((i) => i.href)).toContain("/#system");

    const filtered = buildConsoleJumpGroups({
      query: "publ",
      groups: ["publishing", "system"],
      dashboardPath: "/dashboard",
      studioPath: undefined,
      entities: [],
    });
    expect(
      filtered.find((g) => g.id === "tabs")?.items.map((i) => i.href),
    ).toEqual(["/dashboard#publishing"]);
  });

  it("deduplicates groups and keeps dashboard tab order", () => {
    const groups = buildConsoleJumpGroups({
      query: "",
      groups: ["system", "publishing", "publishing", "knowledge"],
      dashboardPath: "/",
      studioPath: undefined,
      entities: [],
    });

    const titles = groups.find((g) => g.id === "tabs")?.items.map((i) => i.id);
    expect(titles).toEqual([...new Set(titles)]);
    // publishing sorts ahead of system per the dashboard's group order.
    expect(titles?.indexOf("tab/publishing")).toBeLessThan(
      titles?.indexOf("tab/system") ?? -1,
    );
  });
});
