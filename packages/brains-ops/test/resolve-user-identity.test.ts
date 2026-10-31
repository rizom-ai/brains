import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toYaml } from "@brains/utils/yaml";

import {
  loadPilotRegistry,
  resolveUserIdentity,
  type ResolvedCohort,
  type ResolvedUserIdentity,
} from "../src/load-registry";
import {
  cohortSchema,
  pilotSchema,
  userSchema,
  type CohortConfigInput,
  type PilotConfigInput,
  type UserConfigInput,
} from "../src/schema";

const pilot: PilotConfigInput = {
  brainVersion: "0.2.0-alpha.100",
  bundleContract: "capability-bundles-v1",
  bundles: ["core", "site"],
  add: ["pilot-add"],
  remove: ["pilot-remove"],
  githubOrg: "rizom-ai",
  contentRepoPrefix: "rover-",
  domainSuffix: ".rizom.ai",
  aiApiKey: "AI_API_KEY",
  gitSyncToken: "GIT_SYNC_TOKEN",
  contentRepoAdminToken: "CONTENT_REPO_ADMIN_TOKEN",
  agePublicKey: "age1testpublickey",
};

const baseUser: UserConfigInput = {
  handle: "ada-lovelace",
  discord: { enabled: false },
};

type ExpectedIdentity = Omit<ResolvedUserIdentity, "snapshotStatus">;

const baseIdentity: ExpectedIdentity = {
  handle: "ada-lovelace",
  cohort: "canary",
  brainVersion: "0.2.0-alpha.100",
  bundleContract: "capability-bundles-v1",
  bundles: ["core", "site"],
  add: ["pilot-add"],
  remove: ["pilot-remove"],
  domain: "ada-lovelace.rizom.ai",
  contentRepo: "rover-ada-lovelace-content",
  discordEnabled: false,
  effectiveAiApiKey: "AI_API_KEY",
  effectiveGitSyncToken: "GIT_SYNC_TOKEN",
  anchorProfile: { name: "Ada Lovelace" },
};

interface IdentityCase {
  name: string;
  pilot?: Partial<PilotConfigInput>;
  cohort?: Omit<CohortConfigInput, "members">;
  user?: Partial<UserConfigInput>;
  expected: Partial<ExpectedIdentity>;
}

