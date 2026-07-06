import { describe, expect, test } from "bun:test";
import { defineBrain } from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";

const definition = defineBrain({
  name: "test",
  version: "1.0.0",
  capabilities: [],
  interfaces: [],
});

describe("site.package resolution", () => {
  test("throws when an explicitly requested site.package is not registered", () => {
    expect(() =>
      resolve(definition, {}, { site: { package: "@rizom/not-installed" } }),
    ).toThrow(/@rizom\/not-installed/);
  });

  test("resolves the definition site when no site.package override is set", () => {
    expect(() => resolve(definition, {}, {})).not.toThrow();
  });
});
