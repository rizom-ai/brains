import { describe, it, expect } from "bun:test";
import { decksPlugin } from "./decks-plugin";

describe("the decks package", () => {
  it("installs one entity plugin under its class's id", () => {
    const plugin = decksPlugin();
    expect(plugin).toBeDefined();
    expect(plugin.id).toBe("decks");
    expect(plugin.version).toBeDefined();
  });
});
