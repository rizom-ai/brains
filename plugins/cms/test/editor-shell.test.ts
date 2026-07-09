import { describe, expect, it } from "bun:test";
import { renderEditorShellHtml } from "../src/editor-shell";

const SHELL_OPTIONS = {
  assetPath: "/cms/assets/app.js",
  surfaces: [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      isActive: false,
    },
    { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
    { id: "cms", label: "CMS", href: "/cms", isActive: true },
  ],
  sessionHref: "/logout?return_to=%2Fcms",
};

describe("renderEditorShellHtml", () => {
  it("serves the shared console sheet in the paper climate", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toContain('data-climate="paper"');
    expect(html).not.toContain("data-theme");
    // Both climate scopes ship; paper is only the CMS default.
    expect(html).toContain('[data-climate="instrument"]');
    expect(html).toContain('[data-climate="paper"]');
    // The console-wide preference overrides the default before first paint.
    expect(html).toContain('localStorage.getItem("console.climate")');
  });

  it("defines no local palette", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    for (const legacy of [
      "--paper:",
      "--paper-deep:",
      "--panel:",
      "--ink:",
      "--vermilion:",
      "--verdigris:",
      "--amber:",
      "--hairline:",
    ]) {
      expect(html).not.toContain(legacy);
    }
  });

  it("renders the console strip with CMS active", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toContain('class="console-strip"');
    expect(html).toContain("Brain · <b>Console</b>");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/chat"');
    expect(html).toContain('surface-nav-link is-active" href="/cms">CMS');
    expect(html).toContain("<kbd>⌘K</kbd>");
    expect(html).toContain('class="session-chip"');
    expect(html).toContain('href="/logout?return_to=%2Fcms"');
    expect(html).toContain("Sign out");
  });

  it("loads the console type ramp, not IBM Plex Mono", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toContain("JetBrains+Mono");
    expect(html).not.toContain("IBM+Plex+Mono");
  });
});
