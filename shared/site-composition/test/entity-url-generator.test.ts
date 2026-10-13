import { describe, expect, it } from "bun:test";
import { EntityUrlGenerator } from "../src/entity-url-generator";

// What a visitor's answer may list as its sources: the pieces of work the
// site names, or, on a site that names none, any type it has pages for.
describe("EntityUrlGenerator.isCitable", () => {
  it("is the types the site marks citable", () => {
    const urls = new EntityUrlGenerator({
      post: { label: "Essay", citable: true },
      deck: { label: "Presentation", citable: true },
      topic: { label: "Topic" },
      "social-post": { label: "Social Post", citable: false },
    });
    expect(
      ["post", "deck", "topic", "social-post", "note"].filter((type) =>
        urls.isCitable(type),
      ),
    ).toEqual(["post", "deck"]);
  });

  it("is every type with pages when the site marks none", () => {
    const urls = new EntityUrlGenerator({
      post: { label: "Post" },
      topic: { label: "Topic" },
    });
    expect(
      ["post", "topic", "note"].filter((type) => urls.isCitable(type)),
    ).toEqual(["post", "topic"]);
  });

  it("excludes an explicit false even when no type opts in", () => {
    const urls = new EntityUrlGenerator({
      post: { label: "Post", citable: false },
      topic: { label: "Topic" },
    });
    expect(urls.isCitable("post")).toBe(false);
    expect(urls.isCitable("topic")).toBe(true);
    expect(urls.isCitable("note")).toBe(false);
    // Citation selection does not remove the page or become access control.
    expect(urls.hasRoute("post")).toBe(true);
  });

  it("can exclude every configured type", () => {
    const urls = new EntityUrlGenerator({
      post: { label: "Post", citable: false },
      topic: { label: "Topic", citable: false },
    });
    expect(["post", "topic"].filter((type) => urls.isCitable(type))).toEqual(
      [],
    );
  });

  it("is nothing without a site's display", () => {
    expect(new EntityUrlGenerator().isCitable("post")).toBe(false);
  });
});
