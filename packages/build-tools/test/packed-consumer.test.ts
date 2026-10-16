import { describe, expect, test } from "bun:test";
import { packedSiteEvidenceEnabled } from "../src/packed-consumer";

describe("packedSiteEvidenceEnabled", () => {
  test("runs the packed site evidence only when asked for", () => {
    expect(packedSiteEvidenceEnabled({ PACKED_SITE_EVIDENCE: "1" })).toBe(true);
    expect(packedSiteEvidenceEnabled({ PACKED_SITE_EVIDENCE: "0" })).toBe(
      false,
    );
    expect(packedSiteEvidenceEnabled({})).toBe(false);
  });
});
