import { describe, expect, it } from "bun:test";
import {
  professionalProfileExtension,
  professionalProfileSchema,
} from "../src/schemas";

describe("professional profile schema", () => {
  it("defines canonical and compatibility fields in one shared extension", () => {
    expect(professionalProfileExtension.shape).toHaveProperty("role");
    expect(professionalProfileExtension.shape).toHaveProperty("headline");
    expect(professionalProfileExtension.shape).toHaveProperty("skills");
    expect(professionalProfileExtension.shape).toHaveProperty("positions");
    expect(professionalProfileExtension.shape).toHaveProperty("education");
    expect(professionalProfileExtension.shape).toHaveProperty("certifications");
    expect(professionalProfileExtension.shape).toHaveProperty("expertise");
    expect(professionalProfileExtension.shape).toHaveProperty("audience");
    expect(professionalProfileExtension.shape).toHaveProperty("desiredTone");
  });

  it("validates canonical professional profile content", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      kind: "professional",
      role: "Advisor",
      headline: "Advisor for resilient software systems",
      industry: "Climate technology",
      location: "Rotterdam, Netherlands",
      expertise: ["resilient software systems"],
      skills: ["Systems architecture", "TypeScript"],
      positions: [{ companyName: "Rizom", title: "Advisor" }],
      education: [{ schoolName: "TU Delft" }],
      certifications: [{ name: "Cloud Architect" }],
    });

    expect(parsed.role).toBe("Advisor");
    expect(parsed.headline).toBe("Advisor for resilient software systems");
    expect(parsed.expertise).toEqual(["resilient software systems"]);
    expect(parsed.skills).toEqual(["Systems architecture", "TypeScript"]);
    expect(parsed.positions?.[0]?.companyName).toBe("Rizom");
  });

  it("continues to accept legacy communication fields", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      kind: "professional",
      audience: "climate-tech founders",
      desiredTone: "clear, practical, quietly confident",
    });

    expect(parsed.audience).toBe("climate-tech founders");
    expect(parsed.desiredTone).toBe("clear, practical, quietly confident");
  });
});
