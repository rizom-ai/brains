import { describe, expect, it } from "bun:test";
import { requireDoor } from "../src/datasources/homepage-datasource";

const opening = {
  title: "Building something inhabitable.",
  introduction: "I work on how institutions hold what they know.",
  topics: [],
  contactUrl: "https://yeehaa.test/contact",
};

describe("professional homepage opening", () => {
  it("keeps an opening whose door leads to a contact form", () => {
    expect(requireDoor(opening)).toBe(opening);
  });

  it("keeps the list homepage when no contact form can receive the door", () => {
    expect(requireDoor({ ...opening, contactUrl: null })).toBeNull();
    expect(requireDoor(null)).toBeNull();
  });
});
