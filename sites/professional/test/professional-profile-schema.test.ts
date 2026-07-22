import { describe, expect, it } from "bun:test";
import {
  professionalProfileExtension,
  professionalProfileSchema,
} from "../src/schemas";

describe("professional profile schema", () => {
  it("defines professional profile fields in one shared extension", () => {
    expect(professionalProfileExtension.shape).toHaveProperty("role");
    expect(professionalProfileExtension.shape).toHaveProperty("audience");
    expect(professionalProfileExtension.shape).toHaveProperty("expertise");
    expect(professionalProfileExtension.shape).toHaveProperty("availability");
  });

  it("validates Rover onboarding profile content shape", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      kind: "person",
      role: "advisor",
      audience: "climate-tech founders",
      expertise: ["resilient software systems"],
      availability: "Open to advisory work",
    });

    expect(parsed.expertise).toEqual(["resilient software systems"]);
    expect(parsed.availability).toBe("Open to advisory work");
  });
});
