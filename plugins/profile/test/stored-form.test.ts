import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  fetchAnchorProfileData,
  type AnchorProfileReader,
} from "../src/helpers";
import { isLegacyBrainCharacterContent } from "../src/starter-identity";

/**
 * The identity singletons in their next stored form
 * (docs/external-plugin-authoring.md, The stored format): the profile's data and the starter's
 * legacy check read a document in either form the same.
 */
const reader = (content: string): AnchorProfileReader => ({
  listEntities: async () => [
    {
      id: "anchor-profile",
      entityType: "anchor-profile",
      content,
      contentHash: "",
      visibility: "public",
      created: "",
      updated: "",
      metadata: {},
    },
  ],
});

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  purpose: z.string().optional(),
  story: z.string().optional(),
});

describe("the identity singletons in either stored form", () => {
  it("read the profile's data the same", async () => {
    const current =
      "---\nname: Team\ndescription: A small team.\npurpose: Keep what we learn.\n---\nWe began in 2020.\n";
    const next =
      "---\nname: Team\n---\n## Description\n\nA small team.\n\n## Purpose\n\nKeep what we learn.\n\n## Story\n\nWe began in 2020.\n";
    expect(await fetchAnchorProfileData(reader(next), schema)).toEqual(
      await fetchAnchorProfileData(reader(current), schema),
    );
  });

  it("recognise a legacy starter character in either form", () => {
    expect(
      isLegacyBrainCharacterContent(
        "---\nname: Brain\nrole: Knowledge assistant\n---\n## Purpose\n\nHelp organize, understand, and retrieve information from your knowledge base\n\n## Values\n\n- clarity\n- accuracy\n- helpfulness\n",
      ),
    ).toBe(true);
  });
});
