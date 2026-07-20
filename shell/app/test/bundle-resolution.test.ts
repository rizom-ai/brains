import { describe, expect, test } from "bun:test";
import type { PermissionConfig } from "@brains/templates";
import { defineBundle } from "../src/bundle-definition";
import { resolveBundleSelection } from "../src/bundle-resolution";

const catalogIds = ["alpha", "beta", "gamma", "delta"] as const;

describe("defineBundle", () => {
  test("validates and returns an isolated definition", () => {
    const input = {
      id: "core",
      members: ["alpha"],
      config: [{ member: "alpha", value: { enabled: true } }],
      permissions: [
        {
          member: "alpha",
          config: {
            rules: [{ pattern: "alpha:*", level: "anchor" }],
          },
        },
      ],
      agentInstructions: ["Use the core posture."],
      evalDisable: ["alpha"],
    } satisfies Parameters<typeof defineBundle>[0];

    const definition = defineBundle(input);

    expect(definition).toEqual(input);
    expect(definition).not.toBe(input);
    expect(definition.members).not.toBe(input.members);
    expect(definition.permissions?.[0]?.config).not.toBe(
      input.permissions[0]?.config,
    );
  });

  test("rejects duplicate members", () => {
    expect(() =>
      defineBundle({ id: "core", members: ["alpha", "alpha"] }),
    ).toThrow(/duplicate member/i);
  });

  test("requires contributions and eval exclusions to belong to the bundle", () => {
    expect(() =>
      defineBundle({
        id: "core",
        members: ["alpha"],
        config: [{ member: "beta", value: {} }],
      }),
    ).toThrow(/config contribution member/i);

    expect(() =>
      defineBundle({
        id: "core",
        members: ["alpha"],
        permissions: [{ member: "beta", config: {} }],
      }),
    ).toThrow(/permission contribution member/i);

    expect(() =>
      defineBundle({
        id: "core",
        members: ["alpha"],
        evalDisable: ["beta"],
      }),
    ).toThrow(/eval exclusion member/i);
  });

  test("keeps permission policy values opaque", () => {
    const futurePermissionConfig = {
      futurePolicy: { level: "future-level" },
    } as unknown as PermissionConfig;

    expect(
      defineBundle({
        id: "core",
        members: ["alpha"],
        permissions: [{ member: "alpha", config: futurePermissionConfig }],
      }).permissions,
    ).toEqual([{ member: "alpha", config: futurePermissionConfig }]);
  });
});

describe("resolveBundleSelection definition validation", () => {
  test("rejects duplicate and unknown selected bundle IDs", () => {
    const definitions = [defineBundle({ id: "core", members: ["alpha"] })];

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions,
        selected: ["core", "core"],
      }),
    ).toThrow(/duplicate selected bundle "core"/i);

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions,
        selected: ["missing"],
      }),
    ).toThrow(/unknown bundle "missing".*available: core/i);
  });

  test("rejects duplicate catalog IDs, duplicate bundle IDs, and unknown members", () => {
    expect(() =>
      resolveBundleSelection({
        catalogIds: ["alpha", "alpha"],
        definitions: [],
        selected: [],
      }),
    ).toThrow(/duplicate catalog member "alpha"/i);

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [
          defineBundle({ id: "core", members: ["alpha"] }),
          defineBundle({ id: "core", members: ["beta"] }),
        ],
        selected: ["core"],
      }),
    ).toThrow(/duplicate bundle definition "core"/i);

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [defineBundle({ id: "core", members: ["missing"] })],
        selected: ["core"],
      }),
    ).toThrow(/bundle "core" references unknown catalog member "missing"/i);
  });

  test("requires override references to name an earlier bundle with a real conflict", () => {
    const core = defineBundle({
      id: "core",
      members: ["alpha"],
      config: [{ member: "alpha", value: { route: "/" } }],
    });
    const site = defineBundle({
      id: "site",
      members: ["alpha"],
      config: [
        {
          member: "alpha",
          value: { route: "/dashboard" },
          overrides: "core",
        },
      ],
    });

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [site, core],
        selected: ["site", "core"],
      }),
    ).toThrow(/bundle "site".*override.*earlier bundle "core"/i);

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [
          core,
          defineBundle({
            id: "site",
            members: ["alpha"],
            config: [
              {
                member: "alpha",
                value: { analytics: true },
                overrides: "missing",
              },
            ],
          }),
        ],
        selected: ["core", "site"],
      }),
    ).toThrow(/bundle "site".*unknown bundle "missing"/i);

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [
          core,
          defineBundle({
            id: "site",
            members: ["alpha"],
            config: [
              {
                member: "alpha",
                value: { analytics: true },
                overrides: "core",
              },
            ],
          }),
        ],
        selected: ["site"],
      }),
    ).toThrow(/override of "core".*does not replace conflicting config/i);
  });
});

