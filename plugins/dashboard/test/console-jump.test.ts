import { describe, expect, it } from "bun:test";
import { buildConsoleJumpGroups, jumpEntityHit } from "../src/console-jump";

const destinations = [
  {
    id: "studio/overview",
    title: "Overview",
    sub: "Studio",
    href: "/studio",
    primary: true,
  },
  {
    id: "studio/chat",
    title: "Chat",
    sub: "Studio",
    href: "/chat",
    primary: true,
  },
  {
    id: "studio/admin:administration",
    title: "Administration",
    sub: "Studio",
    href: "/studio/workspaces/admin%3Aadministration",
    primary: true,
    keywords: ["people", "access"],
  },
  {
    id: "studio/note",
    title: "Notes",
    sub: "Library",
    href: "/studio/entities/note",
  },
];

describe("buildConsoleJumpGroups", () => {
  it("offers Studio's own pages first, before anything is typed", () => {
    const groups = buildConsoleJumpGroups({
      query: "",
      dashboardPath: "/dashboard",
      studioPath: "/studio",
      entities: [],
      destinations,
    });

    expect(groups[0]?.label).toBe("Studio");
    expect(groups[0]?.items.map((item) => item.title)).toEqual([
      "Overview",
      "Chat",
      "Administration",
    ]);
    expect(groups[0]?.items[0]).toEqual({
      id: "studio/overview",
      title: "Overview",
      sub: "Studio",
      href: "/studio",
      tag: "studio",
    });
  });

  it("finds a Studio page by its title, place or keywords", () => {
    const find = (query: string): string[] =>
      buildConsoleJumpGroups({
        query,
        dashboardPath: "/dashboard",
        studioPath: "/studio",
        entities: [],
        destinations,
      })
        .find((group) => group.id === "studio")
        ?.items.map((item) => item.title) ?? [];

    expect(find("note")).toEqual(["Notes"]);
    expect(find("library")).toEqual(["Notes"]);
    expect(find("access")).toContain("Administration");
  });

  it("maps the People console jump into its Studio workspace", () => {
    const groups = buildConsoleJumpGroups({
      query: "peop",
      dashboardPath: "/dashboard",
      studioPath: "/studio",
      entities: [],
      destinations: [],
    });

    expect(groups.find((group) => group.id === "studio")?.items).toEqual([
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
      destinations: [],
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
      destinations: [],
    });

    expect(groups.find((g) => g.id === "entities")).toBeUndefined();
  });

  it("lists exactly the public card tabs with anchors and query filtering", () => {
    const groups = buildConsoleJumpGroups({
      query: "",
      dashboardPath: "/",
      studioPath: undefined,
      entities: [],
      destinations: [],
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
      destinations: [],
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
      destinations: [],
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
