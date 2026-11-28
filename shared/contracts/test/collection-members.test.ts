import { describe, expect, it } from "bun:test";
import {
  collectionMembersContract,
  collectionMembersRequestSchema,
  collectionMembersResponseSchema,
  collectionTypesContract,
  collectionTypesResponseSchema,
} from "../src/collection-members";

// A collection whose membership the brain works out, such as topics: Studio
// asks the plugin that owns it which types it answers for, and which entries
// belong to each of its collections.
describe("collection members", () => {
  it("collects the types each plugin answers for", () => {
    expect(collectionTypesContract.name).toBe("collections:types");
    expect(collectionTypesContract.delivery).toBe("collect");
    expect(collectionTypesResponseSchema.parse({ types: ["topic"] })).toEqual({
      types: ["topic"],
    });
  });

  it("asks for the members of some collections at the viewer's visibility", () => {
    expect(collectionMembersContract.name).toBe("collections:members");
    expect(collectionMembersContract.delivery).toBe("collect");
    expect(
      collectionMembersRequestSchema.parse({
        entityType: "topic",
        ids: ["ecosystems"],
        visibilityScope: "shared",
      }),
    ).toEqual({
      entityType: "topic",
      ids: ["ecosystems"],
      visibilityScope: "shared",
    });
    expect(() =>
      collectionMembersRequestSchema.parse({
        entityType: "topic",
        ids: Array(201).fill("topic"),
        visibilityScope: "public",
      }),
    ).toThrow();
  });

  it("answers each collection with its members, or nothing for a type it does not own", () => {
    const answer = {
      collections: [
        { id: "ecosystems", members: [{ entityType: "post", id: "foam" }] },
      ],
    };
    expect(collectionMembersResponseSchema.parse(answer)).toEqual(answer);
    expect(collectionMembersResponseSchema.parse({ collections: [] })).toEqual({
      collections: [],
    });
    expect(() =>
      collectionMembersResponseSchema.parse({
        collections: [
          {
            id: "ecosystems",
            members: Array(1001).fill({ entityType: "post", id: "foam" }),
          },
        ],
      }),
    ).toThrow();
  });
});
