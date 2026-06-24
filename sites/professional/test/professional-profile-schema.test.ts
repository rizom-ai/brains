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
    expect(professionalProfileExtension.shape).toHaveProperty("desiredTone");
  });

  it("validates Rover onboarding profile content shape", () => {
    const parsed = professionalProfileSchema.parse({
      name: "Ada Morgan",
      kind: "professional",
      role: "advisor",
      audience: "climate-tech founders",
      expertise: ["resilient software systems"],
      desiredTone: "clear, practical, quietly confident",
    });

    expect(parsed.expertise).toEqual(["resilient software systems"]);
    expect(parsed.desiredTone).toBe("clear, practical, quietly confident");
  });
});
