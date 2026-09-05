import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * The shared conversation spaces, at setup.
 *
 * A space is a channel whose traffic the brain records without spending an
 * agent turn on it. chat captures messages into a space conversation when
 * the channel is one of the configured spaces, which means asking which
 * those are. The class read them off its context; a declaration has to be
 * handed them.
 */

const spaces = ["discord:guild-1:channel-9", "slack:C123"];

describe("an interface asked which channels are spaces", () => {
  it("is handed the brain's spaces at setup, in either family", async () => {
    const seen: string[][] = [];
    const messageInterface = defineMessageInterface({
      id: "listener",
      config: z.object({}),
      channel: {
        type: "listener",
        displayName: "Listener",
        subjectLabel: "Room",
        recipient: z.string(),
      },
      setup: (context) => {
        seen.push([...context.spaces]);
        return {};
      },
    });
    const plainInterface = defineInterface({
      id: "watcher",
      config: z.object({}),
      setup: (context) => {
        seen.push([...context.spaces]);
        return {};
      },
    });

    const harness = createPluginHarness({ spaces });
    for (const definition of [messageInterface, plainInterface]) {
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: `@fixture/${definition.id}`, version: "0.1.0" },
      );
      if (!plugin) throw new Error(`${definition.id} was not created`);
      await harness.installPlugin(plugin);
    }

    expect(seen).toEqual([spaces, spaces]);
    await harness.reset();
  });
});
