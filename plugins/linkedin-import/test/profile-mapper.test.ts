import { describe, expect, it } from "bun:test";
import { mapLinkedInProfile } from "../src/lib/profile-mapper";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

const records = profileSnapshot.elements.flatMap(
  (element) => element.snapshotData,
);

describe("mapLinkedInProfile", () => {
  it("maps LinkedIn's documented PROFILE keys to profile fields", () => {
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

  it("leaves out blank and missing values", () => {
    expect(
      mapLinkedInProfile([
        { "First Name": "Ada", "Last Name": " ", Headline: "", Websites: "" },
      ]),
    ).toEqual({ name: "Ada" });
  });

  it("takes the first value found across records", () => {
    expect(
      mapLinkedInProfile([{ Industry: "" }, { Industry: "Software" }]),
    ).toEqual({ industry: "Software" });
  });

  it("keeps no website without an http address", () => {
    expect(mapLinkedInProfile([{ Websites: "Portfolio: ada" }])).toEqual({});
  });
});
