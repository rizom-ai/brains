import { describe, expect, it } from "bun:test";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import {
  ASK_BOX_STATE_KEY,
  askBoxAvailabilityState,
  sharedStateNamespace,
  type AskBoxAvailability,
} from "@brains/contracts";
import {
  homepageChatAvailable,
  type AskBoxReader,
} from "../src/datasources/homepage-chat";

/** The record Web Chat shares, as it left it in the serving process. */
async function runtime(record?: AskBoxAvailability): Promise<AskBoxReader> {
  const store = createMemoryRuntimeStateNamespace().scoped({
    namespace: sharedStateNamespace(askBoxAvailabilityState.name),
    schema: askBoxAvailabilityState.schema,
  });
  if (record) await store.set(ASK_BOX_STATE_KEY, record);
  return store;
}

describe("homepage chat availability", () => {
  it("offers the chat box where Web Chat records that it serves the box boot", async () => {
    expect(
      await homepageChatAvailable(
        { publishedOnly: true },
        await runtime({ public: true, preview: true }),
      ),
    ).toBe(true);
  });

  it("keeps the door only when guest chat is off or nothing is recorded", async () => {
    expect(
      await homepageChatAvailable({ publishedOnly: true }, await runtime()),
    ).toBe(false);
    expect(
      await homepageChatAvailable(
        { publishedOnly: true },
        await runtime({ public: false, preview: false }),
      ),
    ).toBe(false);
  });

  it("offers it in a preview build only where the box boot reaches preview", async () => {
    expect(
      await homepageChatAvailable(
        { publishedOnly: false },
        await runtime({ public: true, preview: false }),
      ),
    ).toBe(false);
    expect(
      await homepageChatAvailable(
        { publishedOnly: false },
        await runtime({ public: true, preview: true }),
      ),
    ).toBe(true);
  });

  it("offers it in a preview build while the owner has managed guest chat switched on, and only there", async () => {
    const switchedOn = { public: false, preview: true };
    expect(
      await homepageChatAvailable(
        { publishedOnly: false },
        await runtime(switchedOn),
      ),
    ).toBe(true);
    expect(
      await homepageChatAvailable(
        { publishedOnly: true },
        await runtime(switchedOn),
      ),
    ).toBe(false);
  });
});
