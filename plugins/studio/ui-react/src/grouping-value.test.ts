import { expect, test } from "bun:test";
import { groupingValueLabel } from "./grouping-value";

test("ordinary grouping names, including commas, remain readable", () => {
  expect(groupingValueLabel("Acme, Inc.")).toBe("Acme, Inc.");
  expect(groupingValueLabel("Acme")).toBe("Acme");
});

test("empty, whitespace, control, and quoted values have distinct lossless labels", () => {
  const values = [
    "",
    " ",
    "  ",
    " Acme ",
    "Acme  Inc.",
    "\tAcme",
    "\ufeffAcme",
    '"Acme"',
    "Acme\u0000",
    String.raw`\u0020`,
  ];
  const labels = values.map(groupingValueLabel);
  expect(new Set(labels).size).toBe(values.length);
  expect(labels.map((label): unknown => JSON.parse(label))).toEqual(values);
  expect(groupingValueLabel(" Acme ")).toBe('"\\u0020Acme\\u0020"');
  expect(groupingValueLabel("\ufeffAcme")).toBe('"\\ufeffAcme"');
});
