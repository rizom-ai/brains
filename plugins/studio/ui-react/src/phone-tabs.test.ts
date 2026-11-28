import { describe, expect, it } from "bun:test";
import { phoneTabs } from "./phone-tabs";

const groups = [
  {
    area: "home" as const,
    label: "Home",
    options: [
      { value: "workspace:studio:overview", href: "/studio", label: "Home" },
      {
        value: "workspace:unified-inbox:inbox",
        href: "/studio/workspaces/unified-inbox%3Ainbox",
        label: "Inbox",
        attention: 3,
      },
    ],
  },
  {
    area: "library" as const,
    label: "Library",
    options: [
      {
        value: "type:post",
        href: "/studio/entities/post",
        label: "Posts",
        tally: 12,
      },
      { value: "type:note", href: "/studio/entities/note", label: "Notes" },
    ],
  },
  {
    area: "chat" as const,
    label: "Chat",
    options: [{ value: "workspace:chat", href: "/chat", label: "Chat" }],
  },
];

// On a phone the five sections are a tab bar, with the same lights.
describe("the phone's tabs", () => {
  it("open each section's main page, and mark the one you are in", () => {
    expect(
      phoneTabs(groups, "type:note").map((tab) => ({
        area: tab.area,
        main: tab.main.value,
        active: tab.active,
        more: tab.options.length > 1,
      })),
    ).toEqual([
      {
        area: "home",
        main: "workspace:studio:overview",
        active: false,
        more: true,
      },
      { area: "library", main: "type:post", active: true, more: true },
      { area: "chat", main: "workspace:chat", active: false, more: false },
    ]);
  });

  it("light a section when anything in it needs you", () => {
    expect(
      phoneTabs(groups, "").map((tab) => [tab.area, tab.attention]),
    ).toEqual([
      ["home", 3],
      ["library", 0],
      ["chat", 0],
    ]);
  });

  it("leave out a section with nothing in it", () => {
    expect(
      phoneTabs([...groups, { area: "brain", label: "Brain", options: [] }], "")
        .length,
    ).toBe(3);
  });
});
