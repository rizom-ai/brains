import { describe, expect, it } from "bun:test";
import { askSourcesDetailSchema, chatSourceCitationSchema } from "../src/chat";
import { SourceCitationSchema } from "../src/agent-response";
import { answeredBy } from "../src/ask-box";

// A source may come from another brain's published memory. The citation and
// the host event carry that brain, so a page can show whose memory answered.
describe("a source's brain", () => {
  const brain = { name: "Becca", url: "https://becca.rizom.ai" };

  it("rides on a citation, and is optional", () => {
    const cited = chatSourceCitationSchema.parse({
      id: "network-piece:becca/post/handoffs",
      source: "network-piece",
      title: "Handoffs between teams",
      brain,
    });
    expect(cited.brain).toEqual(brain);
    expect(
      chatSourceCitationSchema.parse({ id: "post:hiding", source: "post" })
        .brain,
    ).toBeUndefined();
  });

  it("rides on the answer's own citation, where the brain first names it", () => {
    const cited = SourceCitationSchema.parse({
      id: "network-piece:plc-peer--post--3kabc",
      source: "network-piece",
      url: "https://becca.rizom.ai/essays/handoffs",
      brain,
    });
    expect(cited.brain).toEqual(brain);
    expect(
      SourceCitationSchema.parse({ id: "post:hiding", source: "post" }).brain,
    ).toBeUndefined();
  });

  it("rides on the host event's sources, and is optional", () => {
    const detail = askSourcesDetailSchema.parse({
      sources: [
        { id: "post:hiding", title: "Hiding in Plain Sight" },
        { id: "network-piece:becca/post/handoffs", title: "Handoffs", brain },
      ],
    });
    expect(detail.sources[1]?.brain).toEqual(brain);
    expect(detail.sources[0]?.brain).toBeUndefined();
  });

  it("names the brain and may give its address, nothing else", () => {
    expect(() =>
      askSourcesDetailSchema.parse({
        sources: [{ id: "x", title: "x", brain: { url: "https://b.test" } }],
      }),
    ).toThrow();
    expect(() =>
      askSourcesDetailSchema.parse({
        sources: [{ id: "x", title: "x", brain: { name: "B", url: "nope" } }],
      }),
    ).toThrow();
  });
});

describe("who answered", () => {
  it("names the owner, then each brain once, in arrival order", () => {
    expect(answeredBy("Rizom", [])).toBe("Rizom");
    expect(answeredBy("Rizom", ["Becca"])).toBe("Rizom, with Becca");
    expect(answeredBy("Rizom", ["Jo", "Becca", "Jo", "Sam"])).toBe(
      "Rizom, with Jo, Becca and Sam",
    );
  });
});
