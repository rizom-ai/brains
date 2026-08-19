import { createSilentLogger } from "@brains/test-utils";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
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

  // A template carries its data source id as a string and the registry looks
  // it up by exact match, so a stale id type-checks and fails only when
  // something renders.
  it("registers templates that point at data sources it declares", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("decks-datasource-test"),
    });
    await harness.installPlugin(deckEntityPlugin());

    expectTemplateDataSourcesResolve(harness);

    harness.reset();
  });
});
