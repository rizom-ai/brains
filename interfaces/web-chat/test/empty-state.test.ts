import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const packageRoot = join(import.meta.dir, "..");
const appTsx = readFileSync(
  join(packageRoot, "ui-react", "src", "App.tsx"),
  "utf-8",
);
const conversationTsx = readFileSync(
  join(packageRoot, "ui-react", "src", "ai-elements", "conversation.tsx"),
  "utf-8",
);
const chatPageCss = readFileSync(
  join(packageRoot, "src", "chat-page.css"),
  "utf-8",
);
const interfaceTs = readFileSync(
  join(packageRoot, "src", "web-chat-interface.ts"),
  "utf-8",
);

describe("empty state owns the fresh conversation", () => {
  it("renders the rhizome glyph with its draw animation", () => {
    expect(conversationTsx).toContain("web-chat-empty-state-glyph");
    expect(chatPageCss).toContain("web-chat-rhizome-draw");
    expect(chatPageCss).toContain("web-chat-rhizome-pop");
  });

  it("carries no guided-start card in the chat UI", () => {
    expect(appTsx).not.toContain("PlaybookStarterCard");
    expect(appTsx).not.toContain("bootstrapStarter");
    expect(appTsx).not.toContain("/api/chat/bootstrap");
    expect(chatPageCss).not.toContain("web-chat-playbook-starter");
  });

  it("serves no bootstrap starter endpoint", () => {
    expect(interfaceTs).not.toContain("/api/chat/bootstrap");
    expect(interfaceTs).not.toContain("lifecycle-starters");
  });
});

describe("sessions drawer close control", () => {
  const closeIndex = chatPageCss.indexOf(".web-chat-mobile-drawer-close {");
  const drawerBlock = chatPageCss.slice(
    chatPageCss.indexOf(".web-chat-shell .web-chat-mobile-drawer-close {"),
  );

  it("anchors to the drawer edge instead of a fixed viewport fraction", () => {
    expect(closeIndex).toBeGreaterThanOrEqual(0);
    // The old left: calc(86% - 3rem) collided with the new-session button
    // once the drawer hit its 320px cap.
    expect(chatPageCss).not.toContain("left: calc(86% - 3rem)");
    expect(drawerBlock).toContain("right: calc(100% - min(86%, 320px)");
  });

  it("needs no narrow-viewport special case once anchored to the drawer", () => {
    expect(chatPageCss).not.toContain("right: calc(100% - 320px + 0.85rem)");
  });

  it("clears space in the drawer header so the controls cannot collide", () => {
    const drawerHeader = chatPageCss.slice(
      chatPageCss.indexOf(".web-chat-shell .web-chat-sessions-header {"),
    );
    expect(drawerHeader).toContain("padding-right");
  });
});
