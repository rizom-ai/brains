import { describe, expect, it } from "bun:test";
import { buildConsoleJumpGroups, jumpEntityHit } from "../src/console-jump";

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
      sub: "Note",
      href: "/studio/entities/note/verdigris-pigments",
      tag: "studio",
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
      "/#system",
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

    const system = buildConsoleJumpGroups({
      query: "sys",
      dashboardPath: "/dashboard",
      studioPath: undefined,
      entities: [],
    });
    expect(
      system
        .find((group) => group.id === "tabs")
        ?.items.map((item) => item.href),
    ).toEqual(["/dashboard#system"]);
  });
});

describe("jumpEntityHit", () => {
  it("names a hit by the title, name or question in its metadata", () => {
    expect(
      jumpEntityHit({
        entityType: "post",
        id: "resilience",
        metadata: { title: "Resilience Is Not Redundancy" },
      }).title,
    ).toBe("Resilience Is Not Redundancy");
    expect(
      jumpEntityHit({
        entityType: "skill",
        id: "design-resilient-systems",
        metadata: { name: "Design resilient systems" },
      }).title,
    ).toBe("Design resilient systems");
    expect(
      jumpEntityHit({
        entityType: "faq",
        id: "which-posts",
        metadata: { question: "Which posts are published?" },
      }).title,
    ).toBe("Which posts are published?");
  });

  it("falls back to the id when the entry has no readable name", () => {
    expect(
      jumpEntityHit({ entityType: "note", id: "untitled", metadata: {} }),
    ).toEqual({ entityType: "note", id: "untitled", title: "untitled" });
  });
});
