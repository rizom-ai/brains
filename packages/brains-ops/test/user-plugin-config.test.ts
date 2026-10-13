import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir } from "@brains/test-utils";
import { fromYaml, parseYamlDocument, toYaml } from "@brains/utils/yaml";
import { deepMerge } from "@brains/utils/config-merge";
import { createDefaultUserRunner } from "../src/default-user-runner";
import { loadPilotRegistry } from "../src/load-registry";
import { userSchema } from "../src/schema";

async function fixture(
  plugins?: Record<string, Record<string, unknown>>,
): Promise<string> {
  const root = await createTempDir("operator-plugin-config-");
  await mkdir(join(root, "users"));
  await mkdir(join(root, "cohorts"));
  await writeFile(
    join(root, "cohorts", "default.yaml"),
    toYaml({ members: ["alice", "bob"] }),
  );
  await writeFile(
    join(root, "pilot.yaml"),
    toYaml({
      brainVersion: "0.2.0-alpha.391",
      bundleContract: "capability-bundles-v1",
      githubOrg: "rizom-ai",
      contentRepoPrefix: "rover-",
      domainSuffix: ".rizom.ai",
      bundles: ["core"],
      aiApiKey: "AI_API_KEY",
      gitSyncToken: "GIT_SYNC_TOKEN",
      contentRepoAdminToken: "CONTENT_REPO_ADMIN_TOKEN",
      agePublicKey: "age1testpublickey",
    }),
  );
  for (const handle of ["alice", "bob"]) {
    await writeFile(
      join(root, "users", `${handle}.yaml`),
      toYaml({
        handle,
        discord: { enabled: false },
        ...(handle === "alice" && plugins ? { plugins } : {}),
      }),
    );
  }
  return root;
}

describe("per-user canonical plugin configuration", () => {
  it.each([true, false])(
    "preserves dashboard.ask=%s through loading and repeated generation",
    async (ask) => {
      const root = await fixture({ dashboard: { ask } });
      const { users } = await loadPilotRegistry(root);
      const runner = createDefaultUserRunner("rizom-ai");
      const alice = users.find((user) => user.handle === "alice");
      const bob = users.find((user) => user.handle === "bob");
      if (!alice || !bob) throw new Error("Missing fixture users");
      const first = await runner(alice);
      const second = await runner(alice);
      expect(first).toEqual(second);
      expect(fromYaml(first.brainYaml ?? "")).toMatchObject({
        plugins: {
          dashboard: { ask },
          "directory-sync": {
            git: {
              repo: "rizom-ai/rover-alice-content",
              authToken: "${GIT_SYNC_TOKEN}",
            },
          },
        },
      });
      const baseline = await createDefaultUserRunner("rizom-ai")({
        ...alice,
        plugins: undefined,
      });
      const enabled = fromYaml(first.brainYaml ?? "");
      const expected = parseYamlDocument(baseline.brainYaml ?? "");
      if (!expected.ok) throw new Error(expected.error);
      expect(enabled).toEqual(
        deepMerge(expected.data, { plugins: { dashboard: { ask } } }),
      );
      expect(first.envFile).toEqual(baseline.envFile);
      expect(first.contentRepoFiles).toEqual(baseline.contentRepoFiles);
      expect((await runner(bob)).brainYaml).not.toContain("dashboard:");
      expect(first.brainYaml).not.toContain("web-chat:");
    },
  );

  it("keeps generated fields when adding another field to the same plugin", async () => {
    const root = await fixture({ "directory-sync": { customSetting: false } });
    const { users } = await loadPilotRegistry(root);
    const user = users.find((entry) => entry.handle === "alice");
    if (!user) throw new Error("Missing fixture user");
    const result = await createDefaultUserRunner("rizom-ai")(user);
    expect(fromYaml(result.brainYaml ?? "")).toMatchObject({
      plugins: {
        "directory-sync": {
          customSetting: false,
          git: {
            repo: "rizom-ai/rover-alice-content",
            authToken: "${GIT_SYNC_TOKEN}",
          },
        },
      },
    });
  });

  it("uses instance override precedence while retaining unrelated generated fields", async () => {
    const root = await fixture({
      "directory-sync": { git: { repo: "elsewhere" } },
    });
    const { users } = await loadPilotRegistry(root);
    const user = users.find((entry) => entry.handle === "alice");
    if (!user) throw new Error("Missing fixture user");
    const result = await createDefaultUserRunner("rizom-ai")(user);
    expect(fromYaml(result.brainYaml ?? "")).toMatchObject({
      plugins: {
        "directory-sync": {
          git: { repo: "elsewhere", authToken: "${GIT_SYNC_TOKEN}" },
        },
      },
    });
  });

  it("serializes null markers, lists and multiline values without interpreting them", async () => {
    const plugins = {
      "directory-sync": { git: { authToken: null } },
      example: {
        runtimeDefault: null,
        list: ["one", "two"],
        text: "quoted: value\n---\nother: false",
      },
    };
    const root = await fixture(plugins);
    const { users } = await loadPilotRegistry(root);
    const user = users.find((entry) => entry.handle === "alice");
    if (!user) throw new Error("Missing fixture user");
    const result = await createDefaultUserRunner("rizom-ai")(user);
    expect(fromYaml(result.brainYaml ?? "")).toMatchObject({ plugins });
    expect(fromYaml(result.brainYaml ?? "")).toMatchObject({
      plugins: {
        "directory-sync": { git: { repo: "rizom-ai/rover-alice-content" } },
      },
    });
  });

  it("validates the config map shape, leaving plugin fields to their owning schemas", () => {
    const base = { handle: "alice", discord: { enabled: false } };
    expect(
      userSchema.safeParse({ ...base, plugins: { dashboard: false } }).success,
    ).toBe(false);
    expect(
      userSchema.safeParse({ ...base, plugins: { dashboard: { ask: true } } })
        .success,
    ).toBe(true);
  });
});
