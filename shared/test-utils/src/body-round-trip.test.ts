import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "./body-round-trip";

interface Body {
  title: string;
  tags: string[];
}

const faithful = {
  format: (body: Body): string => [body.title, ...body.tags].join("\n"),
  parse: (markdown: string): Body => {
    const [title = "", ...tags] = markdown.split("\n");
    return { title, tags };
  },
};

describe("expectBodyRoundTrip", () => {
  it("passes when parse(format(body)) equals the body", () => {
    expectBodyRoundTrip(faithful, { title: "Atlas", tags: ["map"] });
  });

  it("fails when the write loses data", () => {
    const lossy = {
      format: (body: Body): string => body.title,
      parse: faithful.parse,
    };

    expect(() =>
      expectBodyRoundTrip(lossy, { title: "Atlas", tags: ["map"] }),
    ).toThrow();
  });
});
