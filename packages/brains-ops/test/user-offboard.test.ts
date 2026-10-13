import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  offboardPilotUsers,
  type PilotOffboardDnsRecord,
  type PilotOffboardDriver,
  type PilotOffboardInspection,
  type PilotOffboardServer,
  type PilotOffboardTarget,
} from "../src/user-offboard";

async function createPilotRepo(): Promise<string> {
  const root = await createTempDir("brains-ops-user-offboard-");
  const files: Record<string, string> = {
    "pilot.yaml": `brainVersion: 0.2.0-alpha.1
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j
`,
    "cohorts/cohort-1.yaml": `# personal users
members:
  - alice
  - bob
brainVersionOverride: 0.2.0-alpha.2
`,
    "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
    "users/bob.yaml": `handle: bob
discord:
  enabled: false
`,
    "users/bob.secrets.yaml.age": "encrypted",
    "users/bob/.env": "generated",
    "users/bob/brain.yaml": "generated",
    "views/users.md": "stale\n",
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

function createDriver(): PilotOffboardDriver & {
  calls: string[];
  state: {
    server?: PilotOffboardServer;
    dnsRecords: PilotOffboardDnsRecord[];
    archived: boolean;
  };
} {
  const state: {
    server?: PilotOffboardServer;
    dnsRecords: PilotOffboardDnsRecord[];
    archived: boolean;
  } = {
    server: { id: 42, name: "rover-bob", ip: "192.0.2.10" },
    dnsRecords: [
      {
        id: "main",
        name: "bob.rizom.ai",
        type: "A",
        content: "192.0.2.10",
      },
      {
        id: "preview",
        name: "bob-preview.rizom.ai",
        type: "A",
        content: "192.0.2.10",
      },
    ],
    archived: false,
  };
  const calls: string[] = [];
  return {
    calls,
    state,
    async inspect(): Promise<PilotOffboardInspection> {
      calls.push("inspect");
      return {
        ...(state.server ? { server: state.server } : {}),
        dnsRecords: [...state.dnsRecords],
        contentRepoArchived: state.archived,
      };
    },
    async archiveContentRepo(target: PilotOffboardTarget): Promise<void> {
      calls.push(`archive:${target.contentRepo}`);
      state.archived = true;
    },
    async deleteDnsRecord(_target, record): Promise<void> {
      calls.push(`dns:${record.name}`);
      state.dnsRecords = state.dnsRecords.filter(
        (candidate) => candidate.id !== record.id,
      );
    },
    async deleteServer(_target, server): Promise<void> {
      calls.push(`server:${server.name}`);
      delete state.server;
    },
  };
}

describe("offboardPilotUsers", () => {
  it("defaults to a read-only plan", async () => {
    const root = await createPilotRepo();
    const driver = createDriver();

    const result = await offboardPilotUsers(root, {
      handles: ["bob"],
      driver,
      env: { CF_ZONE_ID: "zone" },
      logger: () => undefined,
    });

    expect(result.dryRun).toBe(true);
    expect(result.confirmation).toBe("sunset:bob");
    expect(result.plans[0]?.target).toMatchObject({
      instanceName: "rover-bob",
      domain: "bob.rizom.ai",
      previewDomain: "bob-preview.rizom.ai",
      contentRepo: "rizom-ai/rover-bob-content",
    });
    expect(driver.calls).toEqual(["inspect"]);
    expect(await readFile(join(root, "users", "bob.yaml"), "utf8")).toContain(
      "handle: bob",
    );
  });

  it("requires the exact sorted batch confirmation", async () => {
    const root = await createPilotRepo();

    expect(
      offboardPilotUsers(root, {
        handles: ["bob"],
        dryRun: false,
        confirmation: "sunset:alice",
        driver: createDriver(),
        env: { CF_ZONE_ID: "zone" },
      }),
    ).rejects.toThrow("Exact confirmation required: sunset:bob");
  });

  it("archives content, deletes provider resources, and removes desired state", async () => {
    const root = await createPilotRepo();
    const driver = createDriver();

    const result = await offboardPilotUsers(root, {
      handles: ["bob"],
      dryRun: false,
      confirmation: "sunset:bob",
      driver,
      env: { CF_ZONE_ID: "zone" },
      logger: () => undefined,
      sleep: async () => undefined,
    });

    expect(result.dryRun).toBe(false);
    expect(driver.calls).toEqual([
      "inspect",
      "archive:rizom-ai/rover-bob-content",
      "dns:bob.rizom.ai",
      "dns:bob-preview.rizom.ai",
      "server:rover-bob",
      "inspect",
    ]);
    expect(Bun.file(join(root, "users", "bob.yaml")).size).toBe(0);
    expect(Bun.file(join(root, "users", "bob.secrets.yaml.age")).size).toBe(0);
    expect(Bun.file(join(root, "users", "bob", "brain.yaml")).size).toBe(0);
    expect(await readFile(join(root, "cohorts", "cohort-1.yaml"), "utf8")).toBe(
      `# personal users
members:
  - alice
brainVersionOverride: 0.2.0-alpha.2
`,
    );
    const usersView = await readFile(join(root, "views", "users.md"), "utf8");
    expect(usersView).toContain("| alice |");
    expect(usersView).not.toContain("| bob |");
  });

  it("is replay-safe after desired state and provider resources are absent", async () => {
    const root = await createPilotRepo();
    const driver = createDriver();
    await offboardPilotUsers(root, {
      handles: ["bob"],
      dryRun: false,
      confirmation: "sunset:bob",
      driver,
      env: { CF_ZONE_ID: "zone" },
      logger: () => undefined,
      sleep: async () => undefined,
    });
    driver.calls.length = 0;

    await offboardPilotUsers(root, {
      handles: ["bob"],
      dryRun: false,
      confirmation: "sunset:bob",
      driver,
      env: { CF_ZONE_ID: "zone" },
      logger: () => undefined,
      sleep: async () => undefined,
    });

    expect(driver.calls).toEqual(["inspect", "inspect"]);
  });
});
