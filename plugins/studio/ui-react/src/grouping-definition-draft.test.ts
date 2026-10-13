import { expect, test } from "bun:test";
import {
  addGroupingDefinition,
  createGroupingDefinitionDraft,
  inspectGroupingDefinitionDraft,
  replaceGroupingDefinitionRow,
} from "./grouping-definition-draft";
const definition = {
  label: "Clients",
  multiple: false,
  values: ["Acme", " Acme ", "a,b", "acme"],
};
test("validation retains authored values and unknown properties rather than normalizing a draft", () => {
  const source = {
    clients: { ...definition, unexpected: "keep until explicitly repaired" },
  };
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
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
  const result = inspectGroupingDefinitionDraft(draft);
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
  );
  expect(result.value).toEqual(source);
  expect(result.issues.some((issue) => issue.message.includes("20"))).toBe(
    true,
  );
});
test("new definitions default to every eligible content type without a type setting", () => {
  const draft = addGroupingDefinition(createGroupingDefinitionDraft({}));
  expect(draft.rows[0]?.value).toEqual({ label: "", multiple: true });
  const ready = replaceGroupingDefinitionRow(draft, 0, {
    key: "clients",
    value: definition,
  });
  expect(inspectGroupingDefinitionDraft(ready).issues).toEqual([]);
});
test("unavailable excluded types remain exact so reinstalling a type retains the exclusion", () => {
  const source = {
    clients: { ...definition, excludeTypes: ["missing", "post"] },
  };
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
  );
  expect(result.value).toEqual(source);
  expect(result.issues).toEqual([]);
});
test("invalid exclusion drafts remain visible and block saves", () => {
  const source = { clients: { ...definition, excludeTypes: ["post", "post"] } };
  const result = inspectGroupingDefinitionDraft(
    createGroupingDefinitionDraft(source),
  );
  expect(result.value).toEqual(source);
  expect(
    result.issues.some((issue) => issue.path.includes("excludeTypes")),
  ).toBe(true);
});
