import { describe, expect, it } from "bun:test";
import type { JsonObjectOutputGuard } from "../src";

interface ValidDocument {
  title: string;
  nested: { count: number | null };
  items: Array<{ label: string }>;
}

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export type JsonDocumentGuardAssertions = [
  Assert<Equal<JsonObjectOutputGuard<ValidDocument>, unknown>>,
  Assert<Equal<JsonObjectOutputGuard<{ title?: string }>, never>>,
  Assert<
    Equal<
      JsonObjectOutputGuard<{
        nested: { value: string | undefined };
      }>,
      never
    >
  >,
  Assert<Equal<JsonObjectOutputGuard<string>, never>>,
  Assert<Equal<JsonObjectOutputGuard<object>, never>>,
  Assert<Equal<JsonObjectOutputGuard<() => void>, never>>,
  Assert<Equal<JsonObjectOutputGuard<string[]>, never>>,
];

describe("JSON document types", () => {
  it("round-trips nullable nested content", () => {
    const document: ValidDocument = {
      title: "Example",
      nested: { count: null },
      items: [{ label: "one" }],
    };

    expect(JSON.parse(JSON.stringify(document))).toStrictEqual(document);
  });
});
