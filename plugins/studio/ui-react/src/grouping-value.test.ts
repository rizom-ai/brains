import { expect, test } from "bun:test";
import { groupingValueLabel } from "./grouping-value";

const char = (code: number): string => String.fromCharCode(code);
/** The label's own escape spelling, built without embedding one literally. */
const escaped = (code: number): string =>
  `${char(92)}u${code.toString(16).padStart(4, "0")}`;
const NUL = char(0);
const TAB = char(9);
const BOM = char(0xfeff);
const BACKSLASH = char(92);
const MIDDLE_DOT = char(0xb7);

test("ordinary grouping names, including commas, remain readable", () => {
  expect(groupingValueLabel("Acme, Inc.")).toBe("Acme, Inc.");
  expect(groupingValueLabel("Acme")).toBe("Acme");
  // A stray edge space must not turn the whole name into escapes.
  expect(groupingValueLabel(" Acme, Inc. ")).toBe(
    `${MIDDLE_DOT}Acme, Inc.${MIDDLE_DOT}`,
  );
});

test("empty, whitespace, control and marker values keep distinct labels", () => {
  const values = [
    "",
    "(empty)",
    `${escaped(0x28)}empty)`,
    " ",
    "  ",
    " Acme ",
    "Acme  Inc.",
    `${TAB}Acme`,
    `${BOM}Acme`,
    '"Acme"',
    `Acme${NUL}`,
    `${BACKSLASH}u0020`,
    `${MIDDLE_DOT}Acme${MIDDLE_DOT}`,
  ];
  expect(new Set(values.map(groupingValueLabel)).size).toBe(values.length);
});

test("only what a reader cannot see is marked or escaped", () => {
  expect(groupingValueLabel("")).toBe("(empty)");
  expect(groupingValueLabel("(empty)")).toBe(`${escaped(0x28)}empty)`);
  expect(groupingValueLabel(" ")).toBe(MIDDLE_DOT);
  expect(groupingValueLabel("Acme  Inc.")).toBe(
    `Acme${MIDDLE_DOT}${MIDDLE_DOT}Inc.`,
  );
  expect(groupingValueLabel(`${TAB}Acme`)).toBe(`${escaped(9)}Acme`);
  expect(groupingValueLabel(`${BOM}Acme`)).toBe(`${escaped(0xfeff)}Acme`);
  expect(groupingValueLabel(`Acme${NUL}`)).toBe(`Acme${escaped(0)}`);
  // Quotes are ordinary characters in a name and stay legible.
  expect(groupingValueLabel('"Acme"')).toBe('"Acme"');
  // A literal middle dot cannot be mistaken for a marked space.
  expect(groupingValueLabel(MIDDLE_DOT)).toBe(escaped(0xb7));
  // A typed backslash sequence never reads back as a real control character.
  expect(groupingValueLabel(`${BACKSLASH}u0009`)).toBe(
    `${BACKSLASH}${BACKSLASH}u0009`,
  );
});
