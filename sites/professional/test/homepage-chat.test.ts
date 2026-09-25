import { describe, expect, it } from "bun:test";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import type { IRuntimeStateNamespace } from "@brains/plugins";
import {
  ASK_BOX_STATE_KEY,
  ASK_BOX_STATE_NAMESPACE,
  askBoxAvailabilitySchema,
  type AskBoxAvailability,
} from "@brains/contracts";
import { homepageChatAvailable } from "../src/datasources/homepage-chat";

/** Shared runtime state as Web Chat left it in the serving process. */
async function runtime(
  record?: AskBoxAvailability,
): Promise<{ runtimeState: IRuntimeStateNamespace }> {
  const runtimeState = createMemoryRuntimeStateNamespace();
  if (record)
    await runtimeState
      .scoped({
        namespace: ASK_BOX_STATE_NAMESPACE,
        schema: askBoxAvailabilitySchema,
      })
      .set(ASK_BOX_STATE_KEY, record);
  return { runtimeState };
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
});
