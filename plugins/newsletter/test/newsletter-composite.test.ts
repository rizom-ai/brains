import { describe, expect, test } from "bun:test";
import { newsletter, newsletterCompositeConfigSchema } from "../src";

describe("newsletter composite", () => {
  test("returns only the entity plugin without a configured provider", () => {
    const plugins = newsletter();
    expect(plugins.map((plugin) => plugin.id)).toEqual(["newsletter"]);
  });

  test("selects Buttondown as the delivery provider", () => {
    const plugins = newsletter({
      provider: {
        type: "buttondown",
        apiKey: "buttondown-key",
        doubleOptIn: false,
      },
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "newsletter",
      "buttondown",
    ]);
  });

  test("selects Resend as the delivery provider", () => {
    const plugins = newsletter({
      provider: {
        type: "resend",
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "Rizom <newsletter@example.com>",
      },
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "newsletter",
      "resend",
    ]);
  });

  test("rejects incomplete Resend configuration", () => {
    expect(
      newsletterCompositeConfigSchema.safeParse({
        provider: {
          type: "resend",
          apiKey: "resend-key",
          segmentId: "segment-1",
        },
      }).success,
    ).toBe(false);
  });

  test("rejects the replaced flat Buttondown configuration", () => {
    expect(
      newsletterCompositeConfigSchema.safeParse({
        apiKey: "legacy-key",
      }).success,
    ).toBe(false);
  });

  test("preserves entity and service plugin types", () => {
    const plugins = newsletter({
      provider: { type: "buttondown", apiKey: "buttondown-key" },
    });
    expect(plugins.find((plugin) => plugin.id === "newsletter")?.type).toBe(
      "entity",
    );
    expect(plugins.find((plugin) => plugin.id === "buttondown")?.type).toBe(
      "service",
    );
  });
});
