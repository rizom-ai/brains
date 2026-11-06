import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { renderedLinkFields, viewLinkFields } from "../src";

describe("link fields", () => {
  it("leaves a view's link fields null until site-builder fills them", () => {
    const view = z.object(viewLinkFields);

    expect(view.parse({})).toEqual({
      url: null,
      typeLabel: null,
      listUrl: null,
      listLabel: null,
    });
    expect(
      view.parse({
        url: "/posts/a",
        typeLabel: "Post",
        listUrl: "/posts",
        listLabel: "Posts",
      }),
    ).toEqual({
      url: "/posts/a",
      typeLabel: "Post",
      listUrl: "/posts",
      listLabel: "Posts",
    });
  });

  it("names the same fields a render schema requires", () => {
    expect(Object.keys(viewLinkFields)).toEqual(
      Object.keys(renderedLinkFields),
    );
    expect(z.object(renderedLinkFields).safeParse({}).success).toBe(false);
  });
});
