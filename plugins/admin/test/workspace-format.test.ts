import { describe, expect, it } from "bun:test";
import { peerOriginLabel } from "../src/workspace-format";

describe("peerOriginLabel", () => {
  it("names this brain when nobody vouched the person in", () => {
    expect(peerOriginLabel(undefined)).toBe("This brain");
  });

  it("reads a did:web peer as its domain", () => {
    expect(peerOriginLabel("did:web:grace.example")).toBe("grace.example");
    expect(peerOriginLabel("did:web:velt.coop:brains:atlas")).toBe(
      "velt.coop/brains/atlas",
    );
  });

  it("keeps identifiers it cannot shorten", () => {
    expect(peerOriginLabel("did:plc:2x7kqz")).toBe("did:plc:2x7kqz");
    expect(peerOriginLabel("velt.coop")).toBe("velt.coop");
  });
});