const cases: IdentityCase[] = [
  {
    name: "takes every cascaded value from the pilot by default",
    expected: {},
  },
  {
    name: "falls back to empty add and remove lists when the pilot has none",
    pilot: { add: undefined, remove: undefined },
    expected: { add: [], remove: [] },
  },
  {
    name: "prefers the cohort brain version over the pilot",
    cohort: { brainVersionOverride: "0.2.0-alpha.101" },
    expected: { brainVersion: "0.2.0-alpha.101" },
  },
  {
    name: "replaces pilot bundles and drops pilot add/remove on a cohort bundle override",
    cohort: { bundlesOverride: ["core", "publishing"] },
    expected: { bundles: ["core", "publishing"], add: [], remove: [] },
  },
  {
    name: "prefers cohort add/remove over pilot add/remove",
    cohort: { addOverride: ["cohort-add"], removeOverride: ["cohort-remove"] },
    expected: { add: ["cohort-add"], remove: ["cohort-remove"] },
  },
  {
    name: "keeps cohort add/remove alongside a cohort bundle override",
    cohort: {
      bundlesOverride: ["core"],
      addOverride: ["cohort-add"],
      removeOverride: ["cohort-remove"],
    },
    expected: {
      bundles: ["core"],
      add: ["cohort-add"],
      remove: ["cohort-remove"],
    },
  },
  {
    name: "appends user add/remove to the pilot lists without duplicates",
    user: {
      addOverride: ["pilot-add", "user-add"],
      removeOverride: ["user-remove", "pilot-remove"],
    },
    expected: {
      add: ["pilot-add", "user-add"],
      remove: ["pilot-remove", "user-remove"],
    },
  },
  {
    name: "appends user add/remove to the cohort lists",
    cohort: { addOverride: ["cohort-add"], removeOverride: ["cohort-remove"] },
    user: { addOverride: ["user-add"], removeOverride: ["user-remove"] },
    expected: {
      add: ["cohort-add", "user-add"],
      remove: ["cohort-remove", "user-remove"],
    },
  },
  {
    name: "appends user add/remove after a cohort bundle override",
    cohort: { bundlesOverride: ["core"] },
    user: { addOverride: ["user-add"], removeOverride: ["user-remove"] },
    expected: { bundles: ["core"], add: ["user-add"], remove: ["user-remove"] },
  },
  {
    name: "prefers cohort secrets over pilot secrets",
    cohort: {
      aiApiKeyOverride: "COHORT_AI_API_KEY",
      gitSyncTokenOverride: "COHORT_GIT_SYNC_TOKEN",
    },
    expected: {
      effectiveAiApiKey: "COHORT_AI_API_KEY",
      effectiveGitSyncToken: "COHORT_GIT_SYNC_TOKEN",
    },
  },
  {
    name: "prefers user secrets over cohort secrets",
    cohort: {
      aiApiKeyOverride: "COHORT_AI_API_KEY",
      gitSyncTokenOverride: "COHORT_GIT_SYNC_TOKEN",
    },
    user: {
      aiApiKeyOverride: "USER_AI_API_KEY",
      gitSyncTokenOverride: "USER_GIT_SYNC_TOKEN",
    },
    expected: {
      effectiveAiApiKey: "USER_AI_API_KEY",
      effectiveGitSyncToken: "USER_GIT_SYNC_TOKEN",
    },
  },
  {
    name: "prefers user domain and content repo overrides",
    user: {
      domainOverride: "ada.example",
      contentRepoOverride: "rizom-ai/ada-content",
    },
    expected: { domain: "ada.example", contentRepo: "rizom-ai/ada-content" },
  },
  {
    name: "passes every optional user field through",
    user: {
      cloudflareZoneId: "zone-1",
      profileKind: "organization",
      anchorKind: "team",
      embeddingEnabled: true,
      embeddingModel: "local:embeddinggemma-2:270m",
      spaces: ["discord:1"],
      plugins: { directory: { enabled: true } },
      topicExtractionEnabled: true,
      skillDerivationEnabled: true,
      swotDerivationEnabled: true,
      siteOverride: {
        package: "@rizom/site-ada",
        version: "0.2.0-alpha.100",
        theme: "@brains/theme-rizom",
      },
      discord: { enabled: true, anchorUserId: "42" },
      setup: { delivery: "email", email: "ada@example.com" },
      atproto: { identifier: "ada.rizom.ai", lexiconAuthority: true },
      playbooks: { onboarding: true },
      anchorProfile: {
        name: "Countess Ada",
        description: "Analyst",
        website: "https://ada.example",
        email: "ada@example.com",
        story: "Notes on the engine",
        socialLinks: [
          { platform: "github", url: "https://github.com/ada", label: "GH" },
          { platform: "website", url: "https://ada.example" },
        ],
      },
    },
    expected: {
      cloudflareZoneId: "zone-1",
      profileKind: "organization",
      anchorKind: "team",
      embeddingEnabled: true,
      embeddingModel: "local:embeddinggemma-2:270m",
      spaces: ["discord:1"],
      plugins: { directory: { enabled: true } },
      topicExtractionEnabled: true,
      skillDerivationEnabled: true,
      swotDerivationEnabled: true,
      siteOverride: {
        package: "@rizom/site-ada",
        version: "0.2.0-alpha.100",
        theme: "@brains/theme-rizom",
      },
      discordEnabled: true,
      discordAnchorUserId: "42",
      setup: { delivery: "email", email: "ada@example.com" },
      atproto: { identifier: "ada.rizom.ai", lexiconAuthority: true },
      playbooks: { onboarding: true },
      anchorProfile: {
        name: "Countess Ada",
        description: "Analyst",
        website: "https://ada.example",
        email: "ada@example.com",
        story: "Notes on the engine",
        socialLinks: [
          { platform: "github", url: "https://github.com/ada", label: "GH" },
          { platform: "website", url: "https://ada.example" },
        ],
      },
    },
  },
  {
    name: "passes false feature flags and empty lists through",
    user: {
      embeddingEnabled: false,
      spaces: [],
      plugins: {},
      topicExtractionEnabled: false,
      skillDerivationEnabled: false,
      swotDerivationEnabled: false,
    },
    expected: {
      embeddingEnabled: false,
      spaces: [],
      plugins: {},
      topicExtractionEnabled: false,
      skillDerivationEnabled: false,
      swotDerivationEnabled: false,
    },
  },
];

