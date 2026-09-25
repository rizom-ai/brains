import { describe, expect, it } from "bun:test";
import type { InterfaceAvailabilityReader } from "@brains/plugins";
import type { AskBoxAvailability } from "@brains/contracts";
import { homepageChatAvailable } from "../src/datasources/homepage-chat";

/** Shared runtime state as Web Chat left it in the serving process. */
function runtime(
  record?: AskBoxAvailability,
): Promise<{ interfaceAvailability: InterfaceAvailabilityReader }> {
  return Promise.resolve({
    interfaceAvailability: Object.freeze({
      get: () => Promise.resolve(record ?? null),
    }),
  });
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
