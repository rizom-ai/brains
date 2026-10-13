import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { FetchLike } from "@brains/utils/fetch-like";
import { isScalar, isSeq, parseDocument } from "yaml";

import { loadPilotRegistry, type PilotRegistry } from "./load-registry";
import { derivePreviewDomain } from "./preview-domain";
import { writeUsersTable } from "./render-users-table";
import { cohortSchema, handleSchema } from "./schema";

export interface OffboardPilotUsersOptions {
  handles: string[];
  confirmation?: string | undefined;
  dryRun?: boolean | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  fetchImpl?: FetchLike | undefined;
  logger?: ((message: string) => void) | undefined;
  sleep?: ((delayMs: number) => Promise<void>) | undefined;
  driver?: PilotOffboardDriver | undefined;
}

export interface PilotOffboardTarget {
  handle: string;
  instanceName: string;
  domain: string;
  previewDomain: string;
  wwwDomain?: string | undefined;
  contentRepo: string;
  cloudflareZoneId: string;
}

export interface PilotOffboardServer {
  id: number;
  name: string;
  ip?: string | undefined;
}

export interface PilotOffboardDnsRecord {
  id: string;
  name: string;
  type: "A" | "CNAME";
  content: string;
}

export interface PilotOffboardInspection {
  server?: PilotOffboardServer | undefined;
  dnsRecords: PilotOffboardDnsRecord[];
  contentRepoArchived: boolean;
}

export interface PilotOffboardDriver {
  inspect(target: PilotOffboardTarget): Promise<PilotOffboardInspection>;
  archiveContentRepo(target: PilotOffboardTarget): Promise<void>;
  deleteDnsRecord(
    target: PilotOffboardTarget,
    record: PilotOffboardDnsRecord,
  ): Promise<void>;
  deleteServer(
    target: PilotOffboardTarget,
    server: PilotOffboardServer,
  ): Promise<void>;
}

export interface OffboardPilotUserPlan {
  target: PilotOffboardTarget;
  inspection: PilotOffboardInspection;
}

export interface OffboardPilotUsersResult {
  dryRun: boolean;
  handles: string[];
  confirmation: string;
  plans: OffboardPilotUserPlan[];
}

export async function offboardPilotUsers(
  rootDir: string,
  options: OffboardPilotUsersOptions,
): Promise<OffboardPilotUsersResult> {
  const handles = [
    ...new Set(options.handles.map((handle) => handleSchema.parse(handle))),
  ].sort((left, right) => left.localeCompare(right));
  if (handles.length === 0) {
    throw new Error("At least one pilot handle is required");
  }

  const dryRun = options.dryRun ?? true;
  const confirmation = `sunset:${handles.join(",")}`;
  if (!dryRun && options.confirmation !== confirmation) {
    throw new Error(`Exact confirmation required: ${confirmation}`);
  }

  const env = options.env ?? process.env;
  const logger = options.logger ?? console.info;
  const registry = await loadPilotRegistry(rootDir);
  const targets = handles.map((handle) => resolveTarget(registry, handle, env));
  const driver =
    options.driver ??
    createPilotOffboardDriver({
      env,
      fetchImpl: options.fetchImpl,
      contentRepoTokenName: registry.pilot.contentRepoAdminToken,
    });

  const plans = await Promise.all(
    targets.map(async (target): Promise<OffboardPilotUserPlan> => ({
      target,
      inspection: await driver.inspect(target),
    })),
  );
  validatePlans(plans);
  logPlans(plans, dryRun, logger);

  if (!dryRun) {
    // Archiving is reversible, so do it before destructive provider changes.
    for (const plan of plans) {
      if (!plan.inspection.contentRepoArchived) {
        await driver.archiveContentRepo(plan.target);
        logger(`[${plan.target.handle}] archived ${plan.target.contentRepo}`);
      }
    }
    for (const plan of plans) {
      for (const record of plan.inspection.dnsRecords) {
        await driver.deleteDnsRecord(plan.target, record);
        logger(`[${plan.target.handle}] deleted DNS ${record.name}`);
      }
    }
    for (const plan of plans) {
      if (plan.inspection.server) {
        await driver.deleteServer(plan.target, plan.inspection.server);
        logger(`[${plan.target.handle}] deleted ${plan.target.instanceName}`);
      }
    }

    await verifyProviderCleanup(
      targets,
      driver,
      options.sleep ??
        ((delayMs): Promise<void> =>
          new Promise((resolve) => setTimeout(resolve, delayMs))),
    );
    await removeDesiredState(rootDir, handles);
    await writeUsersTable(rootDir);
    await assertPilotUsersRemoved(rootDir, handles);
    logger(`Removed desired state for ${handles.length} pilot user(s)`);
  }

  return { dryRun, handles, confirmation, plans };
}