describe("resolveBundleSelection composition", () => {
  test("uses definition and catalog order regardless of selected YAML order", () => {
    const definitions = [
      defineBundle({ id: "core", members: ["beta", "alpha"] }),
      defineBundle({ id: "site", members: ["gamma", "beta"] }),
      defineBundle({ id: "team", members: ["delta"] }),
    ];

    const forward = resolveBundleSelection({
      catalogIds,
      definitions,
      selected: ["core", "site"],
    });
    const reverse = resolveBundleSelection({
      catalogIds,
      definitions,
      selected: ["site", "core"],
    });

    expect(reverse).toEqual(forward);
    expect(reverse.activeBundles).toEqual(["core", "site"]);
    expect(reverse.activeMembers).toEqual(["alpha", "beta", "gamma"]);
  });

  test("applies eval exclusions, then add, then remove", () => {
    const resolution = resolveBundleSelection({
      catalogIds,
      definitions: [
        defineBundle({
          id: "core",
          members: ["alpha", "beta"],
          evalDisable: ["beta"],
        }),
      ],
      selected: ["core"],
      mode: "eval",
      add: ["beta", "gamma", "missing"],
      remove: ["alpha", "gamma", "missing"],
    });

    expect(resolution.evalDisable).toEqual(["beta"]);
    expect(resolution.activeMembers).toEqual(["beta"]);
  });

  test("merges nested config with declared overrides and replaces arrays", () => {
    const resolution = resolveBundleSelection({
      catalogIds,
      definitions: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          config: [
            {
              member: "alpha",
              value: {
                route: "/",
                nested: { shared: "same", coreOnly: true },
                tags: ["core"],
              },
            },
          ],
        }),
        defineBundle({
          id: "site",
          members: ["alpha"],
          config: [
            {
              member: "alpha",
              value: {
                route: "/dashboard",
                nested: { shared: "same", siteOnly: true },
                tags: ["site"],
              },
              overrides: "core",
            },
          ],
        }),
      ],
      selected: ["site", "core"],
    });

    expect(resolution.configByMember).toEqual({
      alpha: {
        route: "/dashboard",
        nested: { shared: "same", coreOnly: true, siteOnly: true },
        tags: ["site"],
      },
    });
  });

  test("rejects undeclared scalar and array conflicts across definitions", () => {
    const definitions = [
      defineBundle({
        id: "core",
        members: ["alpha"],
        config: [{ member: "alpha", value: { nested: { value: 1 } } }],
      }),
      defineBundle({
        id: "site",
        members: ["alpha"],
        config: [{ member: "alpha", value: { nested: { value: 2 } } }],
      }),
    ];

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions,
        selected: ["core"],
      }),
    ).toThrow(
      /config conflict.*member "alpha".*nested\.value.*"core".*"site"/i,
    );

    expect(() =>
      resolveBundleSelection({
        catalogIds,
        definitions: [
          defineBundle({
            id: "core",
            members: ["alpha"],
            config: [{ member: "alpha", value: { values: ["one"] } }],
          }),
          defineBundle({
            id: "site",
            members: ["alpha"],
            config: [{ member: "alpha", value: { values: ["two"] } }],
          }),
        ],
        selected: ["core", "site"],
      }),
    ).toThrow(/config conflict.*member "alpha".*values/i);
  });

  test("allows multiple member contributions with precise override targets", () => {
    const resolution = resolveBundleSelection({
      catalogIds,
      definitions: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          config: [{ member: "alpha", value: { first: 1 } }],
        }),
        defineBundle({
          id: "site",
          members: ["alpha"],
          config: [{ member: "alpha", value: { second: 2 } }],
        }),
        defineBundle({
          id: "team",
          members: ["alpha"],
          config: [
            {
              member: "alpha",
              value: { first: 3 },
              overrides: "core",
            },
            {
              member: "alpha",
              value: { second: 4 },
              overrides: "site",
            },
          ],
        }),
      ],
      selected: ["team", "site", "core"],
    });

    expect(resolution.configByMember).toEqual({
      alpha: { first: 3, second: 4 },
    });
  });

  test("allows identical contributions without an override", () => {
    const resolution = resolveBundleSelection({
      catalogIds,
      definitions: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          config: [{ member: "alpha", value: { nested: { shared: true } } }],
        }),
        defineBundle({
          id: "site",
          members: ["alpha"],
          config: [{ member: "alpha", value: { nested: { shared: true } } }],
        }),
      ],
      selected: ["core", "site"],
    });

    expect(resolution.configByMember).toEqual({
      alpha: { nested: { shared: true } },
    });
  });

  test("filters member-scoped config and permissions after final removal", () => {
    const permissionConfig: PermissionConfig = {
      rules: [{ pattern: "alpha:*", level: "anchor" }],
    };
    const resolution = resolveBundleSelection({
      catalogIds,
      definitions: [
        defineBundle({
          id: "core",
          members: ["alpha", "beta"],
          config: [
            { member: "alpha", value: { removed: true } },
            { member: "beta", value: { retained: true } },
          ],
          permissions: [
            { member: "alpha", config: permissionConfig },
            { member: "beta", config: { anchors: ["retained"] } },
          ],
        }),
      ],
      selected: ["core"],
      remove: ["alpha"],
    });

    expect(resolution.configByMember).toEqual({
      beta: { retained: true },
    });
    expect(resolution.permissionContributions).toEqual([
      {
        bundleId: "core",
        member: "beta",
        config: { anchors: ["retained"] },
      },
    ]);
  });

  test("composes instructions and eval contributions in canonical order", () => {
    const definitions = [
      defineBundle({
        id: "core",
        members: ["alpha", "beta"],
        agentInstructions: ["core-one", "core-two"],
        evalDisable: ["beta"],
      }),
      defineBundle({
        id: "site",
        members: ["gamma"],
        agentInstructions: ["site"],
        evalDisable: ["gamma"],
      }),
    ];

    const resolution = resolveBundleSelection({
      catalogIds,
      definitions,
      selected: ["site", "core"],
    });

    expect(resolution.agentInstructions).toEqual([
      "core-one",
      "core-two",
      "site",
    ]);
    expect(resolution.evalDisable).toEqual(["beta", "gamma"]);
  });

  test("returns isolated results across repeated resolutions", () => {
    const definitions = [
      defineBundle({
        id: "core",
        members: ["alpha"],
        config: [
          {
            member: "alpha",
            value: { nested: { enabled: true }, values: ["original"] },
          },
        ],
        permissions: [{ member: "alpha", config: { anchors: ["original"] } }],
        agentInstructions: ["original"],
      }),
    ];
    const input = { catalogIds, definitions, selected: ["core"] } as const;

    const first = resolveBundleSelection(input);
    (first.activeMembers as string[]).push("mutated");
    (first.agentInstructions as string[])[0] = "mutated";
    const firstConfig = first.configByMember["alpha"] as {
      nested: { enabled: boolean };
      values: string[];
    };
    firstConfig.nested.enabled = false;
    firstConfig.values.push("mutated");
    const firstPermission = first.permissionContributions[0]?.config as {
      anchors: string[];
    };
    firstPermission.anchors.push("mutated");

    const second = resolveBundleSelection(input);

    expect(second.activeMembers).toEqual(["alpha"]);
    expect(second.agentInstructions).toEqual(["original"]);
    expect(second.configByMember).toEqual({
      alpha: { nested: { enabled: true }, values: ["original"] },
    });
    expect(second.permissionContributions[0]?.config).toEqual({
      anchors: ["original"],
    });
    expect(definitions[0]?.config?.[0]?.value).toEqual({
      nested: { enabled: true },
      values: ["original"],
    });
  });
});
