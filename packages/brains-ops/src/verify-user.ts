import type { FetchLike } from "@brains/deploy-support/origin-ca";
import { z } from "@brains/utils/zod";

import { loadPilotRegistry, type ResolvedUser } from "./load-registry";

export interface VerifyPilotUserOptions {
  fetchImpl?: FetchLike;
  logger?: (message: string) => void;
}

export interface FailedCheck {
  name: string;
  message: string;
}

export interface VerifyPilotUserResult {
  handle: string;
  preset: ResolvedUser["preset"];
  domain: string;
  contentRepo: string;
  checks: string[];
  failedChecks: FailedCheck[];
}

const healthResponseSchema = z.looseObject({
  status: z.string().optional(),
  daemons: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        status: z.string().optional(),
        health: z
          .looseObject({
            status: z.string().optional(),
            message: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export async function verifyPilotUser(
  rootDir: string,
  handle: string,
  options: VerifyPilotUserOptions = {},
): Promise<VerifyPilotUserResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registry = await loadPilotRegistry(rootDir);
  const user = registry.users.find((candidate) => candidate.handle === handle);
  if (!user) {
    throw new Error(`Unknown pilot user: ${handle}`);
  }

  const baseUrl = `https://${user.domain}`;
  const checks: string[] = [];
  const failedChecks: FailedCheck[] = [];

  await runCheck(
    "health",
    () => verifyHealth(fetchImpl, baseUrl),
    checks,
    failedChecks,
  );
  await runCheck(
    "mcp-auth-gate",
    () => verifyMcpAuthGate(fetchImpl, baseUrl),
    checks,
    failedChecks,
  );

  if (user.preset === "default") {
    await runCheck(
      "site",
      () => verifyLoads(fetchImpl, `${baseUrl}/`, "site"),
      checks,
      failedChecks,
    );
    await runCheck(
      "cms",
      () => verifyLoads(fetchImpl, `${baseUrl}/cms`, "cms"),
      checks,
      failedChecks,
    );
    options.logger?.(
      "WARN Manual check still required: passkey setup/handoff completed from the setup email.",
    );
  }

  return {
    handle: user.handle,
    preset: user.preset,
    domain: user.domain,
    contentRepo: user.contentRepo,
    checks,
    failedChecks,
  };
}

async function runCheck(
  name: string,
  fn: () => Promise<void>,
  passed: string[],
  failed: FailedCheck[],
): Promise<void> {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failed.push({
      name,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function verifyHealth(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<void> {
  const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/health`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`/health returned ${response.status}, expected 200`);
  }

  const parsed = healthResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `/health response did not match expected shape: ${parsed.error.message}`,
    );
  }
  const health = parsed.data;

  if (health.status && health.status !== "healthy") {
    throw new Error(`/health status is ${health.status}, expected healthy`);
  }

  for (const daemon of health.daemons ?? []) {
    const daemonStatus = daemon.status ?? "unknown";
    const healthStatus = daemon.health?.status;
    if (daemonStatus === "error" || healthStatus === "unhealthy") {
      throw new Error(
        `daemon ${daemon.name ?? "unknown"} is unhealthy (${daemonStatus}/${healthStatus ?? "unknown"})`,
      );
    }
  }
}

async function verifyMcpAuthGate(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<void> {
  const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });

  if (response.status < 400 || response.status >= 500) {
    throw new Error(
      `unauthenticated POST /mcp returned ${response.status}, expected a 4xx auth failure`,
    );
  }
}

async function verifyLoads(
  fetchImpl: FetchLike,
  url: string,
  label: string,
): Promise<void> {
  const response = await fetchWithTimeout(fetchImpl, url, { method: "GET" });
  if (response.status >= 400) {
    throw new Error(
      `${label} ${url} returned ${response.status}, expected < 400`,
    );
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    return await fetchImpl(input, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
