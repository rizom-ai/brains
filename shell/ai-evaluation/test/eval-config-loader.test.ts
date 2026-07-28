import { describe, expect, it } from "bun:test";

import { resolveEvalSelection } from "../src/eval-config-loader";

const rawYaml = {
  suites: {
    core: {
      bundles: ["core"],
      tags: ["bundle-core"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/core",
        },
      },
    },
    personal: {
      extends: "core",
      bundles: ["core", "site", "publishing"],
      tags: ["posture-personal"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/personal",
        },
      },
    },
    commerce: {
      extends: "core",
      bundles: ["core", "site"],
      add: ["products"],
      tags: ["posture-commerce"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/commerce",
        },
      },
    },
  },
};

describe("resolveEvalSelection", () => {
  it("resolves inherited suite bundles, additions, and tags", () => {
    expect(resolveEvalSelection(rawYaml, { suite: "commerce" })).toEqual({
      bundles: ["core", "site"],
      add: ["products"],
      tags: ["bundle-core", "posture-commerce"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/commerce",
        },
      },
    });
  });

  it("lets explicit CLI tags override suite tags", () => {
    expect(
      resolveEvalSelection(rawYaml, {
        suite: "personal",
        tags: ["smoke"],
      }),
    ).toEqual({
      bundles: ["core", "site", "publishing"],
      tags: ["smoke"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/personal",
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
                  seedContentPath: "eval-content/core",
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
          seedContentPath: "eval-content/core",
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
