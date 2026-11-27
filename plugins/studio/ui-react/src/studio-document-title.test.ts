import { describe, expect, it } from "bun:test";
import { studioDocumentTitle } from "./studio-document-title";

describe("studioDocumentTitle", () => {
  it("names the page, where it lives and the brain", () => {
    expect(
      studioDocumentTitle(
        ["Event Sourcing for Sustainability Metrics", "Posts"],
        "Alex Chen",
      ),
    ).toBe("Event Sourcing for Sustainability Metrics — Posts — Alex Chen");
  });

  it("drops missing parts and a part that repeats the one before it", () => {
    expect(studioDocumentTitle([undefined, "Posts"], "Alex Chen")).toBe(
      "Posts — Alex Chen",
    );
    expect(studioDocumentTitle(["Style Guide", "Style Guide"], "Alex")).toBe(
      "Style Guide — Alex",
    );
    expect(studioDocumentTitle(["  ", null], "Alex")).toBe("Alex");
  });
});
