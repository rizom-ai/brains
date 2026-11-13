import { describe, expect, it } from "bun:test";
import { deferred, type Deferred } from "@brains/utils/deferred";
import { yieldToEventLoop } from "@brains/utils/yield-to-event-loop";
import { postToThread } from "../src/chat-post";

const DISCORD_CHANNEL = "discord:guild-1:channel-1";

/** A thread whose posts land only when the test lets them. */
function heldThread(): {
  thread: { post(message: unknown): Promise<{ id: string }> };
  posted: unknown[];
  landings: Deferred<{ id: string }>[];
} {
  const posted: unknown[] = [];
  const landings: Deferred<{ id: string }>[] = [];
  return {
    posted,
    landings,
    thread: {
      post: (message): Promise<{ id: string }> => {
        posted.push(message);
        const landing = deferred<{ id: string }>();
        landings.push(landing);
        return landing.promise;
      },
    },
  };
}

describe("posting a message to a thread", () => {
  it("posts a long message's chunks one after the other, so they arrive in order", async () => {
    const { thread, posted, landings } = heldThread();
    const sent: string[] = [];

    const done = postToThread(thread, DISCORD_CHANNEL, "x".repeat(5000), {
      onSent: ({ id }) => sent.push(id),
    });
    await yieldToEventLoop();

    // The second chunk waits for the first to land.
    expect(posted).toHaveLength(1);
    landings[0]?.resolve({ id: "first" });
    await yieldToEventLoop();
    expect(posted).toHaveLength(2);
    landings[1]?.resolve({ id: "second" });
    await yieldToEventLoop();
    landings[2]?.resolve({ id: "third" });

    expect((await done)?.id).toBe("third");
    expect(sent).toEqual(["first", "second", "third"]);
    expect(posted.map((chunk) => String(chunk).length)).toEqual([
      2000, 2000, 1000,
    ]);
  });

  it("posts a short message once", async () => {
    const { thread, posted, landings } = heldThread();
    const done = postToThread(thread, DISCORD_CHANNEL, "Hello");
    await yieldToEventLoop();
    landings[0]?.resolve({ id: "only" });
    expect((await done)?.id).toBe("only");
    expect(posted).toEqual(["Hello"]);
  });
});
