import { afterEach, describe, expect, it } from "bun:test";
import { EntityUrlGenerator } from "../src/entity-url-generator";

// What a visitor's answer may list as its sources: the pieces of work the
// site names, or, on a site that names none, any type it has pages for.
describe("EntityUrlGenerator.isCitable", () => {
  afterEach(() => EntityUrlGenerator.resetInstance());

  it("is the types the site marks citable", () => {
    const urls = EntityUrlGenerator.getInstance();
    urls.configure({
      post: { label: "Essay", citable: true },
      deck: { label: "Presentation", citable: true },
      topic: { label: "Topic" },
      "social-post": { label: "Social Post" },
    });
    expect(
      ["post", "deck", "topic", "social-post", "note"].filter((type) =>
        urls.isCitable(type),
      ),
    ).toEqual(["post", "deck"]);
  });

  it("is every type with pages when the site marks none", () => {
    const urls = EntityUrlGenerator.getInstance();
    urls.configure({ post: { label: "Post" }, topic: { label: "Topic" } });
    expect(
      ["post", "topic", "note"].filter((type) => urls.isCitable(type)),
    ).toEqual(["post", "topic"]);
  });

  it("is nothing before a site is configured", () => {
    expect(EntityUrlGenerator.getInstance().isCitable("post")).toBe(false);
  });
});
