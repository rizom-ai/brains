import { describe, expect, it } from "bun:test";

import { resolveEvalSelection } from "../src/eval-config-loader";

const rawYaml = {
  suites: {
    core: {
      preset: "core",
      tags: ["preset-core"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content-core",
        },
      },
    },
    default: {
      extends: "core",
      preset: "default",
      tags: ["preset-default"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content-default",
        },
      },
    },
    full: {
      extends: "default",
      preset: "full",
      tags: ["preset-full"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content",
        },
      },
    },
  },
};

describe("resolveEvalSelection", () => {
  it("resolves inherited suite preset and tags", () => {
    expect(resolveEvalSelection(rawYaml, { suite: "full" })).toEqual({
      preset: "full",
      tags: ["preset-core", "preset-default", "preset-full"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content",
        },
      },
    });
  });

  it("lets explicit CLI preset and tags override suite fields", () => {
    expect(
      resolveEvalSelection(rawYaml, {
        suite: "default",
        preset: "core",
        tags: ["smoke"],
      }),
    ).toEqual({
      preset: "core",
      tags: ["smoke"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content-default",
        },
      },
    });
  });

  it("inherits and deep-merges suite plugin overrides", () => {
    expect(
      resolveEvalSelection(
        {
          suites: {
            core: {
              plugins: {
                "directory-sync": {
                  seedContentPath: "eval-content-core",
                  git: { branch: "main" },
                },
              },
            },
            smoke: {
              extends: "core",
              plugins: {
                "directory-sync": {
                  git: { branch: "smoke" },
                },
              },
            },
          },
        },
        { suite: "smoke" },
      ),
    ).toEqual({
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content-core",
          git: { branch: "smoke" },
        },
      },
    });
  });

  it("rejects unknown suites", () => {
    expect(() => resolveEvalSelection(rawYaml, { suite: "missing" })).toThrow(
      'Unknown eval suite "missing".',
    );
  });

  it("rejects suite cycles", () => {
    expect(() =>
      resolveEvalSelection(
        {
          suites: {
            a: { extends: "b", tags: ["a"] },
            b: { extends: "a", tags: ["b"] },
          },
        },
        { suite: "a" },
      ),
    ).toThrow('Eval suite "a" extends itself in a cycle.');
  });
});
