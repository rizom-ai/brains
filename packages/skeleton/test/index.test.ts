import { describe, expect, test } from "bun:test";
import { sayHello } from "../src/index";

describe("sayHello", () => {
  test("returns a greeting with the name", () => {
    expect(sayHello("World")).toBe("Hello, World! Welcome to Personal Brain.");
  });
});