function resolveTarget(
  registry: PilotRegistry,
  handle: string,
  env: NodeJS.ProcessEnv,
): PilotOffboardTarget {
  const user = registry.users.find((candidate) => candidate.handle === handle);
  const fleetDomain = `${handle}${registry.pilot.domainSuffix}`;
  const domain = user?.domain ?? fleetDomain;
  const previewDomain = derivePreviewDomain(domain, {
    sharedDomain: registry.pilot.domainSuffix,
  });
  const zoneId = user?.cloudflareZoneId ?? requireEnv(env, "CF_ZONE_ID");
  const repoName =
    user?.contentRepo ?? `${registry.pilot.contentRepoPrefix}${handle}-content`;
  const contentRepo = repoName.includes("/")
    ? repoName
    : `${registry.pilot.githubOrg}/${repoName}`;

  return {
    handle,
    instanceName: `rover-${handle}`,
    domain,
    previewDomain,
    ...(domain === fleetDomain ? {} : { wwwDomain: `www.${domain}` }),
    contentRepo,
    cloudflareZoneId: zoneId,
  };
}

async function verifyProviderCleanup(
  targets: PilotOffboardTarget[],
  driver: PilotOffboardDriver,
  sleep: (delayMs: number) => Promise<void>,
): Promise<void> {
  for (const target of targets) {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const inspection = await driver.inspect(target);
      if (
        !inspection.server &&
        inspection.dnsRecords.length === 0 &&
        inspection.contentRepoArchived
      ) {
        break;
      }
      if (attempt === 20) {
        throw new Error(`[${target.handle}] provider cleanup did not converge`);
      }
      await sleep(1_500);
    }
  }
}

function validatePlans(plans: OffboardPilotUserPlan[]): void {
  for (const { target, inspection } of plans) {
    if (inspection.server && inspection.server.name !== target.instanceName) {
      throw new Error(
        `[${target.handle}] unexpected server name: ${inspection.server.name}`,
      );
    }
    const expectedNames = new Set([
      target.domain,
      target.previewDomain,
      ...(target.wwwDomain ? [target.wwwDomain] : []),
    ]);
    for (const record of inspection.dnsRecords) {
      if (!expectedNames.has(record.name)) {
        throw new Error(
          `[${target.handle}] refusing unexpected DNS record ${record.name}`,
        );
      }
      if (
        record.type === "A" &&
        inspection.server?.ip &&
        record.content !== inspection.server.ip
      ) {
        throw new Error(
          `[${target.handle}] ${record.name} does not point to the retiring server`,
        );
      }
    }
  }
}

function logPlans(
  plans: OffboardPilotUserPlan[],
  dryRun: boolean,
  logger: (message: string) => void,
): void {
  logger(
    `${dryRun ? "Dry run" : "Apply"}: ${plans.map(({ target }) => target.handle).join(", ")}`,
  );
  for (const { target, inspection } of plans) {
    const server = inspection.server
      ? `delete ${target.instanceName}`
      : "already absent";
    const dns =
      inspection.dnsRecords.length > 0
        ? inspection.dnsRecords
            .map((record) => `${record.type} ${record.name}`)
            .join(", ")
        : "already absent";
    const repo = inspection.contentRepoArchived
      ? "already archived"
      : `archive ${target.contentRepo}`;
    logger(`[${target.handle}] server: ${server}; DNS: ${dns}; repo: ${repo}`);
  }
  logger("Runtime backups: none");
}

