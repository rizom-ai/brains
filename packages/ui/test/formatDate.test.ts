import { describe, expect, it } from "bun:test";
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
      formatDate(new Date(2024, 0, 15, 15, 30), {
        style: "long",
        includeTime: true,
      }),
    ).toBe("January 15, 2024 at 3:30 PM");
  });

  it("accepts Date objects", () => {
    expect(formatDate(new Date(2024, 0, 15), { style: "medium" })).toBe(
      "Jan 15, 2024",
    );
  });
});
