import { describe, expect, it, spyOn } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { resolveProfileDisplayNameSafely } from "../src/profile-display-name";

describe("resolveProfileDisplayNameSafely", () => {
  it("returns undefined when no resolver is configured", async () => {
    expect(
      await resolveProfileDisplayNameSafely(undefined, "profile_1"),
    ).toBeUndefined();
  });

  it("returns undefined for a missing profile entity id", async () => {
    const resolve = async (): Promise<string> => "Should not run";
    expect(
      await resolveProfileDisplayNameSafely(resolve, null),
    ).toBeUndefined();
    expect(await resolveProfileDisplayNameSafely(resolve, "")).toBeUndefined();
  });

  it("returns the resolved display name", async () => {
    expect(
      await resolveProfileDisplayNameSafely(async () => "Ada Lovelace", "p_1"),
    ).toBe("Ada Lovelace");
  });

  it("trims surrounding whitespace", async () => {
    expect(
      await resolveProfileDisplayNameSafely(async () => "  Ada  ", "p_1"),
    ).toBe("Ada");
  });

  it("treats whitespace-only and empty names as absent", async () => {
    expect(
      await resolveProfileDisplayNameSafely(async () => "   ", "p_1"),
    ).toBeUndefined();
    expect(
      await resolveProfileDisplayNameSafely(async () => undefined, "p_1"),
    ).toBeUndefined();
  });

  it("fails closed and logs when the resolver throws", async () => {
    const warnings: Array<{ message: string; context?: unknown }> = [];
    // The shared silent logger with warn spied: it implements the whole
    // Logger, and the spy records what the resolver reported.
    const logger = createSilentLogger();
    spyOn(logger, "warn").mockImplementation(
      (message: string, context?: unknown) => {
        warnings.push({ message, context });
      },
    );

    const result = await resolveProfileDisplayNameSafely(
      async () => {
        throw new Error("lookup exploded");
      },
      "p_1",
      logger,
    );

    expect(result).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toBe(
      "Failed to resolve CMS profile display name",
    );
  });

  it("fails closed without a logger when the resolver throws", async () => {
    const result = await resolveProfileDisplayNameSafely(async () => {
      throw new Error("lookup exploded");
    }, "p_1");
    expect(result).toBeUndefined();
  });
});
