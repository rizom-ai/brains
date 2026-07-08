import { describe, expect, it } from "bun:test";
import {
  RizomRuntimePlugin,
  type RizomThemeProfile,
} from "../src/runtime/plugin";

class TestableRuntimePlugin extends RizomRuntimePlugin {
  head(themeProfile?: RizomThemeProfile): string {
    return this.buildHeadScript(themeProfile, this.getCanvasPath(themeProfile));
  }
}

describe("RizomRuntimePlugin head script", () => {
  const plugin = new TestableRuntimePlugin("@brains/site-rizom-test");

  it("without a theme profile injects only the boot script", () => {
    const head = plugin.head();
    expect(head).toContain("/boot.js");
    expect(head).not.toContain("canvas");
    expect(head).not.toContain("data-theme-profile");
  });

  it("with a theme profile injects its canvas and the profile attribute", () => {
    const head = plugin.head("product");
    expect(head).toContain("data-theme-profile");
    expect(head).toContain("/canvases/prelude.canvas.js");
    expect(head).toContain("/canvases/tree.canvas.js");
  });
});
