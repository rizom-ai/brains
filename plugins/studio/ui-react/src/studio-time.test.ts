import { expect, it, spyOn } from "bun:test";
import { formatUpdated } from "./ui-utils";

it("uses truthful singular relative updates and absolute dates outside the recent past", () => {
  const now = Date.parse("2026-09-14T12:00:00Z");
  const clock = spyOn(Date, "now").mockReturnValue(now);
  try {
    const ago = (seconds: number): string =>
      formatUpdated(new Date(now - seconds * 1000).toISOString());
    expect(ago(30)).toBe("Just now");
    expect(ago(60)).toBe("1 minute ago");
    expect(ago(120)).toBe("2 minutes ago");
    expect(ago(3600)).toBe("1 hour ago");
    expect(ago(7200)).toBe("2 hours ago");
    expect(ago(86400)).toBe("yesterday");
    expect(ago(172800)).toBe("2 days ago");
    expect(ago(14 * 86400)).not.toContain("ago");
    expect(ago(-3600)).not.toContain("ago");
    expect(formatUpdated("invalid")).toBe("");
  } finally {
    clock.mockRestore();
  }
});
