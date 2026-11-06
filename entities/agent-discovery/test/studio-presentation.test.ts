import { describe, expect, it } from "bun:test";
import { agentFrontmatterSchema } from "../src/schemas/agent";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

describe("an agent in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    const shape = agentFrontmatterSchema.shape;
    expect(
      Object.fromEntries(
        Object.entries(shape)
          .map(([name, field]) => [name, widget(field)])
          .filter(([, value]) => value !== undefined),
      ),
    ).toEqual({
      repoDid: "provenance",
      brainDid: "provenance",
      cardUri: "provenance",
      cardCid: "provenance",
      cardLastError: "hidden",
      cardFailureCount: "hidden",
      cardUnavailableAt: "hidden",
      cardStaleAfter: "hidden",
      discoveredAt: "provenance",
      introducedBy: "provenance",
      hops: "provenance",
    });
  });
});
