import { describe, expect, test } from "bun:test";
import { findTestAssertionsInSource } from "./check-test-assertions";
import {
  constructsInHookThenExists,
  constructsThenAssertsBehavior,
  constructsThenExists,
  createsThenExists,
  looksUpThenExists,
} from "./check-test-assertions.fixtures";

describe("instantiation-only tests", () => {
  test("flags a constructed value whose only assertion is toBeDefined", () => {
    expect(
      findTestAssertionsInSource("example.test.ts", constructsThenExists),
    ).toEqual([
      {
        file: "example.test.ts",
        line: 2,
        test: "is instantiable",
        rule: "instantiation",
        detail: "service = new TopicService(...)",
      },
    ]);
  });

  test("flags a factory result checked only for existence", () => {
    expect(
      findTestAssertionsInSource("example.test.ts", createsThenExists),
    ).toEqual([
      {
        file: "example.test.ts",
        line: 2,
        test: "creates a context",
        rule: "instantiation",
        detail: "context = createEntityPluginContext(...)",
      },
    ]);
  });

  test("flags a value constructed in a hook and only checked for existence", () => {
    expect(
      findTestAssertionsInSource("example.test.ts", constructsInHookThenExists),
    ).toEqual([
      {
        file: "example.test.ts",
        line: 8,
        test: "should be instantiable",
        rule: "instantiation",
        detail: "plugin = new TopicsPlugin(...)",
      },
    ]);
  });

  test("accepts toBeDefined on a looked-up value, which can be absent", () => {
    expect(
      findTestAssertionsInSource("example.test.ts", looksUpThenExists),
    ).toEqual([]);
  });

  test("accepts a constructed value with a real assertion besides existence", () => {
    expect(
      findTestAssertionsInSource(
        "example.test.ts",
        constructsThenAssertsBehavior,
      ),
    ).toEqual([]);
  });
});
