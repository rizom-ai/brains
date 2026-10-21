import { describe, expect, it } from "bun:test";
import { boardMembers } from "../src/members";

describe("the members a card can be assigned to", () => {
  it("are the brain's active and invited people, by name, without suspended ones", () => {
    expect(
      boardMembers([
        { userId: "u-sam", displayName: "Sam Rivera", status: "active" },
        { userId: "u-old", displayName: "Old Hand", status: "suspended" },
        { userId: "u-alex", displayName: "Alex Morgan", status: "invited" },
      ]),
    ).toEqual([
      { id: "u-alex", name: "Alex Morgan" },
      { id: "u-sam", name: "Sam Rivera" },
    ]);
  });
});
