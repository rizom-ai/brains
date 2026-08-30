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

/**
 * Copied verbatim into generated projects, so this stays dependency-free and
 * checks the payload by hand. readJsonResponse returns unknown; asserting
 * CloudflareResult onto it meant an error body read as `success: undefined`
 * rather than failing here.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCloudflareResult(payload: unknown): CloudflareResult | undefined {
  if (!isRecord(payload)) return undefined;
  if (typeof payload["success"] !== "boolean") return undefined;
  const result = payload["result"];
  if (result === undefined) return { success: payload["success"] };
  if (
    !Array.isArray(result) ||
    !result.every(
      (entry): entry is { id: string } =>
        isRecord(entry) && typeof entry["id"] === "string",
    )
  ) {
    return undefined;
  }
  return { success: payload["success"], result };
}

async function findRecordId(
  name: string,
  type: "A" | "CNAME",
): Promise<string | undefined> {
  const lookupUrl = `${baseUrl}/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`;
  const lookup = await fetch(lookupUrl, { headers });
  const raw = await readJsonResponse(lookup, "Cloudflare DNS lookup");
  const payload = readCloudflareResult(raw);
  if (!lookup.ok || !payload?.success) {
    throw new Error(`Cloudflare DNS lookup failed: ${JSON.stringify(raw)}`);
  }

  return payload.result?.[0]?.id;
}

async function upsertRecord(name: string): Promise<void> {
  // Prefer an existing A record. If the hostname currently has a CNAME,
  // replace that CNAME in-place so deploys can claim legacy www aliases.
  const existing =
    (await findRecordId(name, "A")) ?? (await findRecordId(name, "CNAME"));
  const url = existing
    ? `${baseUrl}/zones/${zoneId}/dns_records/${existing}`
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
  const raw = await readJsonResponse(response, "Cloudflare DNS upsert");
  const result = readCloudflareResult(raw);
  if (!response.ok || !result?.success) {
    throw new Error(`Cloudflare DNS upsert failed: ${JSON.stringify(raw)}`);
  }
}

await upsertRecord(domain);
