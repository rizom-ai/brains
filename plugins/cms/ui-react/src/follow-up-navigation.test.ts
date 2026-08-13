import { describe, expect, it } from "bun:test";
import { navigateToInboxFollowUp } from "./follow-up-navigation";

const state = {
  cmsCreatePrefill: {
    version: 1,
    entityType: "note",
    title: "Review the proposal",
    backlink: "entity://mail-item/mail-1",
  },
};

describe("Inbox follow-up navigation", () => {
  it("uses the configured CMS router for same-app targets", () => {
    const pushes: unknown[][] = [];
    let reloaded = false;

    navigateToInboxFollowUp(
      {
        kind: "capture-as-note",
        label: "Capture as note",
        href: "/studio/entities/note?mode=create",
        state,
      },
      {
        cmsBasePath: "/studio",
        routerPush: (...args) => pushes.push(args),
        browserPushState: () => {
          throw new Error("same-app navigation must use the router");
        },
        reload: () => {
          reloaded = true;
        },
      },
    );

    expect(pushes).toEqual([["/studio/entities/note?mode=create", state]]);
    expect(reloaded).toBe(false);
  });

  it("preserves bounded handoff state across a full same-origin surface load", () => {
    const browserPushes: unknown[][] = [];
    let reloads = 0;

    navigateToInboxFollowUp(
      {
        kind: "discuss-in-chat",
        label: "Discuss in chat",
        href: "/talk",
        state: { webChatPrefill: { version: 1, text: "About inbox item" } },
      },
      {
        cmsBasePath: "/studio",
        routerPush: () => {
          throw new Error("cross-app navigation must leave the CMS router");
        },
        browserPushState: (...args) => browserPushes.push(args),
        reload: () => {
          reloads += 1;
        },
      },
    );

    expect(browserPushes).toEqual([
      [
        { webChatPrefill: { version: 1, text: "About inbox item" } },
        "",
        "/talk",
      ],
    ]);
    expect(reloads).toBe(1);
  });
});
