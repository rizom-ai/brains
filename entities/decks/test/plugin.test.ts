import { describe, it, expect, beforeEach } from "bun:test";
import { DecksPlugin } from "../src";

describe("DecksPlugin", () => {
  let plugin: DecksPlugin;

  beforeEach(() => {
    plugin = new DecksPlugin();
  });

  it("should be instantiable", () => {
    expect(plugin).toBeDefined();
  });

  it("should have correct plugin name", () => {
    expect(plugin.id).toBe("decks");
  });

  it("should have plugin metadata", () => {
    expect(plugin.version).toBeDefined();
  });
});
