import { describe, expect, it } from "bun:test";
import { formatReceivedAt } from "../src/operator-studio";

describe("formatReceivedAt", () => {
  // Shared metadata renders the readable date and retains this exact instant.
  it("preserves an absolute instant for semantic shared rendering", () => {
    expect(formatReceivedAt("2026-07-11T09:14:00.000Z")).toBe(
      "2026-07-11T09:14:00.000Z",
    );
  });

  it("states the zone, because the reader is not necessarily in it", () => {
    expect(formatReceivedAt("2026-07-11T11:14:00+02:00")).toBe(
      "2026-07-11T09:14:00.000Z",
    );
  });

  // The snapshot is cached and re-served, so a relative rendering computed
  // here would age against whoever eventually reads it.
  it("does not render relatively", () => {
    expect(formatReceivedAt("2026-07-11T09:14:00.000Z")).not.toContain("ago");
  });

  it("passes through a value it cannot read rather than inventing one", () => {
    expect(formatReceivedAt("not-a-date")).toBe("not-a-date");
  });
});
