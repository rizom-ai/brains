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

async function listServers(): Promise<HetznerServer[]> {
  const url = `${baseUrl}/servers?label_selector=${encodeURIComponent(labelSelector)}`;
  const response = await fetch(url, { headers });
  const payload = (await readJsonResponse(
    response,
    "Hetzner server lookup",
  )) as {
    servers?: HetznerServer[];
  };
  if (!response.ok || !payload.servers) {
    throw new Error(`Hetzner server lookup failed: ${JSON.stringify(payload)}`);
  }
  return payload.servers;
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
  const payload = (await readJsonResponse(
    response,
    "Hetzner server create",
  )) as {
    server?: HetznerServer;
  };
  if (!response.ok || !payload.server) {
    throw new Error(`Hetzner server create failed: ${JSON.stringify(payload)}`);
  }
  return payload.server;
}

async function getServer(id: number): Promise<HetznerServer> {
  const response = await fetch(`${baseUrl}/servers/${id}`, { headers });
  const payload = (await readJsonResponse(response, "Hetzner server poll")) as {
    server?: HetznerServer;
  };
  if (!response.ok || !payload.server) {
    throw new Error(`Hetzner server poll failed: ${JSON.stringify(payload)}`);
  }
  return payload.server;
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
