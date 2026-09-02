import { describe, expect, it } from "bun:test";
import { formatReceivedAt } from "../src/operator-studio";

describe("formatReceivedAt", () => {
  // Rows shipped the stored ISO string straight into metadata, so a phone
  // showed "2026-07-11T09:14:00.000Z" and wrapped the line three deep.
  it("renders a stored instant as something readable", () => {
    expect(formatReceivedAt("2026-07-11T09:14:00.000Z")).toBe(
      "2026-07-11 09:14 UTC",
    );
  });

  it("states the zone, because the reader is not necessarily in it", () => {
    expect(formatReceivedAt("2026-07-11T09:14:00.000Z")).toContain("UTC");
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
