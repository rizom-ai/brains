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
  it.each([
    { public: false, preview: false },
    { public: false, preview: true },
    { public: true, preview: false },
    { public: true, preview: true },
  ])("selects the build's flag independently for %j", async (record) => {
    const source = await runtime(record);
    expect(await homepageChatAvailable({ publishedOnly: false }, source)).toBe(
      record.preview,
    );
    expect(await homepageChatAvailable({ publishedOnly: true }, source)).toBe(
      record.public,
    );
    expect(await homepageChatAvailable({}, source)).toBe(record.public);
  });

  it("fails closed for missing or unreadable hints in either build", async () => {
    const unavailable = {
      interfaceAvailability: {
        get: (): Promise<null> => Promise.reject(new Error("Unavailable")),
      },
    };
    for (const publishedOnly of [false, true]) {
      expect(
        await homepageChatAvailable({ publishedOnly }, await runtime()),
      ).toBe(false);
      expect(await homepageChatAvailable({ publishedOnly }, unavailable)).toBe(
        false,
      );
    }
  });

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
