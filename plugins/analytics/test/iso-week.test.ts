import { describe, it, expect } from "bun:test";
import { datesBetween, isoWeekOf } from "../src/lib/iso-week";

describe("isoWeekOf", () => {
  it("names a mid-year week and its Monday-to-Sunday span", () => {
    expect(isoWeekOf("2026-10-08")).toEqual({
      id: "2026-W41",
      start: "2026-10-05",
      end: "2026-10-11",
    });
  });

  it("puts a Monday and a Sunday in the same week", () => {
    expect(isoWeekOf("2026-10-05").id).toBe("2026-W41");
    expect(isoWeekOf("2026-10-11").id).toBe("2026-W41");
    expect(isoWeekOf("2026-10-12").id).toBe("2026-W42");
  });

  it("assigns early January to the week holding the year's first Thursday", () => {
    expect(isoWeekOf("2026-01-01")).toEqual({
      id: "2026-W01",
      start: "2025-12-29",
      end: "2026-01-04",
    });
  });

  it("assigns early January to the previous year's last week when needed", () => {
    expect(isoWeekOf("2027-01-01")).toEqual({
      id: "2026-W53",
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });
});

describe("datesBetween", () => {
  it("lists every date from start to end inclusive", () => {
    expect(datesBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("is empty when the end is before the start", () => {
    expect(datesBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });
});
