import { describe, expect, it } from "bun:test";
import { mapLinkedInProfile } from "../src/lib/transform/profile-mapper";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

describe("mapLinkedInProfile", () => {
  it("maps documented PROFILE keys into canonical profile fields", () => {
    const records = profileSnapshot.elements[0]?.snapshotData ?? [];

    expect(mapLinkedInProfile(records)).toEqual({
      name: "Ada Morgan",
      headline:
        "Advisor helping climate-tech founders build resilient software",
      industry: "Climate Technology",
      location: "Rotterdam, Netherlands",
      website: "https://ada.example.com",
      story:
        "I build resilient software systems for climate technology organizations.",
    });
  });

  it("omits empty and unsupported values", () => {
    expect(
      mapLinkedInProfile([
        {
          "First Name": " Ada ",
          "Last Name": "",
          Websites: "not a URL",
          Address: "Private address",
        },
      ]),
    ).toEqual({ name: "Ada" });
  });
});
