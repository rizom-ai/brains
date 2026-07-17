import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";

describe("Effect utility boundary", () => {
  it("exposes the curated production runtime", async () => {
    const result = await Effect.runPromise(Effect.succeed("ready"));

    expect(result).toBe("ready");
  });

  it("exposes deterministic test services separately", async () => {
    const elapsed = await Effect.runPromise(
      Effect.gen(function* () {
        let completed = false;
        yield* Effect.fork(
          Effect.sleep(100).pipe(
            Effect.andThen(
              Effect.sync(() => {
                completed = true;
              }),
            ),
          ),
        );
        yield* TestClock.adjust(100);
        return completed;
      }).pipe(Effect.provide(TestContext.TestContext)),
    );

    expect(elapsed).toBe(true);
  });
});
