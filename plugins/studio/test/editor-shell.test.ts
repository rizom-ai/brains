import { describe, expect, it } from "bun:test";
import {
  renderEditorShellHtml,
  type EditorShellOptions,
} from "../src/editor-shell";

const SHELL_OPTIONS: EditorShellOptions = {
  assetPath: "/studio/assets/app.js",
  stylesheetPath: "/studio/assets/app.css",
  basePath: "/studio",
  dashboardHref: "/dashboard",
  brandName: "Rover Collective",
  sessionHref: "/logout?return_to=%2Fstudio",
  principal: { id: "usr_mira", displayName: "Mira Reyes", role: "admin" },
};

describe("renderEditorShellHtml", () => {
  it("serves the shared console sheet in the paper climate", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toContain('data-climate="paper"');
    expect(html).toContain(
      'root.setAttribute("data-theme", climate === "paper" ? "light" : "dark")',
    );
    // Both climate scopes ship; paper is only the Studio default.
    expect(html).toContain('[data-climate="instrument"]');
    expect(html).toContain('[data-climate="paper"]');
    // The console-wide preference overrides the default before first paint.
    expect(html).toContain('localStorage.getItem("console.climate")');
  });

  it("follows the system color scheme until a climate is chosen", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toMatch(/<html [^>]*data-climate-follow-system[ >]/);
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

  it("boots only the hydrated Studio shell and its identity context", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).not.toContain('class="console-strip"');
    expect(html).not.toContain('class="surface-nav"');
    expect(html).toMatch(/<body data-console-host="studio" class="x[^"]+">/);
    expect(html).toContain('data-studio-base-path="/studio"');
    expect(html).toContain('data-studio-dashboard-href="/dashboard"');
    expect(html).toContain('data-studio-brand-name="Rover Collective"');
    expect(html).toContain('data-studio-principal-name="Mira Reyes"');
    expect(html).toContain('data-studio-principal-role="admin"');
    // Drafts kept in this browser are kept per person.
    expect(html).toContain('data-studio-principal-id="usr_mira"');
    expect(html).toContain(
      'data-studio-session-href="/logout?return_to=%2Fstudio"',
    );
    expect(html).toContain(
      '<link data-studio-app-styles rel="stylesheet" href="/studio/assets/app.css" />',
    );
  });

  it("passes the brain's MCP address to the Account view only when given", () => {
    expect(
      renderEditorShellHtml({
        ...SHELL_OPTIONS,
        mcpUrl: "https://yeehaa.io/mcp",
      }),
    ).toContain('data-studio-mcp-url="https://yeehaa.io/mcp"');
    expect(renderEditorShellHtml(SHELL_OPTIONS)).not.toContain(
      "data-studio-mcp-url",
    );
  });

  it("passes the brain's drive address to the Account view only when given", () => {
    expect(
      renderEditorShellHtml({
        ...SHELL_OPTIONS,
        davUrl: "https://yeehaa.io/dav/",
      }),
    ).toContain('data-studio-dav-url="https://yeehaa.io/dav/"');
    expect(renderEditorShellHtml(SHELL_OPTIONS)).not.toContain(
      "data-studio-dav-url",
    );
  });

  it("loads the shared ramp plus the Studio editorial mono face", () => {
    const html = renderEditorShellHtml(SHELL_OPTIONS);

    expect(html).toContain("JetBrains+Mono");
    expect(html).toContain("IBM+Plex+Mono");
  });
});