async function removeDesiredState(
  rootDir: string,
  handles: string[],
): Promise<void> {
  const handleSet = new Set(handles);
  const cohortsDir = join(rootDir, "cohorts");
  for (const fileName of (await readdir(cohortsDir)).filter((name) =>
    name.endsWith(".yaml"),
  )) {
    const path = join(cohortsDir, fileName);
    const source = await readFile(path, "utf8");
    const document = parseDocument(source);
    if (document.errors.length > 0) {
      throw new Error(
        `${fileName}: ${document.errors[0]?.message ?? "invalid YAML"}`,
      );
    }
    const members = document.get("members", true);
    if (!isSeq(members)) {
      throw new Error(`${fileName}: members must be a sequence`);
    }
    const retained = members.items.filter(
      (item) =>
        !isScalar(item) ||
        typeof item.value !== "string" ||
        !handleSet.has(item.value),
    );
    if (retained.length === members.items.length) continue;
    if (retained.length === 0) {
      await rm(path);
      continue;
    }
    members.items = retained;
    cohortSchema.parse(document.toJS());
    await writeFile(path, document.toString());
  }

  for (const handle of handles) {
    await Promise.all([
      rm(join(rootDir, "users", `${handle}.yaml`), { force: true }),
      rm(join(rootDir, "users", `${handle}.secrets.yaml`), { force: true }),
      rm(join(rootDir, "users", `${handle}.secrets.yaml.age`), { force: true }),
      rm(join(rootDir, "users", handle), { recursive: true, force: true }),
    ]);
  }
}

interface DefaultDriverOptions {
  env: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike | undefined;
  contentRepoTokenName: string;
}

export function createPilotOffboardDriver(
  options: DefaultDriverOptions,
): PilotOffboardDriver {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hcloudToken = requireEnv(options.env, "HCLOUD_TOKEN");
  const cloudflareToken = requireEnv(options.env, "CF_API_TOKEN");
  const githubToken = requireEnv(options.env, options.contentRepoTokenName);

  return {
    async inspect(target): Promise<PilotOffboardInspection> {
      const [servers, dnsRecords, repository] = await Promise.all([
        listServers(fetchImpl, hcloudToken, target.instanceName),
        Promise.all(
          [
            target.domain,
            target.previewDomain,
            ...(target.wwwDomain ? [target.wwwDomain] : []),
          ].map((name) =>
            listDnsRecords(
              fetchImpl,
              cloudflareToken,
              target.cloudflareZoneId,
              name,
            ),
          ),
        ).then((records) => records.flat()),
        getRepository(fetchImpl, githubToken, target.contentRepo),
      ]);
      if (servers.length > 1) {
        throw new Error(
          `[${target.handle}] expected at most one server, found ${servers.length}`,
        );
      }
      return {
        ...(servers[0] ? { server: servers[0] } : {}),
        dnsRecords,
        contentRepoArchived: repository.archived,
      };
    },
    async archiveContentRepo(target): Promise<void> {
      await requestJson(
        fetchImpl,
        `https://api.github.com/repos/${target.contentRepo}`,
        {
          method: "PATCH",
          headers: githubHeaders(githubToken),
          body: JSON.stringify({ archived: true }),
        },
        "GitHub repository archive",
      );
    },
    async deleteDnsRecord(target, record): Promise<void> {
      const payload = asRecord(
        await requestJson(
          fetchImpl,
          `https://api.cloudflare.com/client/v4/zones/${target.cloudflareZoneId}/dns_records/${record.id}`,
          {
            method: "DELETE",
            headers: cloudflareHeaders(cloudflareToken),
          },
          "Cloudflare DNS delete",
        ),
      );
      if (payload["success"] !== true) {
        throw new Error(`Cloudflare DNS delete failed for ${record.name}`);
      }
    },
    async deleteServer(_target, server): Promise<void> {
      await requestJson(
        fetchImpl,
        `https://api.hetzner.cloud/v1/servers/${server.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${hcloudToken}` },
        },
        "Hetzner server delete",
        true,
      );
    },
  };
}

