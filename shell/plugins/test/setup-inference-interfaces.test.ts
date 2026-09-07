import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineInterface, defineMessageInterface } from "../src";

/**
 * The same rule for the two interface families.
 *
 * Both used to carry the same ordering trap as services, and the fix is the
 * same: what the interface is, then what it does with the state that setup
 * produced. This file is a compile fixture; the assertions keep it honest.
 */
describe("reading setup state in an interface", () => {
  const configSchema = z.object({ token: z.string() });

  it("types a generic interface's routes whatever order they are written in", () => {
    const definition = defineInterface(
      {
        id: "reading-webhook",
        config: configSchema,
        setup: ({ config }) => ({ token: config.token, seen: 0 }),
      },
      {
        // Written first, and still typed against what setup returned.
        instructions: ({ state }) => `token ${state.token}`,
        tools: ({ state }) => {
          const seen: number = state.seen;
          void seen;
          return [];
        },
      },
    );

    expect(definition.id).toBe("reading-webhook");
  });

  it("refuses a field a generic interface never set up", () => {
    const definition = defineInterface(
      {
        id: "no-such-field",
        config: configSchema,
        setup: () => ({ token: "t" }),
      },
      {
        // @ts-expect-error the state has no `missing`
        instructions: ({ state }) => state.missing,
      },
    );

    expect(definition.id).toBe("no-such-field");
  });

  it("types a message interface's slots whatever order they are written in", () => {
    const definition = defineMessageInterface(
      {
        id: "campfire-inference",
        config: configSchema,
        channel: {
          type: "campfire-inference",
          displayName: "Campfire",
          subjectLabel: "Room",
          recipient: z.object({ roomId: z.string().min(1) }),
        },
        setup: ({ config }) => ({ token: config.token }),
      },
      {
        // `deliver` before `send`, and both know the state.
        deliver: ({ state, recipient }) => `${state.token}:${recipient.roomId}`,
        send: ({ state }) => `sent-${state.token}`,
      },
    );

    expect(definition.id).toBe("campfire-inference");
  });

  it("refuses a field a message interface never set up", () => {
    const definition = defineMessageInterface(
      {
        id: "campfire-unknown",
        config: configSchema,
        channel: {
          type: "campfire-unknown",
          displayName: "Campfire",
          subjectLabel: "Room",
          recipient: z.object({ roomId: z.string().min(1) }),
        },
        setup: () => ({ token: "t" }),
      },
      {
        // @ts-expect-error the state has no `missing`
        send: ({ state }) => state.missing,
      },
    );

    expect(definition.id).toBe("campfire-unknown");
  });
});
