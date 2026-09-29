import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineStudioWorkspace, defineWorkspaceAction } from "../src/index";

/**
 * Why the composite blocks stay hand-written.
 *
 * An action block's `input` is checked against the schema of the very action
 * it names. That check comes from `OperatorActionControl<TDefinition>`, a
 * distributive conditional type that reads `WorkspaceActionInput<TDefinition>`
 * and makes `input` and `form` mutually exclusive.
 *
 * A Zod schema validates one concrete shape and cannot be generic over a
 * plugin's own action definitions, so deriving these types would replace the
 * check below with an opaque record. These tests are what would fail if
 * someone tried — the compiler errors they assert would stop appearing.
 */

const refresh = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  permission: "trusted",
  input: z.object({ id: z.string() }),
  output: z.object({ refreshed: z.string() }),
});

describe("an action block's input is typed by the action it names", () => {
  it("accepts the input that action declares", () => {
    const workspace = defineStudioWorkspace({
      id: "library",
      label: "Reading library",
      permission: "trusted",
      data: z.object({ count: z.number() }),
      actions: [refresh],
      view: ({ data }) => ({
        title: "Reading library",
        blocks: [
          { type: "stats", items: [{ label: "Saved", value: data.count }] },
          { type: "action", action: refresh, input: { id: "saved-1" } },
        ],
      }),
    });

    expect(workspace.id).toBe("library");
  });

  it("rejects an input the action would not accept", () => {
    const workspace = defineStudioWorkspace({
      id: "library",
      label: "Reading library",
      permission: "trusted",
      data: z.object({ count: z.number() }),
      actions: [refresh],
      view: () => ({
        title: "Reading library",
        blocks: [
          {
            type: "action",
            action: refresh,
            // @ts-expect-error `id` is a string in the action's own schema.
            input: { id: 7 },
          },
        ],
      }),
    });

    expect(workspace.id).toBe("library");
  });

  it("does not catch an input field the action never declared", () => {
    // Stated because it is a real gap rather than an oversight in this test:
    // the excess field is not a type error here, so an author learns about a
    // stray key from validation rather than from the compiler. Narrowing it
    // is its own change; what matters for the surrounding claim is that the
    // declared fields above are checked.
    const workspace = defineStudioWorkspace({
      id: "library",
      label: "Reading library",
      permission: "trusted",
      data: z.object({ count: z.number() }),
      actions: [refresh],
      view: () => ({
        title: "Reading library",
        blocks: [
          {
            type: "action",
            action: refresh,
            input: { id: "saved-1", slug: "extra" },
          },
        ],
      }),
    });

    expect(workspace.id).toBe("library");
  });
});
