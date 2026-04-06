import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getInvocationCwd } from "../src/lib/invocation-cwd";

describe("getInvocationCwd", () => {
  let originalInitCwd: string | undefined;

  beforeEach(() => {
    originalInitCwd = process.env["INIT_CWD"];
  });

  afterEach(() => {
    if (originalInitCwd !== undefined) {
      process.env["INIT_CWD"] = originalInitCwd;
    } else {
      delete process.env["INIT_CWD"];
    }
  });

  test("returns INIT_CWD when set", () => {
    process.env["INIT_CWD"] = "/some/user/dir";
    expect(getInvocationCwd()).toBe("/some/user/dir");
  });

  test("falls back to process.cwd() when INIT_CWD is not set", () => {
    delete process.env["INIT_CWD"];
    expect(getInvocationCwd()).toBe(process.cwd());
  });

  test("falls back to process.cwd() when INIT_CWD is empty string", () => {
    process.env["INIT_CWD"] = "";
    expect(getInvocationCwd()).toBe(process.cwd());
  });

  test("INIT_CWD wins over process.cwd() when set", () => {
    process.env["INIT_CWD"] = "/different/dir";
    expect(getInvocationCwd()).toBe("/different/dir");
    expect(getInvocationCwd()).not.toBe(process.cwd());
  });
});
