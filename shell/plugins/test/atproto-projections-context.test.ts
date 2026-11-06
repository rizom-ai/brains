import { describe, expect, it } from "bun:test";
import type {
  AtprotoLexicon,
  AtprotoProjection,
} from "@brains/atproto-contracts";
import { createMockShell } from "../src/test/mock-shell";
import {
  createPluginScopedShell,
  PluginResourceScope,
} from "../src/manager/plugin-resource-scope";
import { createBasePluginContext } from "../src/base/context";

const lexicon: AtprotoLexicon = {
  lexicon: 1,
  id: "ai.rizom.brain.note",
  defs: {
    main: {
      type: "record",
      key: "tid",
      record: { type: "object", properties: {} },
    },
  },
};

const noteProjection: AtprotoProjection = {
  entityType: "note",
  collection: "ai.rizom.brain.note",
  lexicon,
  buildRecord: () => Promise.resolve({}),
};

describe("context.atprotoProjections", () => {
  it("shows a projection one plugin registers to another on the same shell", () => {
    const shell = createMockShell();
    createBasePluginContext(shell, "note").atprotoProjections.register(
      noteProjection,
    );

    expect(
      createBasePluginContext(shell, "atproto").atprotoProjections.get("note"),
    ).toBe(noteProjection);
  });

  it("keeps each shell's projections to itself", () => {
    createBasePluginContext(
      createMockShell(),
      "note",
    ).atprotoProjections.register(noteProjection);

    expect(
      createBasePluginContext(
        createMockShell(),
        "atproto",
      ).atprotoProjections.has("note"),
    ).toBe(false);
  });

  it("drops a projection when the plugin that registered it tears down", async () => {
    const shell = createMockShell();
    const scope = new PluginResourceScope();
    createBasePluginContext(
      createPluginScopedShell(shell, scope),
      "note",
    ).atprotoProjections.register(noteProjection);
    expect(shell.getAtprotoProjectionRegistry().has("note")).toBe(true);

    await scope.close();

    expect(shell.getAtprotoProjectionRegistry().has("note")).toBe(false);
  });
});
