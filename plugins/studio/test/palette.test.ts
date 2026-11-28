import { describe, expect, spyOn, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { paletteGroups } from "../src/palette";
import {
  studioPaletteSchema,
  type StudioPalette,
} from "../src/palette-contract";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioContextOn } from "./studio-plugins";

class PaletteAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Palette fixture",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({ title: z.string().optional() }),
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

// ⌘K in Studio: the pages the caller may open, then the entries that match.
const destinations = [
  {
    id: "workspace:studio:overview",
    title: "Home",
    href: "/studio/workspaces/studio%3Aoverview",
    primary: true,
  },
  {
    id: "chat",
    title: "Chat",
    href: "/studio/chat",
    primary: true,
    keywords: ["ask", "conversation"],
  },
  {
    id: "collection:post",
    title: "Posts",
    sub: "Library",
    href: "/studio/entities/post",
  },
];
const entry = {
  id: "post:commons",
  title: "The Commons",
  sub: "Post",
  href: "/studio/entities/post/commons",
};

describe("the palette's groups", () => {
  test("offers the main pages before anything is typed", () => {
    expect(paletteGroups({ query: "", destinations, entries: [] })).toEqual({
      groups: [
        {
          id: "pages",
          label: "Pages",
          items: [
            {
              id: "workspace:studio:overview",
              title: "Home",
              href: "/studio/workspaces/studio%3Aoverview",
            },
            { id: "chat", title: "Chat", href: "/studio/chat" },
          ],
        },
      ],
    });
  });

  test("matches pages by title, place and keyword, then lists entries", () => {
    expect(
      paletteGroups({
        query: "ask",
        destinations,
        entries: [],
      }).groups[0]?.items.map((item) => item.title),
    ).toEqual(["Chat"]);
    expect(
      paletteGroups({ query: "posts", destinations, entries: [entry] }),
    ).toEqual({
      groups: [
        {
          id: "pages",
          label: "Pages",
          items: [
            {
              id: "collection:post",
              title: "Posts",
              sub: "Library",
              href: "/studio/entities/post",
            },
          ],
        },
        { id: "entries", label: "Entries", items: [entry] },
      ],
    });
  });

  test("leaves out a group with nothing in it", () => {
    expect(
      paletteGroups({ query: "zzz", destinations, entries: [] }).groups,
    ).toEqual([]);
  });
});

// The route answers any signed-in member, not only admins, as they may read.
describe("the palette route", () => {
  async function route(query: string): Promise<{
    body: StudioPalette;
    searched: unknown[];
  }> {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType("post", baseEntitySchema, new PaletteAdapter());
    const found: BaseEntity = {
      id: "commons",
      entityType: "post",
      content: "# The Commons",
      contentHash: "h",
      created: "2026-11-01T00:00:00.000Z",
      updated: "2026-11-02T00:00:00.000Z",
      visibility: "shared",
      metadata: { title: "The Commons" },
    };
    const search = spyOn(shell.getEntityService(), "search").mockResolvedValue([
      { entity: found, score: 1, excerpt: "" },
    ]);
    const context = await studioContextOn(shell);
    const routes = createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
      resolveAuthPrincipal: async () => ({
        userId: "user",
        personId: "person",
        displayName: "Reader",
        role: "trusted",
        status: "active",
        permissionLevel: "trusted",
        isAnchor: false,
      }),
    });
    const palette = routes.find(
      (candidate) =>
        candidate.path === "/studio/api/palette" && candidate.method === "GET",
    );
    if (!palette) throw new Error("Missing palette route");
    const response = await palette.handler(
      new Request(
        `https://example.com/studio/api/palette?q=${encodeURIComponent(query)}`,
      ),
    );
    expect(response.status).toBe(200);
    return {
      body: studioPaletteSchema.parse(await response.json()),
      searched: search.mock.calls.map(([request]) => request),
    };
  }

  test("finds entries as a trusted member may read them", async () => {
    const { body, searched } = await route("commons");
    expect(searched).toEqual([
      { query: "commons", options: { limit: 6, visibilityScope: "shared" } },
    ]);
    expect(body.groups.at(-1)).toEqual({
      id: "entries",
      label: "Entries",
      items: [
        {
          id: "post:commons",
          title: "The Commons",
          sub: "Post",
          href: "/studio/entities/post/commons",
        },
      ],
    });
  });

  test("searches nothing for a single letter", async () => {
    const { searched } = await route("c");
    expect(searched).toEqual([]);
  });
});

describe("workspace actions in the palette", () => {
  const actions = [
    {
      workspaceId: "site-builder:site",
      workspaceLabel: "Site",
      name: "build-preview",
      label: "Build preview",
    },
  ];

  test("come first, run their action, then open their page", () => {
    expect(
      paletteGroups({
        query: "",
        destinations: [],
        entries: [],
        actions,
        routePath: "/studio",
      }).groups,
    ).toEqual([
      {
        id: "actions",
        label: "Actions",
        items: [
          {
            id: "site-builder:site:build-preview",
            title: "Build preview",
            sub: "Site",
            href: "/studio/workspaces/site-builder%3Asite",
            run: {
              workspaceId: "site-builder:site",
              actionId: "build-preview",
            },
          },
        ],
      },
    ]);
  });

  test("match by their label or their page", () => {
    const titles = (query: string): string[] =>
      paletteGroups({
        query,
        destinations: [],
        entries: [],
        actions,
      }).groups.flatMap((group) => group.items.map((item) => item.title));
    expect(titles("site")).toEqual(["Build preview"]);
    expect(titles("sync")).toEqual([]);
  });
});
