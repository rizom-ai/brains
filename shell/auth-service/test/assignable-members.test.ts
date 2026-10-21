import { describe, expect, it } from "bun:test";
import { assignableMembers } from "../src/assignable-members";

describe("the members people fields assign from", () => {
  it("are the brain's active and invited people, by name, without suspended ones", () => {
    expect(
      assignableMembers([
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