async function resolveThroughLoader(
  testCase: IdentityCase,
): Promise<ExpectedIdentity> {
  const root = await createTempDir("resolve-user-identity-");
  const user = { ...baseUser, ...testCase.user };
  await mkdir(join(root, "users"), { recursive: true });
  await mkdir(join(root, "cohorts"), { recursive: true });
  await writeFile(
    join(root, "pilot.yaml"),
    toYaml({ ...pilot, ...testCase.pilot }),
  );
  await writeFile(join(root, "users", `${user.handle}.yaml`), toYaml(user));
  await writeFile(
    join(root, "cohorts", "canary.yaml"),
    toYaml({ ...testCase.cohort, members: [user.handle] }),
  );

  const registry = await loadPilotRegistry(root);
  const [resolved] = registry.users;
  if (!resolved) throw new Error("expected one resolved user");
  const {
    snapshotStatus: _snapshotStatus,
    serverStatus: _serverStatus,
    deployStatus: _deployStatus,
    dnsStatus: _dnsStatus,
    mcpStatus: _mcpStatus,
    ...identity
  } = resolved;
  return identity;
}

function resolveDirectly(testCase: IdentityCase): ExpectedIdentity {
  const user = userSchema.parse({ ...baseUser, ...testCase.user });
  return resolveUserIdentity(
    user,
    {
      id: "canary",
      data: cohortSchema.parse({ ...testCase.cohort, members: [user.handle] }),
    },
    pilotSchema.parse({ ...pilot, ...testCase.pilot }),
  );
}

describe("resolveUserIdentity", () => {
  it.each(cases)("$name", (testCase) => {
    expect(resolveDirectly(testCase)).toStrictEqual({
      ...baseIdentity,
      ...testCase.expected,
    });
  });
});

describe("loadPilotRegistry user identity", () => {
  it.each(cases)("$name", async (testCase) => {
    expect(await resolveThroughLoader(testCase)).toStrictEqual({
      ...baseIdentity,
      ...testCase.expected,
    });
  });
});

interface CohortCase {
  name: string;
  cohort: Omit<CohortConfigInput, "members">;
  expected: Omit<ResolvedCohort, "id" | "members">;
}

const cohortCases: CohortCase[] = [
  {
    name: "resolves a cohort without overrides to its sorted members",
    cohort: {},
    expected: {},
  },
  {
    name: "passes every cohort override through",
    cohort: {
      brainVersionOverride: "0.2.0-alpha.101",
      bundlesOverride: ["core", "publishing"],
      addOverride: ["cohort-add"],
      removeOverride: ["cohort-remove"],
      aiApiKeyOverride: "COHORT_AI_API_KEY",
      gitSyncTokenOverride: "COHORT_GIT_SYNC_TOKEN",
    },
    expected: {
      brainVersionOverride: "0.2.0-alpha.101",
      bundlesOverride: ["core", "publishing"],
      addOverride: ["cohort-add"],
      removeOverride: ["cohort-remove"],
      aiApiKeyOverride: "COHORT_AI_API_KEY",
      gitSyncTokenOverride: "COHORT_GIT_SYNC_TOKEN",
    },
  },
  {
    name: "passes empty add and remove overrides through",
    cohort: { addOverride: [], removeOverride: [] },
    expected: { addOverride: [], removeOverride: [] },
  },
];

async function loadCohortsThroughLoader(
  cohorts: Record<string, CohortConfigInput>,
): Promise<ResolvedCohort[]> {
  const root = await createTempDir("resolve-cohort-");
  await mkdir(join(root, "users"), { recursive: true });
  await mkdir(join(root, "cohorts"), { recursive: true });
  await writeFile(join(root, "pilot.yaml"), toYaml(pilot));
  await Promise.all(
    Object.entries(cohorts).flatMap(([id, cohort]) => [
      writeFile(join(root, "cohorts", `${id}.yaml`), toYaml(cohort)),
      ...cohort.members.map((handle) =>
        writeFile(
          join(root, "users", `${handle}.yaml`),
          toYaml({ ...baseUser, handle }),
        ),
      ),
    ]),
  );

  return (await loadPilotRegistry(root)).cohorts;
}

describe("loadPilotRegistry cohorts", () => {
  it.each(cohortCases)("$name", async (testCase) => {
    expect(
      await loadCohortsThroughLoader({
        canary: { ...testCase.cohort, members: ["zed", "ada-lovelace"] },
      }),
    ).toStrictEqual([
      { id: "canary", members: ["ada-lovelace", "zed"], ...testCase.expected },
    ]);
  });

  it("sorts cohorts by id", async () => {
    const cohorts = await loadCohortsThroughLoader({
      steady: { members: ["bob"] },
      canary: { members: ["ada-lovelace"] },
    });
    expect(cohorts.map((cohort) => cohort.id)).toEqual(["canary", "steady"]);
  });
});
