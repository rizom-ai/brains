import { describe, expect, test } from "bun:test";
import { cn } from "../src/ui/cn";

describe("cn", () => {
  test("keeps custom font-size utilities alongside text colors", () => {
    expect(cn("text-label-md", "text-accent")).toBe(
      "text-label-md text-accent",
    );
  });

  test("dedupes conflicting custom font-size utilities", () => {
    expect(cn("text-body-lg", "text-body-md")).toBe("text-body-md");
  });
});
