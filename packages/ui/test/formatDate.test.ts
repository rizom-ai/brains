import { afterEach, describe, expect, it } from "bun:test";
import { formatDate } from "../src/utils/formatDate";

describe("formatDate", () => {
  it("formats medium style as en-US regardless of runtime locale", () => {
    expect(formatDate("2024-01-15", { style: "medium" })).toBe("Jan 15, 2024");
  });

  it("formats long style as en-US", () => {
    expect(formatDate("2024-01-15", { style: "long" })).toBe(
      "January 15, 2024",
    );
  });

  it("formats full style with weekday", () => {
    expect(formatDate("2024-01-15", { style: "full" })).toBe(
      "Monday, January 15, 2024",
    );
  });

  it("defaults to short en-US numeric style", () => {
    expect(formatDate("2024-01-15")).toBe("1/15/2024");
  });

  it("appends the time to the chosen style with includeTime", () => {
    expect(
      formatDate(new Date(Date.UTC(2024, 0, 15, 15, 30)), {
        style: "long",
        includeTime: true,
      }),
    ).toBe("January 15, 2024 at 3:30 PM");
  });

  it("accepts Date objects", () => {
    expect(
      formatDate(new Date(Date.UTC(2024, 0, 15)), { style: "medium" }),
    ).toBe("Jan 15, 2024");
  });
});

describe("formatDate in the build machine's time zone", () => {
  const buildZone = process.env["TZ"];
  afterEach(() => {
    if (buildZone === undefined) delete process.env["TZ"];
    else process.env["TZ"] = buildZone;
  });

  // A static build renders the same dates wherever it runs: the day and time
  // a value names in UTC, never shifted into the machine's zone.
  for (const zone of [
    "UTC",
    "Asia/Taipei",
    "America/Los_Angeles",
    "Pacific/Kiritimati",
  ]) {
    it(`renders the same text when built in ${zone}`, () => {
      process.env["TZ"] = zone;

      expect(formatDate("2026-03-14")).toBe("3/14/2026");
      expect(
        formatDate("2026-03-14T23:30:00Z", {
          style: "long",
          includeTime: true,
        }),
      ).toBe("March 14, 2026 at 11:30 PM");
    });
  }
});
