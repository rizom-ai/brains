import {
  readJsonResponse,
  requireEnv,
  writeGitHubOutput,
  writeGitHubEnv,
} from "./helpers";

const token = requireEnv("HCLOUD_TOKEN");
const instanceName = requireEnv("INSTANCE_NAME");
const sshKeyName = requireEnv("HCLOUD_SSH_KEY_NAME");
const serverType = requireEnv("HCLOUD_SERVER_TYPE");
const location = requireEnv("HCLOUD_LOCATION");

const headers: Record<string, string> = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const baseUrl = "https://api.hetzner.cloud/v1";
const labelSelector = `brain=${instanceName}`;
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 10_000;

interface HetznerServer {
  id: number;
  status: string;
  public_net?: { ipv4?: { ip?: string } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * These scripts are copied verbatim into generated projects, so they stay
 * dependency-free: the API payloads are checked by hand rather than with a
 * schema library. readJsonResponse returns unknown; asserting the Hetzner
 * response shape onto it meant a changed or error payload surfaced as an
 * undefined field later instead of a failed lookup here.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHetznerServer(value: unknown): value is HetznerServer {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "number") return false;
  if (typeof value["status"] !== "string") return false;
  const publicNet = value["public_net"];
  if (publicNet === undefined) return true;
  if (!isRecord(publicNet)) return false;
  const ipv4 = publicNet["ipv4"];
  if (ipv4 === undefined) return true;
  if (!isRecord(ipv4)) return false;
  const ip = ipv4["ip"];
  return ip === undefined || typeof ip === "string";
}

function readServer(payload: unknown): HetznerServer | undefined {
  if (!isRecord(payload)) return undefined;
  const server = payload["server"];
  return isHetznerServer(server) ? server : undefined;
}

function readServers(payload: unknown): HetznerServer[] | undefined {
  if (!isRecord(payload)) return undefined;
  const servers = payload["servers"];
  return Array.isArray(servers) && servers.every(isHetznerServer)
    ? servers
    : undefined;
}

async function listServers(): Promise<HetznerServer[]> {
  const url = `${baseUrl}/servers?label_selector=${encodeURIComponent(labelSelector)}`;
  const response = await fetch(url, { headers });
  const payload = await readJsonResponse(response, "Hetzner server lookup");
  const servers = readServers(payload);
  if (!response.ok || !servers) {
    throw new Error(`Hetzner server lookup failed: ${JSON.stringify(payload)}`);
  }
  return servers;
}

async function createServer(): Promise<HetznerServer> {
  const response = await fetch(`${baseUrl}/servers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: instanceName,
      server_type: serverType,
      image: "ubuntu-22.04",
      location,
      ssh_keys: [sshKeyName],
      labels: { brain: instanceName },
    }),
  });
  const payload = await readJsonResponse(response, "Hetzner server create");
  const server = readServer(payload);
  if (!response.ok || !server) {
    throw new Error(`Hetzner server create failed: ${JSON.stringify(payload)}`);
  }
  return server;
}

async function getServer(id: number): Promise<HetznerServer> {
  const response = await fetch(`${baseUrl}/servers/${id}`, { headers });
  const payload = await readJsonResponse(response, "Hetzner server poll");
  const server = readServer(payload);
  if (!response.ok || !server) {
    throw new Error(`Hetzner server poll failed: ${JSON.stringify(payload)}`);
  }
  return server;
}

let server: HetznerServer | undefined = (await listServers())[0];
server ??= await createServer();

let polls = 0;
while (server.status !== "running" || !server.public_net?.ipv4?.ip) {
  if (++polls > MAX_POLLS) {
    throw new Error(
      `Server ${server.id} did not become ready after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s (status: ${server.status})`,
    );
  }
  if (server.status === "error") {
    throw new Error(`Server ${server.id} entered error state`);
  }
  console.log(
    `Waiting for server ${server.id} (status: ${server.status}, poll ${polls}/${MAX_POLLS})...`,
  );
  await sleep(POLL_INTERVAL_MS);
  server = await getServer(server.id);
}

const serverIp = server.public_net.ipv4.ip;
if (!serverIp) {
  throw new Error(`Server ${server.id} running but has no IPv4 address`);
}
writeGitHubOutput("server_ip", serverIp);
writeGitHubEnv("SERVER_IP", serverIp);
