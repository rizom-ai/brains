import { describe, expect, it } from "bun:test";
import {
  ASK_BOX_STATE_KEY,
  askBoxAvailabilityState,
  type AskBoxAvailability,
} from "@brains/contracts";
import {
  defineInterface,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createBookPlugins } from "./book-plugins";

const askSchema = z.object({ askBox: z.boolean() });

/**
 * Web Chat's write, as its interface makes it: through the shared-state
 * declaration it owns, never a storage key.
 */
function webChatRecording(
  record: AskBoxAvailability | null,
): ReturnType<typeof defineInterface> {
  return defineInterface({
    id: "web-chat",
    config: z.object({}),
    setup: async ({ runtimeState }) => {
      if (record) {
        await runtimeState(askBoxAvailabilityState).set(
          ASK_BOX_STATE_KEY,
          record,
        );
      }
      return {};
    },
  });
}

/** book:ask's guest box, with Web Chat having recorded `record`. */
async function askBox(
  record: AskBoxAvailability | null,
  publishedOnly: boolean,
): Promise<boolean> {
  const harness = createPluginHarness({ logger: createSilentLogger() });
  try {
    const [webChat] = instantiatePluginPackageDefinition(
      webChatRecording(record),
      {},
      { name: "@brains/web-chat", version: "0.1.0" },
    );
    if (!webChat) throw new Error("No Web Chat");
    await harness.installPlugin(webChat);
    for (const plugin of createBookPlugins()) {
      await plugin.register(harness.getMockShell());
    }
    const source = harness.getDataSources().get("book:ask");
    if (!source?.fetch) throw new Error("No book:ask");
    const result = await source.fetch({}, askSchema, {
      entityService: harness.getEntityService(),
      publishedOnly,
    });
    return result.askBox;
  } finally {
    await harness.reset();
  }
}

// Book reads the record through the declaration Web Chat writes it through,
// so where the record is stored is the declaration's alone to decide: a
// changed storage namespace moves both sides, and a write that stops
// reaching book fails here instead of closing the box silently.
describe("book:ask reads Web Chat's guest box", () => {
  it("as Web Chat recorded it, for a production build and a preview", async () => {
    const record = { public: true, preview: false };
    expect(await askBox(record, true)).toBe(true);
    expect(await askBox(record, false)).toBe(false);
    expect(await askBox({ public: false, preview: true }, false)).toBe(true);
  });

  it("as closed while Web Chat has recorded nothing", async () => {
    expect(await askBox(null, true)).toBe(false);
    expect(await askBox(null, false)).toBe(false);
  });
});
