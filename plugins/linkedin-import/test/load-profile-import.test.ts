import { describe, expect, it, mock } from "bun:test";
import { loadLinkedInProfileImport } from "../src/lib/load-profile-import";
import { getLinkedInSnapshotImportDomains } from "../src/lib/transform/registry";

describe("loadLinkedInProfileImport", () => {
  it("fetches only fixture-backed domains registered for durable import", async () => {
    const fetchDomain = mock(async () => [
      {
        "First Name": "Ada",
        "Last Name": "Morgan",
        Headline: "Systems Architect",
      },
    ]);

    const result = await loadLinkedInProfileImport({ fetchDomain });

    expect(getLinkedInSnapshotImportDomains()).toEqual(["PROFILE"]);
    expect(fetchDomain).toHaveBeenCalledTimes(1);
    expect(fetchDomain).toHaveBeenCalledWith("PROFILE");
    expect(result).toEqual({
      patch: { name: "Ada Morgan", headline: "Systems Architect" },
      recordsRead: 1,
    });
  });

  it("returns an empty patch when registered domains contain no member data", async () => {
    const result = await loadLinkedInProfileImport({
      fetchDomain: mock(async () => []),
    });

    expect(result).toEqual({ patch: {}, recordsRead: 0 });
  });
});
