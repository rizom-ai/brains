import { describe, expect, it } from "bun:test";
import { internalPublishProvider } from "../src";

describe("the internal publish provider", () => {
  it("is named internal", () => {
    expect(internalPublishProvider.name).toBe("internal");
  });

  it("records a publish without calling anything outside the brain", async () => {
    expect(
      await internalPublishProvider.publish("content", { title: "Post" }),
    ).toEqual({ id: "internal" });
  });
});
