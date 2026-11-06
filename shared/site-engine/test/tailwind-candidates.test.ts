import { describe, expect, it } from "bun:test";
import { TailwindCandidates } from "../src/tailwind-candidates";

describe("TailwindCandidates", () => {
  it("finds the utilities Tailwind would find in a page", () => {
    const candidates = new TailwindCandidates();
    candidates.add('<p class="italic md:flex">Text</p>');

    const found = candidates.toSource().split("\n");
    expect(found).toContain("italic");
    expect(found).toContain("md:flex");
  });

  it("scans pages in batches, and the pages still pending when asked", () => {
    const batches: number[] = [];
    const candidates = new TailwindCandidates(
      {
        scanFiles: (input): string[] => {
          batches.push(input.length);
          return input.map((file) => file.content ?? "");
        },
      },
      64,
    );

    Array.from({ length: 130 }, (_, index) => `page-${index}`).forEach((page) =>
      candidates.add(page),
    );
    expect(batches).toEqual([64, 64]);

    const found = candidates.toSource().split("\n");
    expect(batches).toEqual([64, 64, 2]);
    expect(found).toHaveLength(130);
    expect(found).toContain("page-129");
  });
});
