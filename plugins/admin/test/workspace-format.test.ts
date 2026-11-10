import { describe, expect, it } from "bun:test";
import { mutationContext, peerOriginLabel } from "../src/workspace-format";

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

describe("mutationContext", () => {
  it("names the signed-in actor as the one who acts", () => {
    expect(
      mutationContext({
        actor: { id: "user-1", displayName: "Ada" },
        permission: "admin",
        isAnchor: true,
      }),
    ).toEqual({ actorUserId: "user-1" });
  });

  it("refuses an action nobody signed in to take", () => {
    expect(() => mutationContext(null)).toThrow(
      "Administration action requires a signed-in actor",
    );
  });
});