async function listServers(
  fetchImpl: FetchLike,
  token: string,
  instanceName: string,
): Promise<PilotOffboardServer[]> {
  const url = new URL("https://api.hetzner.cloud/v1/servers");
  url.searchParams.set("label_selector", `brain=${instanceName}`);
  const payload = asRecord(
    await requestJson(
      fetchImpl,
      url.toString(),
      { headers: { Authorization: `Bearer ${token}` } },
      "Hetzner server lookup",
    ),
  );
  const servers = payload["servers"];
  if (!Array.isArray(servers)) {
    throw new Error("Hetzner server lookup returned an invalid payload");
  }
  return servers.map((value) => {
    const server = asRecord(value);
    const publicNet = asOptionalRecord(server["public_net"]);
    const ipv4 = asOptionalRecord(publicNet?.["ipv4"]);
    return {
      id: requireNumber(server["id"], "Hetzner server id"),
      name: requireString(server["name"], "Hetzner server name"),
      ...(typeof ipv4?.["ip"] === "string" ? { ip: ipv4["ip"] } : {}),
    };
  });
}

async function listDnsRecords(
  fetchImpl: FetchLike,
  token: string,
  zoneId: string,
  name: string,
): Promise<PilotOffboardDnsRecord[]> {
  const url = new URL(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
  );
  url.searchParams.set("name", name);
  const payload = asRecord(
    await requestJson(
      fetchImpl,
      url.toString(),
      { headers: cloudflareHeaders(token) },
      "Cloudflare DNS lookup",
    ),
  );
  const records = payload["result"];
  if (payload["success"] !== true || !Array.isArray(records)) {
    throw new Error(`Cloudflare DNS lookup failed for ${name}`);
  }
  return records.map((value) => {
    const record = asRecord(value);
    const type = requireString(record["type"], "Cloudflare record type");
    if (type !== "A" && type !== "CNAME") {
      throw new Error(`Unsupported Cloudflare record type ${type} for ${name}`);
    }
    return {
      id: requireString(record["id"], "Cloudflare record id"),
      name: requireString(record["name"], "Cloudflare record name"),
      type,
      content: requireString(record["content"], "Cloudflare record content"),
    };
  });
}

async function getRepository(
  fetchImpl: FetchLike,
  token: string,
  fullName: string,
): Promise<{ archived: boolean }> {
  const payload = asRecord(
    await requestJson(
      fetchImpl,
      `https://api.github.com/repos/${fullName}`,
      { headers: githubHeaders(token) },
      "GitHub repository lookup",
    ),
  );
  if (typeof payload["archived"] !== "boolean") {
    throw new Error(`Invalid repository archive state for ${fullName}`);
  }
  return { archived: payload["archived"] };
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  label: string,
  allowEmpty = false,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text}`);
  }
  if (!text && allowEmpty) return {};
  try {
    const payload: unknown = JSON.parse(text);
    return payload;
  } catch {
    throw new Error(`${label} returned an invalid JSON response`);
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function cloudflareHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Provider returned an unexpected payload");
  }
  return value;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`Missing ${label}`);
  return value;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertPilotUsersRemoved(
  rootDir: string,
  handles: string[],
): Promise<void> {
  for (const handle of handles) {
    for (const path of [
      join(rootDir, "users", `${handle}.yaml`),
      join(rootDir, "users", `${handle}.secrets.yaml.age`),
      join(rootDir, "users", handle),
    ]) {
      if (await fileExists(path)) {
        throw new Error(`Offboarded user state remains: ${basename(path)}`);
      }
    }
  }
}
