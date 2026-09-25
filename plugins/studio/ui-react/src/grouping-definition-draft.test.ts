import { expect, test } from "bun:test";
import {
  addGroupingDefinition,
  createGroupingDefinitionDraft,
  inspectGroupingDefinitionDraft,
  replaceGroupingDefinitionRow,
} from "./grouping-definition-draft";
const eligible = new Set(["note", "post"]);
const definition = {
  label: "Clients",
  types: ["note"],
  multiple: false,
  values: ["Acme", " Acme ", "a,b", "acme"],
};
test("validation retains authored values and unknown properties rather than normalizing a draft", () => {
  const source = {
    clients: { ...definition, unexpected: "keep until explicitly repaired" },
  };
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
    eligible,
  );
  expect(result.value).toEqual(source);
  expect(result.issues.length).toBeGreaterThan(0);
  expect(source.clients.values).toEqual(["Acme", " Acme ", "a,b", "acme"]);
});
test("saved keys cannot be renamed even through the draft model", () => {
  const draft = createGroupingDefinitionDraft({ clients: definition }, [
    "clients",
  ]);
  expect(() =>
    replaceGroupingDefinitionRow(draft, 0, { key: "customers" }),
  ).toThrow("Saved grouping keys cannot be renamed");
  expect(draft.rows[0]?.key).toBe("clients");
});
test("duplicate-key drafts are never collapsed to a document map", () => {
  const original = createGroupingDefinitionDraft({ clients: definition });
  const draft = replaceGroupingDefinitionRow(
    addGroupingDefinition(original),
    1,
    { key: "clients" },
  );
  const result = inspectGroupingDefinitionDraft(draft, eligible);
  expect(result.value).toBeUndefined();
  expect(result.pendingChanges).toBe(true);
  expect(draft.rows.map((row) => row.key)).toEqual(["clients", "clients"]);
  expect(draft.rows[0]?.value).toEqual(definition);
});
test("the twenty-definition limit does not discard overflowing source entries", () => {
  const source = Object.fromEntries(
    Array.from({ length: 21 }, (_, index) => [`group-${index}`, definition]),
  );
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
    eligible,
  );
  expect(result.value).toEqual(source);
  expect(result.issues.some((issue) => issue.message.includes("20"))).toBe(
    true,
  );
});
test("the control document and missing contributors cannot be admitted by the draft", () => {
  const source = {
    clients: {
      ...definition,
      types: ["note", "grouping-definitions", "missing"],
    },
  };
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
    eligible,
  );
  expect(result.value).toEqual(source);
  expect(result.issues.map((issue) => issue.message)).toEqual(
    expect.arrayContaining([
      "The grouping definitions document cannot be a grouping contributor.",
      "Unavailable contributor type: missing. Choose an available type.",
    ]),
  );
});
