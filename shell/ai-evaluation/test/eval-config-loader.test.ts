import { describe, expect, it } from "bun:test";

import { resolveEvalSelection } from "../src/eval-config-loader";

const rawYaml = {
  suites: {
    core: {
      anchor: "person",
      kind: "professional",
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
    custom: {
      extends: "core",
      anchor: "organization",
      kind: "organization",
      bundles: ["core", "site"],
      add: ["assessment"],
      tags: ["custom"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/custom",
        },
      },
    },
  },
};

describe("resolveEvalSelection", () => {
  it("resolves inherited suite bundles, additions, and tags", () => {
    expect(resolveEvalSelection(rawYaml, { suite: "custom" })).toEqual({
      anchor: "organization",
      kind: "organization",
      bundles: ["core", "site"],
      add: ["assessment"],
      tags: ["bundle-core", "custom"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/custom",
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
      anchor: "person",
      kind: "professional",
      bundles: ["core", "site", "publishing"],
      tags: ["smoke"],
      plugins: {
        "directory-sync": {
          seedContentPath: "eval-content/personal",
        },
      },
    });
  });

  it("lets a child keep inherited config while replacing case tags", () => {
    expect(
      resolveEvalSelection(
        {
          suites: {
            core: {
              bundles: ["core"],
              tags: ["recipe-headless"],
            },
            personal: {
              extends: "core",
              inheritTags: false,
              tags: ["recipe-personal"],
            },
          },
        },
        { suite: "personal" },
      ),
    ).toEqual({
      bundles: ["core"],
      tags: ["recipe-personal"],
    });
  });

  it("rejects invalid tag inheritance policy", () => {
    expect(() =>
      resolveEvalSelection(
        {
          suites: {
            invalid: {
              inheritTags: "no",
              tags: ["invalid"],
            },
          },
        },
        { suite: "invalid" },
      ),
    ).toThrow(
      'Eval suite "invalid" has invalid inheritTags; expected a boolean.',
    );
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

  it("rejects invalid suite profile selections", () => {
    expect(() =>
      resolveEvalSelection(
        { suites: { bad: { anchor: "collective" } } },
        { suite: "bad" },
      ),
    ).toThrow(
      'Eval suite "bad" has invalid anchor; expected person, team, or organization.',
    );
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
