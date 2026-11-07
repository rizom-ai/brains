import { describe, expect, it } from "bun:test";
import { boundPageCall, describeLiveness, scriptExcerpt } from "./page";

const hung = (): Promise<never> => new Promise<never>(() => {});

describe("scriptExcerpt", () => {
  it("names a short page script whole, on one line", () => {
    expect(scriptExcerpt("(() =>\n    document.fonts.ready\n)()")).toBe(
      "(() => document.fonts.ready )()",
    );
  });

  it("cuts a long page script to its opening", () => {
    const excerpt = scriptExcerpt(
      `(() => { ${"window.scrollTo(0, 0); ".repeat(40)}})()`,
    );

    expect(excerpt).toHaveLength(160);
    expect(excerpt.startsWith("(() => { window.scrollTo(0, 0);")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("boundPageCall", () => {
  it("returns the call's result when it answers in time", async () => {
    expect(
      await boundPageCall(Promise.resolve(42), "evaluate 41 + 1", hung, 1_000),
    ).toBe(42);
  });

  it("fails a stalled call naming it and the page's state", async () => {
    expect(
      boundPageCall(
        hung(),
        "evaluate (() => document.fonts.ready)()",
        () => Promise.resolve("the page still answers: 30 frames"),
        20,
      ),
    ).rejects.toThrow(
      "evaluate (() => document.fonts.ready)() did not finish within 20ms; the page still answers: 30 frames",
    );
  });

  it("passes the call's own failure through without probing the page", async () => {
    expect(
      boundPageCall(
        Promise.reject(new Error("Execution context was destroyed")),
        "evaluate document.title",
        () => Promise.reject(new Error("probed a page that answered")),
        1_000,
      ),
    ).rejects.toThrow("Execution context was destroyed");
  });
});

describe("describeLiveness", () => {
  it("reports a page that answers with its state", async () => {
    expect(
      await describeLiveness(
        Promise.resolve("60 animation frames in 500ms, visible"),
        1_000,
      ),
    ).toBe("the page still answers: 60 animation frames in 500ms, visible");
  });

  it("reports a page that does not answer at all", async () => {
    expect(await describeLiveness(hung(), 20)).toBe(
      "the page does not answer an evaluation either: liveness probe did not finish within 20ms",
    );
  });
});
