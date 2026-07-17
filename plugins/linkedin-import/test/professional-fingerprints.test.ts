import { describe, expect, it } from "bun:test";
import {
  certificationFingerprint,
  educationFingerprint,
  positionFingerprint,
  skillFingerprint,
} from "../src/lib/professional-fingerprints";

describe("professional record fingerprints", () => {
  it("normalizes display-only differences", () => {
    expect(skillFingerprint("  Systems   Design ")).toBe(
      skillFingerprint("systems design"),
    );
    expect(
      positionFingerprint({
        companyName: "EXAMPLE LABS",
        title: "Engineer",
        startedOn: "2020-01",
      }),
    ).toBe(
      positionFingerprint({
        companyName: " example labs ",
        title: "engineer",
        startedOn: "2020-01",
        description: "A description does not define record identity",
      }),
    );
    expect(
      educationFingerprint({
        schoolName: "Example University",
        degreeName: "MSc",
        fieldOfStudy: "Systems",
        startedOn: "2018",
      }),
    ).toBe(
      educationFingerprint({
        schoolName: "example university",
        degreeName: "msc",
        fieldOfStudy: " systems ",
        startedOn: "2018",
        notes: "Notes do not define record identity",
      }),
    );
  });

  it("prefers certification credential identity", () => {
    expect(
      certificationFingerprint({
        name: "Original Name",
        issuingOrganization: "Example Guild",
        credentialId: "CERT-1",
      }),
    ).toBe(
      certificationFingerprint({
        name: "Updated Name",
        issuingOrganization: "example guild",
        credentialId: "cert-1",
      }),
    );
    expect(
      certificationFingerprint({
        name: "Architecture Certificate",
        issuingOrganization: "Example Guild",
        issuedOn: "2024-01",
      }),
    ).not.toBe(
      certificationFingerprint({
        name: "Architecture Certificate",
        issuingOrganization: "Example Guild",
        issuedOn: "2025-01",
      }),
    );
  });
});
