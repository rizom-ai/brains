import type { FetchLike } from "@brains/deploy-support/origin-ca";
import { z } from "@brains/utils/zod";

import { loadPilotRegistry, type ResolvedUser } from "./load-registry";
import { getErrorMessage } from "@brains/utils/error";

export interface VerifyPilotUserOptions {
  fetchImpl?: FetchLike;
  logger?: (message: string) => void;
  operationalRetryAttempts?: number;
  operationalRetryDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface FailedCheck {
  name: string;
  message: string;
}

export interface VerifyPilotUserResult {
  handle: string;
  bundles: ResolvedUser["bundles"];
  domain: string;
  contentRepo: string;
  checks: string[];
  failedChecks: FailedCheck[];
}

const operationalHealthResponseSchema = z.looseObject({
  status: z.string(),
  operationalStatus: z.string(),
  checks: z
    .array(
      z.looseObject({
        name: z.string(),
        status: z.string(),
        message: z.string().optional(),
      }),
    )
    .default([]),
  app: z
    .looseObject({
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
        .default([]),
    })
    .default({ daemons: [] }),
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
  const operationalRetryAttempts = z
    .number()
    .int()
    .positive()
    .max(30)
    .parse(options.operationalRetryAttempts ?? 6);
  const operationalRetryDelayMs = z
    .number()
    .int()
    .nonnegative()
    .max(60_000)
    .parse(options.operationalRetryDelayMs ?? 10_000);
  const sleep =
    options.sleep ??
    ((delayMs: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, delayMs)));

  await runCheck(
    "health",
    () =>
      verifyHealthWithRetry(
        fetchImpl,
        baseUrl,
        operationalRetryAttempts,
        operationalRetryDelayMs,
        sleep,
      ),
    checks,
    failedChecks,
  );
  await runCheck(
    "mcp-auth-gate",
    () => verifyMcpAuthGate(fetchImpl, baseUrl),
    checks,
    failedChecks,
  );

  if (user.bundles.includes("site")) {
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
    bundles: user.bundles,
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
      message: getErrorMessage(err),
    });
  }
}

async function verifyHealthWithRetry(
  fetchImpl: FetchLike,
  baseUrl: string,
  attempts: number,
  delayMs: number,
  sleep: (delayMs: number) => Promise<void>,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await verifyHealth(fetchImpl, baseUrl);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function verifyHealth(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<void> {
  const endpoint = "/health/operate";
  const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${endpoint}`, {
    method: "GET",
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = operationalHealthResponseSchema.safeParse(payload);
  if (!response.ok) {
    const degraded = parsed.success
      ? parsed.data.checks
          .filter((check) => check.status !== "healthy")
          .slice(0, 10)
          .map(
            (check) =>
              `${check.name}: ${boundedStatusMessage(check.message ?? check.status)}`,
          )
      : [];
    throw new Error(
      `${endpoint} returned ${response.status}, expected 200${degraded.length > 0 ? ` (${degraded.join("; ")})` : ""}`,
    );
  }

  if (!parsed.success) {
    throw new Error(
      `${endpoint} response did not match expected shape: ${parsed.error.message}`,
    );
  }
  const health = parsed.data;

  if (health.status !== "ready") {
    throw new Error(`${endpoint} status is ${health.status}, expected ready`);
  }
  if (health.operationalStatus !== "operational") {
    throw new Error(
      `${endpoint} operationalStatus is ${health.operationalStatus}, expected operational`,
    );
  }

  for (const daemon of health.app.daemons) {
    const daemonStatus = daemon.status ?? "unknown";
    const healthStatus = daemon.health?.status;
    if (daemonStatus === "error" || healthStatus === "unhealthy") {
      throw new Error(
        `daemon ${daemon.name ?? "unknown"} is unhealthy (${daemonStatus}/${healthStatus ?? "unknown"})`,
      );
    }
  }
}

function boundedStatusMessage(message: string): string {
  const normalized = message.replaceAll(/\s+/g, " ").trim();
  return normalized.length <= 300
    ? normalized
    : `${normalized.slice(0, 297)}...`;
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
