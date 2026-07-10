import { describe, expect, it } from "bun:test";
import { CONSOLE_PALETTE_SCRIPT } from "../src";

describe("CONSOLE_PALETTE_SCRIPT", () => {
  it("queries the cross-surface jump endpoint", () => {
    expect(CONSOLE_PALETTE_SCRIPT).toContain("/api/console/jump");
    expect(CONSOLE_PALETTE_SCRIPT).toContain("encodeURIComponent");
  });

  it("opens from the strip's command chip and the keyboard", () => {
    expect(CONSOLE_PALETTE_SCRIPT).toContain(".command-chip");
    // Meta+K on macOS, Ctrl+K elsewhere.
    expect(CONSOLE_PALETTE_SCRIPT).toMatch(/metaKey|ctrlKey/);
    expect(CONSOLE_PALETTE_SCRIPT).toContain('"k"');
  });

  it("offers the sign-in door when the session is missing", () => {
    expect(CONSOLE_PALETTE_SCRIPT).toContain("401");
    expect(CONSOLE_PALETTE_SCRIPT).toContain("/login?return_to=");
  });

  it("lets the hosting surface append local groups", () => {
    expect(CONSOLE_PALETTE_SCRIPT).toContain("__consoleJumpLocal");
  });
});
