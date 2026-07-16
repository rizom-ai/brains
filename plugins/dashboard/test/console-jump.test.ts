import { describe, expect, it } from "bun:test";
import { buildConsoleJumpGroups } from "../src/console-jump";

describe("buildConsoleJumpGroups", () => {
  it("adds the registered admin console surface", () => {
    const groups = buildConsoleJumpGroups({
      query: "peop",
      groups: [],
      dashboardPath: "/dashboard",
      cmsPath: undefined,
      adminPath: "/admin",
      entities: [],
    });

    expect(groups.find((group) => group.id === "surfaces")?.items).toEqual([
      {
        id: "surface/admin",
        title: "Admin",
        sub: "People, access and identity",
        href: "/admin",
        tag: "console",
      },
    ]);
  });

  it("maps entity hits to CMS edit doors", () => {
    const groups = buildConsoleJumpGroups({
      query: "verd",
      groups: [],
      dashboardPath: "/",
      cmsPath: "/cms",
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
      href: "/cms#/note/verdigris-pigments",
      tag: "edit in cms",
    });
  });

  it("omits the entities group when no CMS is registered", () => {
    const groups = buildConsoleJumpGroups({
      query: "verd",
      groups: [],
      dashboardPath: "/",
      cmsPath: undefined,
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
      cmsPath: undefined,
      entities: [],
    });

    const tabs = groups.find((g) => g.id === "tabs");
    expect(tabs?.items.map((i) => i.href)).toContain("/#publishing");
    expect(tabs?.items.map((i) => i.href)).toContain("/#system");

    const filtered = buildConsoleJumpGroups({
      query: "publ",
      groups: ["publishing", "system"],
      dashboardPath: "/dashboard",
      cmsPath: undefined,
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
      cmsPath: undefined,
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
