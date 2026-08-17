import { describe, it, expect } from "bun:test";
import decksPackage from "../src";
import { deckEntityPlugin, PACKAGE_METADATA } from "./helpers/install";

describe("decks package", () => {
  it("declares one entity and no projections", () => {
    expect(decksPackage.entities.map(({ type }) => type)).toEqual(["deck"]);
    expect(decksPackage.projections).toEqual([]);
  });

  it("produces an entity plugin scoped to the package", () => {
    const plugin = deckEntityPlugin();

    expect(plugin.id).toBe(`${PACKAGE_METADATA.name}:deck`);
    expect(plugin.version).toBe(PACKAGE_METADATA.version);
    expect(plugin.type).toBe("entity");
  });
});
