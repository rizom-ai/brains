import { describe, expect, it } from "bun:test";
import { buildConsoleJumpGroups } from "../src/console-jump";

describe("buildConsoleJumpGroups", () => {
  it("maps the People console jump into its Studio workspace", () => {
    const groups = buildConsoleJumpGroups({
      query: "peop",
      dashboardPath: "/dashboard",
      studioPath: "/studio",
      entities: [],
    });

    expect(groups.find((group) => group.id === "surfaces")?.items).toEqual([
      {
        id: "surface/people",
        title: "People",
        sub: "Access and identity",
        href: "/studio/workspaces/admin%3Aadministration?tab=people",
        tag: "studio",
      },
    ]);
  });

  it("maps entity hits to Studio edit doors", () => {
    const groups = buildConsoleJumpGroups({
      query: "verd",
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

  it("lists exactly the public card tabs with anchors and query filtering", () => {
    const groups = buildConsoleJumpGroups({
      query: "",
      dashboardPath: "/",
      studioPath: undefined,
      entities: [],
    });

    const tabs = groups.find((group) => group.id === "tabs");
    expect(tabs?.items.map((item) => item.href)).toEqual([
      "/#overview",
      "/#knowledge",
      "/#network",
    ]);

    const filtered = buildConsoleJumpGroups({
      query: "net",
      dashboardPath: "/dashboard",
      studioPath: undefined,
      entities: [],
    });
    expect(
      filtered
        .find((group) => group.id === "tabs")
        ?.items.map((item) => item.href),
    ).toEqual(["/dashboard#network"]);
  });
});
