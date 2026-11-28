import { describe, expect, it } from "bun:test";
import { paletteSections, stepActive } from "./palette-model";

const types = [
  {
    entityType: "post",
    singularLabel: "Post",
    classification: "content",
    isSingleton: false,
    canCreate: true,
  },
  {
    entityType: "note",
    singularLabel: "Note",
    classification: "content",
    isSingleton: false,
    canCreate: true,
  },
  {
    entityType: "prompt",
    singularLabel: "Prompt",
    classification: "system",
    isSingleton: false,
    canCreate: true,
  },
  {
    entityType: "site-info",
    singularLabel: "Site info",
    classification: "content",
    isSingleton: true,
    canCreate: true,
  },
  {
    entityType: "topic",
    singularLabel: "Topic",
    classification: "content",
    isSingleton: false,
    canCreate: false,
  },
];

const remote = {
  groups: [
    {
      id: "pages" as const,
      label: "Pages",
      items: [{ id: "chat", title: "Chat", href: "/studio/chat" }],
    },
  ],
};

// ⌘K: what is open first, then what you can do, then where you can go.
describe("the palette's sections", () => {
  it("offers asking about the open entry first, then actions, then pages", () => {
    const sections = paletteSections({
      query: "",
      types,
      hasChat: true,
      openEntry: { typeLabel: "post" },
      remote,
    });
    expect(sections.map((section) => section.label)).toEqual([
      "For this post",
      "Actions",
      "Pages",
    ]);
    expect(sections[0]?.items).toEqual([
      {
        id: "ask-entry",
        title: "Ask about this post",
        kbd: "⌘J",
        command: { kind: "ask-entry" },
      },
    ]);
    expect(sections[1]?.items.map((item) => item.title)).toEqual([
      "New post",
      "New note",
      "Switch light and dark",
    ]);
  });

  it("matches actions to what is typed, and offers to ask the brain it", () => {
    const sections = paletteSections({
      query: "note",
      types,
      hasChat: true,
      openEntry: null,
      remote: null,
    });
    expect(sections).toEqual([
      {
        id: "actions",
        label: "Actions",
        items: [
          {
            id: "create:note",
            title: "New note",
            command: { kind: "create", entityType: "note" },
          },
          {
            id: "ask-brain",
            title: "Ask your brain “note”",
            command: { kind: "ask-brain", question: "note" },
          },
        ],
      },
    ]);
  });

  it("offers nothing Chat would do where the brain has no Chat", () => {
    const titles = paletteSections({
      query: "x",
      types: [],
      hasChat: false,
      openEntry: { typeLabel: "post" },
      remote: null,
    }).flatMap((section) => section.items.map((item) => item.title));
    expect(titles).toEqual([]);
  });
});

describe("moving through the palette", () => {
  it("wraps at either end", () => {
    expect(stepActive(0, -1, 3)).toBe(2);
    expect(stepActive(2, 1, 3)).toBe(0);
    expect(stepActive(0, 1, 0)).toBe(-1);
  });
});

describe("actions a page offers", () => {
  it("join the palette's own actions, and run before their page opens", () => {
    const sections = paletteSections({
      query: "build",
      types: [],
      hasChat: false,
      openEntry: null,
      remote: {
        groups: [
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
        ],
      },
    });
    expect(sections).toEqual([
      {
        id: "actions",
        label: "Actions",
        items: [
          {
            id: "actions:site-builder:site:build-preview",
            title: "Build preview",
            sub: "Site",
            command: {
              kind: "run",
              workspaceId: "site-builder:site",
              actionId: "build-preview",
              href: "/studio/workspaces/site-builder%3Asite",
            },
          },
        ],
      },
    ]);
  });
});
