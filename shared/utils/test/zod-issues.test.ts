import { describe, expect, it } from "bun:test";
import { z } from "../src/zod";
import { formatZodIssues } from "../src/zod-issues";

function issuesOf(schema: z.ZodType, value: unknown): z.ZodError {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error("Expected the value to be refused");
  return parsed.error;
}

describe("formatZodIssues", () => {
  it("names each issue's path and message", () => {
    const error = issuesOf(
      z.object({ title: z.string(), tags: z.array(z.string()) }),
      { tags: [1] },
    );
    expect(formatZodIssues(error)).toBe(
      "title: Invalid input: expected string, received undefined, tags.0: Invalid input: expected string, received number",
    );
  });

  it("names the root when the value itself is refused", () => {
    expect(formatZodIssues(issuesOf(z.string(), 1))).toBe(
      "(root): Invalid input: expected string, received number",
    );
  });

  it("cuts between whole issues to fit a bound, and says how many it left out", () => {
    const fields = Array.from({ length: 50 }, (_, index) => `field${index}`);
    const error = issuesOf(
      z.object(Object.fromEntries(fields.map((name) => [name, z.string()]))),
      {},
    );
    const issue = (name: string): string =>
      `${name}: Invalid input: expected string, received undefined`;
    const bounded = formatZodIssues(error, { maxLength: 300 });

    expect(bounded.length).toBeLessThanOrEqual(300);
    const match = /^(.*), … (\d+) more$/su.exec(bounded);
    expect(match).not.toBeNull();
    const dropped = Number(match?.[2]);
    expect(dropped).toBeGreaterThan(0);
    expect(match?.[1]).toBe(
      fields
        .slice(0, fields.length - dropped)
        .map(issue)
        .join(", "),
    );
  });

  it("leaves a list that fits untouched", () => {
    const error = issuesOf(z.object({ title: z.string() }), {});
    expect(formatZodIssues(error, { maxLength: 1024 })).toBe(
      formatZodIssues(error),
    );
  });

  it("shortens a single issue that alone exceeds the bound", () => {
    const error = issuesOf(z.object({ ["x".repeat(400)]: z.string() }), {});
    const bounded = formatZodIssues(error, { maxLength: 100 });
    expect(bounded.length).toBeLessThanOrEqual(100);
    expect(bounded).toEndWith("…");
    expect(bounded).toStartWith("xxx");
  });
});
