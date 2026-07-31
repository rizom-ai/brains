import { describe, expect, it } from "bun:test";
import { logKeyGroup, logMissingSecrets } from "../src/push-secrets";

describe("logKeyGroup", () => {
  it("logs a header with count and one line per key", () => {
    const lines: string[] = [];
    logKeyGroup((message) => lines.push(message), "Created secrets", [
      "AI_API_KEY",
      "HCLOUD_TOKEN",
    ]);

    expect(lines).toEqual([
      "Created secrets (2):",
      "  - AI_API_KEY",
      "  - HCLOUD_TOKEN",
    ]);
  });

  it("logs nothing for an empty key list", () => {
    const lines: string[] = [];
    logKeyGroup((message) => lines.push(message), "Created secrets", []);
    expect(lines).toEqual([]);
  });
});

describe("logMissingSecrets", () => {
  it("splits skipped keys into required and optional groups", () => {
    const lines: string[] = [];
    logMissingSecrets(
      (message) => lines.push(message),
      ["AI_API_KEY", "OPTIONAL_TOKEN"],
      (key) => key === "AI_API_KEY",
    );

    expect(lines).toEqual([
      "Required before first deploy (1):",
      "  - AI_API_KEY",
      "Safe to ignore for now (1):",
      "  - OPTIONAL_TOKEN",
    ]);
  });

  it("logs nothing when no keys were skipped", () => {
    const lines: string[] = [];
    logMissingSecrets(
      (message) => lines.push(message),
      [],
      () => true,
    );
    expect(lines).toEqual([]);
  });
});
