import { readJsonResponse, requireEnv } from "./helpers";

const token = requireEnv("CF_API_TOKEN");
const zoneId = requireEnv("CF_ZONE_ID");
const domain = requireEnv("BRAIN_DOMAIN");
const serverIp = requireEnv("SERVER_IP");

const headers: Record<string, string> = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const baseUrl = "https://api.cloudflare.com/client/v4";

interface CloudflareResult {
  success: boolean;
  result?: Array<{ id: string }>;
}

async function upsertRecord(name: string): Promise<void> {
  const lookupUrl = `${baseUrl}/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`;
  const lookup = await fetch(lookupUrl, { headers });
  const payload = (await readJsonResponse(
    lookup,
    "Cloudflare DNS lookup",
  )) as CloudflareResult;
  if (!lookup.ok || !payload.success) {
    throw new Error(`Cloudflare DNS lookup failed: ${JSON.stringify(payload)}`);
  }

  const existing = payload.result?.[0];
  const url = existing
    ? `${baseUrl}/zones/${zoneId}/dns_records/${existing.id}`
    : `${baseUrl}/zones/${zoneId}/dns_records`;

  const response = await fetch(url, {
    method: existing ? "PUT" : "POST",
    headers,
    body: JSON.stringify({
      type: "A",
      name,
      content: serverIp,
      ttl: 1,
      proxied: true,
    }),
  });
  const result = (await readJsonResponse(
    response,
    "Cloudflare DNS upsert",
  )) as CloudflareResult;
  if (!response.ok || !result.success) {
    throw new Error(`Cloudflare DNS upsert failed: ${JSON.stringify(result)}`);
  }
}

await upsertRecord(domain);
